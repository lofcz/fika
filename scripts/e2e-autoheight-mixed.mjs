/**
 * Auto-height must track mixed font sizes: typing body text, then enlarging a
 * FRAGMENT of it, must grow the text box to fit. Regression: the box stays at
 * the small-text height and the big fragment overflows.
 *
 *   node scripts/e2e-autoheight-mixed.mjs
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

const ELEMENT = {
  id: 'e2e-autoheight-text',
  type: 'text',
  left: 80,
  top: 80,
  width: 420,
  height: 60,
  rotate: 0,
  content: '<p>Auto height probe</p>',
  defaultFontName: 'Arial',
  defaultColor: '#111111',
  fill: '',
  lineHeight: 1.4,
  inset: [8, 8, 8, 8],
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
  await page.evaluate(() => {
    document.querySelectorAll('[data-react-scan], #react-scan-root').forEach(el => el.remove())
  })
  await waitForHooks(page)

  // Inject a fresh slide with one auto-height text element.
  const injected = await page.evaluate((el) => {
    const slides = window.__FIKA_SLIDES__
    const main = window.__FIKA_MAIN__
    slides.getState().addSlide({ id: `e2e-ah-${Date.now()}`, elements: [el] })
    main.getState().setActiveElementIdList([el.id])
    main.getState().setEditorareaFocus(true)
    return true
  }, ELEMENT)
  if (!injected) throw new Error('store hook missing')
  await page.waitForSelector(`#editable-element-${ELEMENT.id}`, { state: 'attached', timeout: 15000 })
  await sleep(300)

  const state = () => page.evaluate((id) => {
    const slides = window.__FIKA_SLIDES__.getState()
    const slide = slides.slides[slides.slides.length - 1]
    const el = slide.elements.find(e => e.id === id)
    const root = document.getElementById(`editable-element-${id}`)
    const box = root?.firstElementChild
    const pm = root?.querySelector('.ProseMirror')
    const scale = (() => {
      const vp = root?.closest('[class*=viewport-wrapper]')
      const screenW = root?.getBoundingClientRect().width
      return el && screenW ? screenW / el.width : 1
    })()
    return {
      storeHeight: el?.height,
      fixedHeight: !!el?.fixedHeight,
      domBoxHeight: box ? box.offsetHeight || box.getBoundingClientRect().height : null,
      rootStyleHeight: root?.style.height ?? null,
      boxStyleHeight: box?.style.height ?? null,
      boxOffsetHeight: box?.offsetHeight ?? null,
      rootOffsetHeight: root?.offsetHeight ?? null,
      canvasScale: scale,
      pmScrollHeight: pm?.scrollHeight ?? null,
      zoom: (() => {
        const host = root?.querySelector('[data-text-fit-host]')
        return host ? getComputedStyle(host).zoom : null
      })(),
      content: el?.content,
    }
  }, ELEMENT.id)

  // Fill the box with several lines so growth forces re-wrap, then enlarge a mid fragment.
  await page.evaluate((id) => {
    const root = document.getElementById(`editable-element-${id}`)
    const pm = root?.querySelector('.ProseMirror')
    const view = pm?.__pmView
    if (!view) return
    const tr = view.state.tr.delete(0, view.state.doc.content.size)
    view.dispatch(tr.insertText('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen'))
  }, ELEMENT.id)
  await sleep(500)

  const before = await state()
  rec('starts auto-height (not fixed)', before.fixedHeight === false, before)
  rec('multi-line body settled', before.storeHeight > 60, before.storeHeight)

  // Select the last word and apply a fontsize mark — exactly what the toolbar's
  // fontsize command does (schema.marks.fontsize.create + addMark over a range).
  const applied = await page.evaluate((id) => {
    const root = document.getElementById(`editable-element-${id}`)
    const pm = root?.querySelector('.ProseMirror')
    const view = pm?.__pmView
    if (!view) return 'no-view'
    const { state } = view
    // Enlarge a mid-paragraph word ("seven") to a size that forces taller lines.
    const text = state.doc.textContent
    const start = text.indexOf('seven')
    const from = start + 1 // +1 for the leading paragraph node offset
    const to = from + 5
    const mark = state.schema.marks.fontsize.create({ fontsize: '72px' })
    view.dispatch(state.tr.addMark(from, to, mark))
    return 'ok'
  }, ELEMENT.id)
  rec('applied fontsize mark to fragment', applied === 'ok', applied)
  // Poll until the box height settles (store height stable across reads).
  let settled = null
  for (let i = 0; i < 30; i++) {
    await sleep(100)
    const s = await state()
    if (settled && settled.storeHeight === s.storeHeight && settled.domBoxHeight === s.domBoxHeight) { settled = s; break }
    settled = s
  }
  rec('box height settled', !!settled, settled)
  rec(
    'content fits inside the outer box after settle',
    settled && settled.pmScrollHeight <= settled.domBoxHeight + 1,
    settled && { pmScrollHeight: settled.pmScrollHeight, box: settled.domBoxHeight, store: settled.storeHeight },
  )

  const ancestry = await page.evaluate((id) => {
    const root = document.getElementById(`editable-element-${id}`)
    const pm = root?.querySelector('.ProseMirror')
    if (!pm) return null
    const chain = []
    let node = pm
    while (node && node !== document.body && chain.length < 6) {
      const cs = getComputedStyle(node)
      chain.push({
        cls: (node.className || '').split(' ').filter(c => c).slice(0, 2).join('.'),
        oh: node.offsetHeight,
        sh: node.scrollHeight,
        overflowY: cs.overflowY,
        height: cs.height,
        lineHeight: cs.lineHeight,
        padding: cs.padding,
      })
      node = node.parentElement
    }
    const bigSpan = pm.querySelector('span[style*="72px"]')
    const bigCs = bigSpan ? getComputedStyle(bigSpan) : null
    const p = pm.querySelector('p')
    const pCs = p ? getComputedStyle(p) : null
    return {
      chain,
      bigSpan: bigCs ? { lineHeight: bigCs.lineHeight, fontSize: bigCs.fontSize, display: bigCs.display, va: bigCs.verticalAlign } : null,
      p: pCs ? { lineHeight: pCs.lineHeight, fontSize: pCs.fontSize } : null,
    }
  }, ELEMENT.id)
  console.log('ANCESTRY', JSON.stringify(ancestry, null, 1))

  const after = await state()
  rec('fragment got the big font in the HTML', /font-size:\s*72px/.test(after.content || ''), after.content)
  rec(
    'box grew to fit the big fragment',
    after.storeHeight > before.storeHeight + 10,
    { before: before.storeHeight, after: after.storeHeight },
  )
  rec(
    'text does not overflow the box',
    after.pmScrollHeight == null || after.domBoxHeight == null
      ? false
      : after.pmScrollHeight <= after.domBoxHeight + 6,
  )
  // Now shrink the fragment back to body size — box must shrink to fit again.
  await page.evaluate((id) => {
    const root = document.getElementById(`editable-element-${id}`)
    const view = root?.querySelector('.ProseMirror')?.__pmView
    if (!view) return
    const { state } = view
    const text = state.doc.textContent
    const start = text.indexOf('seven')
    const mark = state.schema.marks.fontsize.create({ fontsize: '16px' })
    view.dispatch(state.tr.addMark(start + 1, start + 6, mark))
  }, ELEMENT.id)
  let shrunk = null
  for (let i = 0; i < 30; i++) {
    await sleep(100)
    const s = await state()
    if (shrunk && shrunk.storeHeight === s.storeHeight) { shrunk = s; break }
    shrunk = s
  }
  rec(
    'box shrinks back after fragment restored',
    shrunk && shrunk.storeHeight < after.storeHeight - 10,
    shrunk && { afterBig: after.storeHeight, afterShrink: shrunk.storeHeight },
  )
  rec(
    'shrunk box still fits its content',
    shrunk && shrunk.pmScrollHeight <= shrunk.domBoxHeight + 6,
    shrunk && { pmScrollHeight: shrunk.pmScrollHeight, box: shrunk.domBoxHeight, store: shrunk.storeHeight },
    {
      pmScrollHeight: after.pmScrollHeight,
      domBoxHeight: after.domBoxHeight,
      zoom: after.zoom,
      storeHeight: after.storeHeight,
      boxOffsetHeight: after.boxOffsetHeight,
      rootOffsetHeight: after.rootOffsetHeight,
      rootStyleHeight: after.rootStyleHeight,
      boxStyleHeight: after.boxStyleHeight,
      canvasScale: after.canvasScale,
    },
  )
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
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} failed`)
  process.exit(1)
}
console.log(`\n${results.length}/${results.length} passed`)
