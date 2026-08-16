/**
 * Regression sweep: plain text box (text-tool style, drawn tall) + auto/fixed
 * toggles + paragraph alignment + RESIZE DRAGS + editing states. Bug report:
 * after playing with auto/fixed height and alignment, auto height got stuck
 * (box stops hugging text, typing no longer updates it); a resize drag fixed
 * it. Smoking gun we look for per flow: auto-mode box whose painted content
 * box carries an inline px height instead of `auto`, or store/paint height
 * diverging from the text extent, or typing not moving the height.
 *
 *   node scripts/e2e-autoheight-stuck.mjs
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const DEV_PORTS = [5173, 5174, 5175, 5176]

async function isFikaDev(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) return false
    const html = await res.text()
    return html.includes('fika-shell') || html.includes('>fika<')
  }
  catch { return false }
}
async function findFikaDev() {
  for (const port of DEV_PORTS) {
    const url = `http://127.0.0.1:${port}/`
    if (await isFikaDev(url)) return url
  }
  return null
}
async function waitForDev(timeoutMs = 60000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const url = await findFikaDev()
    if (url) return url
    await sleep(400)
  }
  return null
}
async function waitForHooks(page) {
  const start = Date.now()
  while (Date.now() - start < 20000) {
    if (await page.evaluate(() => !!(window.__FIKA_SLIDES__ && window.__FIKA_MAIN__))) return
    await sleep(250)
  }
  throw new Error('fika hooks missing')
}

const results = []
const rec = (name, pass, measured) => results.push({ name, pass: !!pass, measured })

const browser = await chromium.launch({ headless: true })
let child = null
try {
  let devUrl = await waitForDev(1500)
  if (!devUrl) {
    child = spawn('npm', ['run', 'dev'], { cwd: root, shell: true, stdio: 'ignore' })
    devUrl = await waitForDev(90000)
    if (!devUrl) throw new Error('fika dev server did not start')
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  await page.goto(devUrl, { waitUntil: 'networkidle' })
  await page.getByText('Add slide').waitFor({ timeout: 90000 })
  await page.evaluate(() => document.querySelectorAll('[data-react-scan], #react-scan-root').forEach(el => el.remove()))
  await waitForHooks(page)

  // Slide 2 via the real UI.
  await page.getByText('Add slide').click()
  await sleep(400)

  let seq = 0
  // Plain text box the way the text tool creates it: no fixedHeight, drawn tall+narrow.
  const createTextBox = async () => {
    const id = await page.evaluate(slot => {
      const store = window.__FIKA_SLIDES__
      const slides = store.getState()
      const nanoid = () => Math.random().toString(36).slice(2, 12)
      const el = {
        type: 'text',
        id: nanoid(),
        left: 120 + (slot % 3) * 220,
        top: 90 + Math.floor(slot / 3) * 40,
        width: 160,
        height: 320,
        content: '',
        rotate: 0,
        defaultFontName: slides.theme.fontName,
        defaultColor: '#111111',
      }
      slides.addElement(el)
      const main = window.__FIKA_MAIN__.getState()
      main.setActiveElementIdList([el.id])
      main.setEditorareaFocus(true)
      return el.id
    }, seq)
    seq += 1
    await sleep(250)
    return id
  }

  const stateOf = id => page.evaluate(elId => {
    const slides = window.__FIKA_SLIDES__.getState()
    const slide = slides.slides[slides.slideIndex]
    const el = slide.elements.find(e => e.id === elId)
    const root = document.getElementById(`editable-element-${elId}`)
    const content = root?.querySelector('[data-live-box]')
    const pm = root?.querySelector('.ProseMirror, .ProseMirror-static')
    const scale = content && el ? content.getBoundingClientRect().width / el.width : 1
    let textExtent = null
    if (pm) {
      const range = document.createRange()
      range.selectNodeContents(pm)
      const rects = [...range.getClientRects()].filter(r => r.height > 0.5)
      range.detach()
      if (rects.length) {
        textExtent = (Math.max(...rects.map(r => r.bottom)) - Math.min(...rects.map(r => r.top))) / scale
      }
    }
    return {
      storeHeight: el?.height,
      fixedHeight: !!el?.fixedHeight,
      contentStyleHeight: content?.style.height ?? null,
      autoAttr: content?.hasAttribute('data-live-auto-height') ?? null,
      contentBoxHeight: content ? content.getBoundingClientRect().height / scale : null,
      textExtent,
    }
  }, id)

  const settle = async id => {
    let prev = null
    let cur = null
    for (let i = 0; i < 25; i++) {
      await sleep(100)
      cur = await stateOf(id)
      if (prev && prev.storeHeight === cur.storeHeight && prev.contentBoxHeight === cur.contentBoxHeight) break
      prev = cur
    }
    return cur
  }

  const select = id => page.evaluate(elId => {
    const main = window.__FIKA_MAIN__.getState()
    main.setActiveElementIdList([elId])
    main.setEditorareaFocus(true)
  }, id)

  const enterEdit = async id => {
    await page.evaluate(elId => {
      const main = window.__FIKA_MAIN__.getState()
      main.setActiveElementIdList([elId])
      main.setEditingElementId(elId)
      main.setEditorareaFocus(true)
    }, id)
    await sleep(250)
    await page.evaluate(elId => {
      const root = document.getElementById(`editable-element-${elId}`)
      const pm = root?.querySelector('.ProseMirror, .prosemirror-editor')
      const view = pm?.__pmView
      if (view) view.focus()
      else if (pm) pm.focus()
    }, id)
    await sleep(120)
  }

  const exitEdit = async id => {
    await page.keyboard.press('Escape')
    await page.evaluate(() => window.__FIKA_MAIN__.getState().setEditingElementId(''))
    await sleep(200)
    await select(id)
    await sleep(200)
  }

  const type = async (id, lines) => {
    await enterEdit(id)
    for (let i = 0; i < lines.length; i++) {
      await page.keyboard.type(lines[i], { delay: 4 })
      if (i < lines.length - 1) await page.keyboard.press('Enter')
    }
    await sleep(150)
    await exitEdit(id)
  }

  const typeMore = async (id, extra) => {
    await enterEdit(id)
    await page.keyboard.press('Control+ArrowDown')
    await page.keyboard.type(extra, { delay: 4 })
    await sleep(150)
    await exitEdit(id)
  }

  const clickPanel = async sel => {
    await page.locator(sel).first().click({ force: true })
    await sleep(300)
  }

  const dragHandle = async (id, handle, dxSlide, dySlide) => {
    await select(id)
    await sleep(150)
    const box = await page.evaluate(({ elId, h }) => {
      const op = document.getElementById(`operate-element-${elId}`)
      const handleEl = op?.querySelector(`[data-resize-handle="${h}"]`)
      if (!handleEl) return null
      const r = handleEl.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    }, { elId: id, h: handle })
    if (!box) throw new Error(`handle ${handle} not found`)
    const { width } = await page.evaluate(elId => {
      const slides = window.__FIKA_SLIDES__.getState()
      const slide = slides.slides[slides.slideIndex]
      return { width: slide.elements.find(e => e.id === elId)?.width ?? 160 }
    }, id)
    const contentW = await page.evaluate(elId => {
      const content = document.getElementById(`editable-element-${elId}`)?.querySelector('[data-live-box]')
      return content ? content.getBoundingClientRect().width : null
    }, id)
    const scale = contentW / width
    await page.mouse.move(box.x, box.y)
    await page.mouse.down()
    for (let step = 1; step <= 10; step++) {
      await page.mouse.move(box.x + dxSlide * scale * step / 10, box.y + dySlide * scale * step / 10, { steps: 1 })
      await sleep(16)
    }
    await page.mouse.up()
    await sleep(350)
  }

  // Final verification for every flow: must be in auto mode and alive.
  const verifyAutoAlive = async (flow, id) => {
    const before = await settle(id)
    rec(`${flow}: auto mode in store`, before.fixedHeight === false, before)
    rec(
      `${flow}: painted box is auto (no stuck inline px)`,
      before.autoAttr === true && before.contentStyleHeight === 'auto',
      before,
    )
    rec(
      `${flow}: box hugs its text`,
      before.textExtent != null && Math.abs(before.storeHeight - before.textExtent) <= 34,
      before,
    )
    const hBefore = before.storeHeight
    await typeMore(id, 'qqq www eee rrr')
    const after = await settle(id)
    rec(`${flow}: height reacts to typing`, after.storeHeight !== hBefore, { hBefore, after })
    rec(
      `${flow}: box still hugs text after typing`,
      after.textExtent != null && Math.abs(after.storeHeight - after.textExtent) <= 34,
      after,
    )
    rec(
      `${flow}: painted box still auto after typing`,
      after.autoAttr === true && after.contentStyleHeight === 'auto',
      after,
    )
  }

  const LINE_SET = ['df', 'dsfdsf', 'dsf', 'dsfdss']

  // Flow A — drag the WIDTH handle of an AUTO box, then keep typing.
  {
    const id = await createTextBox()
    await type(id, LINE_SET)
    await dragHandle(id, 'right', 60, 0)
    await verifyAutoAlive('A width-drag auto + type', id)
  }

  // Flow B — fixed + tall drag + vAlign + align cycling, then back to auto, type.
  {
    const id = await createTextBox()
    await type(id, LINE_SET)
    await clickPanel('[data-height-mode="fixed"]')
    await clickPanel('button:has(svg.lucide-align-vertical-justify-center)')
    await dragHandle(id, 'bottom', 0, 120)
    await clickPanel('button:has(svg.lucide-text-align-center)')
    await clickPanel('button:has(svg.lucide-text-align-end)')
    await clickPanel('[data-height-mode="auto"]')
    await verifyAutoAlive('B fixed-drag-align-auto', id)
  }

  // Flow C — toggles clicked WHILE the editor is focused (mid-editing).
  {
    const id = await createTextBox()
    await type(id, LINE_SET)
    await enterEdit(id)
    await clickPanel('[data-height-mode="fixed"]')
    await clickPanel('button:has(svg.lucide-text-align-center)')
    await clickPanel('[data-height-mode="auto"]')
    await page.keyboard.type(' extra line words', { delay: 4 })
    await sleep(150)
    await exitEdit(id)
    await verifyAutoAlive('C toggles while editing', id)
  }

  // Flow D — drag in fixed mode THEN toggle auto THEN type.
  {
    const id = await createTextBox()
    await type(id, LINE_SET)
    await clickPanel('[data-height-mode="fixed"]')
    await dragHandle(id, 'right-bottom', 40, 100)
    await clickPanel('[data-height-mode="auto"]')
    await verifyAutoAlive('D fixed-drag then auto', id)
  }

  // Flow E — auto box, width-only drag (left handle), then type.
  {
    const id = await createTextBox()
    await type(id, LINE_SET)
    await dragHandle(id, 'right', 60, 0)
    await verifyAutoAlive('E width drag on auto', id)
  }

  // Flow F — the original sequence from the first repro (panel only, no drags).
  {
    const id = await createTextBox()
    await type(id, LINE_SET)
    await clickPanel('[data-height-mode="auto"]')
    await clickPanel('button:has(svg.lucide-text-align-center)')
    await clickPanel('button:has(svg.lucide-text-align-end)')
    await clickPanel('button:has(svg.lucide-text-align-start)')
    await clickPanel('[data-height-mode="fixed"]')
    await clickPanel('button:has(svg.lucide-align-vertical-justify-center)')
    await clickPanel('button:has(svg.lucide-align-vertical-justify-start)')
    await clickPanel('button:has(svg.lucide-text-align-center)')
    await clickPanel('[data-height-mode="auto"]')
    await verifyAutoAlive('F panel-only sequence', id)
  }
}
finally {
  await browser.close()
  if (child) child.kill()
}

const failed = results.filter(r => !r.pass)
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}`)
  if (!r.pass && r.measured) console.log('   ', JSON.stringify(r.measured))
}
if (failed.length) { console.error(`\n${failed.length}/${results.length} failed`); process.exit(1) }
console.log(`\n${results.length}/${results.length} passed`)
