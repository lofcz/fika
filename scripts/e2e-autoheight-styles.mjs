/**
 * Auto-height must track style changes on text boxes. Regression (imported
 * PPTX shape-text titles): after switching a box to auto height, enlarging the
 * font (panel +/- or a preset) left the store height at the old value, so the
 * text overflowed the selection border and the rail thumbnail clipped it.
 * Style commands must also land on a merely-selected shape (no edit session).
 *
 *   node scripts/e2e-autoheight-styles.mjs
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { JAN_HUS_PPTX } from '../tests/fixtures/paths.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DEV_PORTS = [5173, 5174, 5175, 5176]
const sleep = ms => new Promise(r => setTimeout(r, ms))
const NEEDLE = 'Jan Hus a T. G. Masaryk'

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
async function waitIdle(page) {
  await page.waitForSelector('[data-thumbnail-slide] canvas[data-canvas-painted]', { timeout: 20000 })
  await sleep(500)
}

const results = []
const rec = (name, pass, measured) => results.push({ name, pass: !!pass, measured })

const browser = await chromium.launch({ headless: true })
let child = null
try {
  if (!existsSync(JAN_HUS_PPTX)) throw new Error(`fixture missing: ${JAN_HUS_PPTX}`)
  let devUrl = await waitForDev(1500)
  if (!devUrl) {
    child = spawn('npm', ['run', 'dev'], { cwd: root, shell: true, stdio: 'ignore' })
    devUrl = await waitForDev(90000)
    if (!devUrl) throw new Error('fika dev server did not start')
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(devUrl, { waitUntil: 'networkidle' })
  await page.getByText('Add slide').waitFor({ timeout: 90000 })
  await page.evaluate(() => {
    document.querySelectorAll('[data-react-scan]').forEach(n => n.remove())
    const rs = document.getElementById('react-scan-root')
    if (rs) rs.remove()
  })
  await waitForHooks(page)

  const input = page.locator('input[type=file][accept*=".pptx"]')
  await input.setInputFiles(JAN_HUS_PPTX)
  const replace = page.getByText('Replace', { exact: true })
  if (await replace.waitFor({ timeout: 10000 }).then(() => true).catch(() => false)) {
    await replace.click()
  }
  await page.getByText('Jan Hus', { exact: false }).first().waitFor({ timeout: 180000 })
  await page.evaluate(() => window.__FIKA_SLIDES__.getState().updateSlideIndex(0))
  await sleep(800)

  const elId = await page.evaluate((needle) => {
    const slides = window.__FIKA_SLIDES__.getState()
    const element = slides.slides[0].elements.find(el => (el.content || el.text?.content || '').includes(needle))
    return element?.id
  }, NEEDLE)
  if (!elId) throw new Error('jan-hus title element not found')

  const read = () => page.evaluate((id) => {
    const slides = window.__FIKA_SLIDES__.getState()
    const slide = slides.slides[slides.slideIndex]
    const el = slide.elements.find(e => e.id === id)
    const text = el?.type === 'shape' ? el.text : el
    const root = document.getElementById(`editable-element-${id}`)
    const pm = root?.querySelector('.ProseMirror, .ProseMirror-static')
    const viewport = [...document.querySelectorAll('[class*=viewport-wrapper]')].toSorted((a, b) => {
      const ar = a.getBoundingClientRect()
      const br = b.getBoundingClientRect()
      return (br.width * br.height) - (ar.width * ar.height)
    })[0]
    const scale = viewport ? viewport.getBoundingClientRect().width / slides.viewportSize : 1
    return {
      storeH: el?.height,
      fixedHeight: (el?.type === 'shape' ? el.text?.fixedHeight : el?.fixedHeight) ?? null,
      pmScrollH: pm ? Math.round(pm.scrollHeight / scale) : null,
      fontSize: /font-size:\s*(\d+(?:\.\d+)?)px/.exec(text?.content || '')?.[1] ?? null,
    }
  }, elId)

  /** Line count in the rail thumbnail — the thumb renders the same DOM. */
  const thumbLines = () => page.evaluate((id) => {
    const slides = window.__FIKA_SLIDES__.getState()
    const slide = slides.slides[slides.slideIndex]
    const host = [...document.querySelectorAll('[data-thumbnail-slide]')].find(n => n.getAttribute('data-thumbnail-slide') === slide.id)
    const pm = host?.querySelector(`#screen-element-${id} .ProseMirror, #screen-element-${id} .ProseMirror-static`)
    if (!pm) return { ok: false }
    const walker = document.createTreeWalker(pm, NodeFilter.SHOW_TEXT)
    const tops = new Set()
    let n
    while ((n = walker.nextNode())) {
      const r = document.createRange()
      r.selectNodeContents(n)
      for (const rect of r.getClientRects()) {
        if (rect.height > 0.5) tops.add(Math.round(rect.top))
      }
      r.detach()
    }
    return { ok: true, lines: tops.size }
  }, elId)

  const editorLines = () => page.evaluate((id) => {
    const root = document.getElementById(`editable-element-${id}`)
    const pm = root?.querySelector('.ProseMirror, .ProseMirror-static')
    if (!pm) return { ok: false }
    const walker = document.createTreeWalker(pm, NodeFilter.SHOW_TEXT)
    const tops = new Set()
    let n
    while ((n = walker.nextNode())) {
      const r = document.createRange()
      r.selectNodeContents(n)
      for (const rect of r.getClientRects()) {
        if (rect.height > 0.5) tops.add(Math.round(rect.top))
      }
      r.detach()
    }
    return { ok: true, lines: tops.size }
  }, elId)

  // --- select the title, switch it to auto height ---
  await page.evaluate((id) => {
    const main = window.__FIKA_MAIN__
    main.getState().setEditingElementId('')
    main.getState().setActiveElementIdList([id])
    main.getState().setEditorareaFocus(true)
  }, elId)
  await sleep(400)
  await page.locator('[data-height-mode=auto]').first().click({ timeout: 8000 })
  await sleep(600)

  let s = await read()
  rec('title switched to auto height', s.fixedHeight === false, s)
  const autoBase = s

  // --- style change while SELECTED (no edit session): font-size + twice ---
  for (let i = 0; i < 2; i++) {
    const plus = page.locator('[class*=font-size-control] [class*=format-chip]').last()
    await plus.click({ timeout: 8000 })
    await sleep(600)
  }
  // poll until the auto height settles
  let settled = null
  for (let i = 0; i < 30; i++) {
    await sleep(100)
    const a = await read()
    const b = await read()
    if (a.storeH === b.storeH) { settled = b; break }
    settled = b
  }
  s = settled ?? await read()
  rec(
    'font-size command lands on the selected box',
    s.fontSize !== null && +s.fontSize > +(autoBase.fontSize ?? 0),
    { before: autoBase.fontSize, after: s.fontSize },
  )
  rec(
    'auto height grows with the bigger font (selected)',
    s.storeH > autoBase.storeH + 3,
    { before: autoBase.storeH, after: s.storeH, pmScrollH: s.pmScrollH },
  )
  rec(
    'text fits inside the auto box (selected)',
    s.storeH >= s.pmScrollH + 12,
    { storeH: s.storeH, pmScrollH: s.pmScrollH },
  )
  const fit = await thumbLines()
  const ed = await editorLines()
  rec(
    'thumbnail matches the editor line count (selected)',
    fit.ok && ed.ok && Math.abs(fit.lines - ed.lines) <= 1,
    { thumb: fit, editor: ed },
  )
  const selectedState = s

  // --- style change while EDITING: apply the Large title preset ---
  const box = await page.locator(`#editable-element-${elId} [data-live-box]`).boundingBox()
  await page.mouse.dblclick(box.x + 80, box.y + 12)
  await sleep(500)
  await page.keyboard.press('Control+a')
  await sleep(200)
  const preset = page.locator('[class*=preset-card]', { hasText: /Large title|Velký titulek|Veľký titulok/i }).first()
  await preset.click({ timeout: 8000 })
  // poll until the auto height settles after the preset
  let settledEdit = null
  for (let i = 0; i < 30; i++) {
    await sleep(100)
    const a = await read()
    const b = await read()
    if (a.storeH === b.storeH) { settledEdit = b; break }
    settledEdit = b
  }
  s = settledEdit ?? await read()
  rec(
    'preset applied while editing',
    s.fontSize !== null && +s.fontSize > +(selectedState.fontSize ?? 0),
    { before: selectedState.fontSize, after: s.fontSize },
  )
  rec(
    'auto height grows with the preset font (editing)',
    s.storeH > selectedState.storeH + 3,
    { before: selectedState.storeH, after: s.storeH, pmScrollH: s.pmScrollH },
  )
  rec(
    'text fits inside the auto box (editing)',
    s.storeH >= s.pmScrollH + 12,
    { storeH: s.storeH, pmScrollH: s.pmScrollH },
  )

  await waitIdle(page)
  const fit2 = await thumbLines()
  const ed2 = await editorLines()
  rec(
    'thumbnail matches the editor line count (editing)',
    fit2.ok && ed2.ok && Math.abs(fit2.lines - ed2.lines) <= 1,
    { thumb: fit2, editor: ed2 },
  )

  // --- shrink back: font-size - until smaller than the start ---
  for (let i = 0; i < 6; i++) {
    const minus = page.locator('[class*=font-size-control] [class*=format-chip]').first()
    await minus.click({ timeout: 8000 })
    await sleep(450)
  }
  let settledShrink = null
  for (let i = 0; i < 30; i++) {
    await sleep(100)
    const a = await read()
    const b = await read()
    if (a.storeH === b.storeH) { settledShrink = b; break }
    settledShrink = b
  }
  s = settledShrink ?? await read()
  const peak = settledEdit?.storeH ?? selectedState.storeH
  rec(
    'auto height shrinks when the font shrinks',
    s.storeH < peak - 8,
    { peak, after: s.storeH, fontSize: s.fontSize },
  )

  // ---- resize drops must sync immediately (typing should not be needed) ----
  // Regression: mid-drag ResizeObserver fires are swallowed by the gesture
  // guards; after drop no further resize fires, so a widened box kept its
  // stale tall height (and narrowed shapes failed to grow) until a keystroke.
  const readAuto = () => page.evaluate((id) => {
    const slides = window.__FIKA_SLIDES__.getState()
    const el = slides.slides[slides.slideIndex].elements.find(e => e.id === id)
    const root = document.getElementById(`editable-element-${id}`)
    const pm = root?.querySelector('.ProseMirror, .ProseMirror-static')
    if (!el || !pm) return null
    const text = el.type === 'shape' ? el.text : el
    return {
      w: Math.round(el.width),
      h: Math.round(el.height),
      pmScrollH: pm.scrollHeight,
      insetSum: ((el.type === 'shape' ? text.inset : el.inset) || [10, 10, 10, 10])[0]
        + ((el.type === 'shape' ? text.inset : el.inset) || [10, 10, 10, 10])[2],
    }
  }, elId)
  await page.evaluate((id) => {
    const main = window.__FIKA_MAIN__
    main.getState().setEditingElementId('')
    main.getState().setActiveElementIdList([id])
    main.getState().setEditorareaFocus(true)
  }, elId)
  await sleep(400)

  // live check: hold the drag OPEN and read the operate chrome vs the height
  // the text will settle at on drop — the chrome must track mid-drag rewraps
  const operateHeld = async (dx) => {
    const handle = page.locator(`#operate-element-${elId} [data-resize-handle="right"]`).first()
    const hb = await handle.boundingBox()
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
    await page.mouse.down()
    await page.mouse.move(hb.x + hb.width / 2 + dx, hb.y + hb.height / 2, { steps: 10 })
    await sleep(500)
    const mid = await page.evaluate((id) => {
      const operate = document.getElementById(`operate-element-${id}`)
      const scale = window.__FIKA_MAIN__.getState().canvasScale
      if (!operate) return null
      const rect = operate.getBoundingClientRect()
      return {
        h: Math.round(rect.height / scale),
        w: Math.round(rect.width / scale),
        l: Math.round(rect.left / scale),
        t: Math.round(rect.top / scale),
      }
    }, elId)
    await page.mouse.up()
    await sleep(600)
    const dropped = await readAuto()
    return { mid, dropped: dropped ?? null }
  }
  const liveNarrow = await operateHeld(-300)
  rec(
    'resize drag: box tracks text height LIVE and width follows the pointer (narrow)',
    liveNarrow.mid != null && liveNarrow.dropped != null
      && Math.abs(liveNarrow.mid.h - liveNarrow.dropped.h) <= 3
      && Math.abs(liveNarrow.mid.w - liveNarrow.dropped.w) <= 3,
    liveNarrow,
  )
  const liveWiden = await operateHeld(240)
  rec(
    'resize drag: box tracks text height LIVE and width follows the pointer (widen)',
    liveWiden.mid != null && liveWiden.dropped != null
      && Math.abs(liveWiden.mid.h - liveWiden.dropped.h) <= 3
      && Math.abs(liveWiden.mid.w - liveWiden.dropped.w) <= 3,
    liveWiden,
  )
  const widen = liveWiden.dropped != null ? { h: liveWiden.dropped.h } : null
  // the box must stay stable without any keystroke
  await sleep(400)
  const settledNow = await readAuto()
  rec(
    'resize drop: box stays synced without typing',
    settledNow != null && widen != null && settledNow.h === widen.h,
    { settledNow, widen },
  )

  await page.close()
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

