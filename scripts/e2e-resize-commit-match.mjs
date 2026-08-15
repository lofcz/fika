/**
 * Live preview must equal the painted element after mouseup.
 * Shape leftover viewBox / table row reflow after drop are regressions.
 *
 *   node scripts/e2e-resize-commit-match.mjs
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const DEV_PORTS = [5173, 5174, 5175, 5176]
const MATCH_PX = 4
const PNG_1X1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const CASES = [
  [1, 'Shape grow-corner path width stays after drop'],
  [2, 'Shape grow-corner path height stays after drop'],
  [3, 'Shape grow-corner path matches the operate box after drop'],
  [4, 'Shape grow-corner does not leave a leftover SVG viewBox'],
  [5, 'Shape shrink-corner path width stays after drop'],
  [6, 'Shape shrink-corner path height stays after drop'],
  [7, 'Shape shrink-corner path matches the operate box after drop'],
  [8, 'Shape right-grow path width stays after drop'],
  [9, 'Shape bottom-grow path height stays after drop'],
  [10, 'Shape store size matches the painted box after drop'],
  [11, 'Header-table grow-height top row stays after drop'],
  [12, 'Header-table grow-height rows stay even after drop'],
  [13, 'Header-table shrink-height top row stays after drop'],
  [14, 'Header-table shrink-height rows stay even after drop'],
  [15, 'Header-table shrink-width painted table stays after drop'],
  [16, 'Text grow-width box stays after drop'],
  [17, 'Text grow-height box stays after drop'],
  [18, 'Image grow-corner box stays after drop'],
  [19, 'Chart grow-width operate box stays after drop'],
  [20, 'Latex grow-height box stays after drop'],
]

const shapeEl = {
  id: 'e2e-match-shape',
  type: 'shape',
  left: 80,
  top: 80,
  width: 200,
  height: 130,
  rotate: 0,
  viewBox: [100, 100],
  path: 'M 0 0 L 100 0 L 100 100 L 0 100 Z',
  fixedRatio: false,
  fill: '#4472c4',
  text: {
    content: '<p>Shape</p>',
    defaultFontName: 'Arial',
    defaultColor: '#ffffff',
    align: 'middle',
  },
}

const headerTable = {
  id: 'e2e-match-table',
  type: 'table',
  left: 80,
  top: 80,
  width: 300,
  height: 160,
  rotate: 0,
  outline: { width: 1, color: '#333333', style: 'solid' },
  colWidths: [0.5, 0.5],
  cellMinHeight: 48,
  theme: { color: '#111111', rowHeader: true, rowFooter: false, colHeader: false, colFooter: false },
  data: [
    [
      { id: 'h1', colspan: 1, rowspan: 1, text: 'Head A' },
      { id: 'h2', colspan: 1, rowspan: 1, text: 'Head B' },
    ],
    [
      { id: 'b1', colspan: 1, rowspan: 1, text: 'Body A' },
      { id: 'b2', colspan: 1, rowspan: 1, text: 'Body B' },
    ],
  ],
}

const textEl = {
  id: 'e2e-match-text',
  type: 'text',
  left: 80,
  top: 80,
  width: 220,
  height: 120,
  rotate: 0,
  content: '<p>Resize text</p>',
  defaultFontName: 'Arial',
  defaultColor: '#111111',
  fill: '#ffffff',
  fixedHeight: true,
  lineHeight: 1.4,
  inset: [8, 8, 8, 8],
}

const imageEl = {
  id: 'e2e-match-image',
  type: 'image',
  left: 80,
  top: 80,
  width: 180,
  height: 120,
  rotate: 0,
  fixedRatio: false,
  src: PNG_1X1,
}

const chartEl = {
  id: 'e2e-match-chart',
  type: 'chart',
  left: 80,
  top: 80,
  width: 260,
  height: 220,
  rotate: 0,
  chartType: 'bar',
  data: { labels: ['A', 'B'], legends: ['S'], series: [[10, 20]] },
  themeColors: ['#5b9bd5'],
  textColor: '#333333',
  lineColor: '#dddddd',
}

const latexEl = {
  id: 'e2e-match-latex',
  type: 'latex',
  left: 80,
  top: 80,
  width: 180,
  height: 90,
  rotate: 0,
  latex: 'E=mc^2',
  path: 'M 0 0 L 100 0',
  color: '#111111',
  strokeWidth: 2,
  viewBox: [100, 40],
  fixedRatio: false,
}

const near = (a, b, tol = MATCH_PX) => Math.abs((a || 0) - (b || 0)) <= tol

async function isFikaDev(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) return false
    const html = await res.text()
    return html.includes('fika-shell') || html.includes('>fika<')
  }
  catch {
    return false
  }
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

async function stripScan(page) {
  await page.evaluate(() => {
    document.querySelectorAll('[data-react-scan], #react-scan-root').forEach(el => el.remove())
  })
}

async function waitForStoreHook(page) {
  const start = Date.now()
  while (Date.now() - start < 20000) {
    const ready = await page.evaluate(() => !!(window.__FIKA_SLIDES__ && window.__FIKA_MAIN__))
    if (ready) return
    await sleep(250)
  }
  throw new Error('window.__FIKA_SLIDES__ hook did not appear')
}

async function selectElement(page, id) {
  for (let i = 0; i < 8; i++) {
    await page.evaluate((elId) => {
      const main = window.__FIKA_MAIN__
      main.getState().setEditingElementId('')
      main.getState().setActiveElementIdList([elId])
      main.getState().setEditorareaFocus(true)
    }, id)
    await sleep(80)
    if (await page.locator(`#operate-element-${id} [data-resize-handle]`).count()) return
  }
  throw new Error(`could not select ${id}`)
}

async function loadElement(page, element) {
  const ok = await page.evaluate((el) => {
    const slides = window.__FIKA_SLIDES__
    const main = window.__FIKA_MAIN__
    if (!slides || !main) return false
    slides.getState().addSlide({
      id: `e2e-match-${el.id}-${Date.now()}`,
      elements: [el],
    })
    main.getState().setActiveElementIdList([el.id])
    main.getState().setEditorareaFocus(true)
    return true
  }, element)
  if (!ok) throw new Error('fika store hook missing')
  await page.waitForSelector(`#editable-element-${element.id}`, { state: 'attached', timeout: 15000 })
  await sleep(element.type === 'chart' || element.type === 'latex' ? 400 : 80)
  await selectElement(page, element.id)
  await page.waitForSelector(`#operate-element-${element.id} [data-resize-handle="bottom"]`, { timeout: 15000 })
}

async function measure(page, id) {
  return page.evaluate((elId) => {
    const root = document.getElementById(`editable-element-${elId}`)
    const box = root?.firstElementChild
    const operate = document.getElementById(`operate-element-${elId}`)
    const svg = root?.querySelector('[data-live-box] > svg')
    const path = svg?.querySelector('path')
    const table = root?.querySelector('table')
    const rows = [...(table?.querySelectorAll('tr') || [])]
    const st = window.__FIKA_SLIDES__.getState()
    const el = st.slides[st.slideIndex]?.elements.find(item => item.id === elId)
    const boxRect = box?.getBoundingClientRect()
    return {
      storeW: el?.width || 0,
      storeH: el?.height || 0,
      boxW: parseFloat(box?.style.width || '') || boxRect?.width || 0,
      boxH: parseFloat(box?.style.height || '') || boxRect?.height || 0,
      boxRectW: boxRect?.width || 0,
      boxRectH: boxRect?.height || 0,
      opW: operate?.getBoundingClientRect().width || 0,
      opH: operate?.getBoundingClientRect().height || 0,
      pathW: path?.getBoundingClientRect().width || 0,
      pathH: path?.getBoundingClientRect().height || 0,
      svgViewBox: svg?.getAttribute('viewBox') || '',
      tableW: table?.getBoundingClientRect().width || 0,
      tableH: table?.getBoundingClientRect().height || 0,
      row0: rows[0]?.getBoundingClientRect().height || 0,
      row1: rows[1]?.getBoundingClientRect().height || 0,
    }
  }, id)
}

async function drag(page, id, direction, dx, dy) {
  await selectElement(page, id)
  const handle = page.locator(`#operate-element-${id} [data-resize-handle="${direction}"]`).first()
  await handle.waitFor({ state: 'attached', timeout: 8000 })
  const box = await handle.boundingBox()
  if (!box) throw new Error(`resize handle ${direction} on ${id} has no box`)
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 12 })
  await sleep(40)
  const live = await measure(page, id)
  await page.mouse.up()
  await sleep(280)
  const after = await measure(page, id)
  return { live, after }
}

const results = []
function rec(id, pass, measured) {
  results.push({ id, name: CASES[id - 1][1], pass: !!pass, measured: measured ?? null })
}

const browser = await chromium.launch({ headless: true })
let child = null
try {
  let devUrl = await waitForDev(1500)
  if (!devUrl) {
    child = spawn('npm', ['run', 'dev'], { cwd: root, shell: true, stdio: 'ignore' })
    devUrl = await waitForDev(90000)
    if (!devUrl) throw new Error('fika dev server did not start')
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(devUrl, { waitUntil: 'networkidle' })
  await page.getByText('Add slide').waitFor({ timeout: 90000 })
  await stripScan(page)
  await waitForStoreHook(page)

  await loadElement(page, shapeEl)
  const shapeGrow = await drag(page, shapeEl.id, 'right-bottom', 80, 80)
  rec(1, near(shapeGrow.live.pathW, shapeGrow.after.pathW), shapeGrow)
  rec(2, near(shapeGrow.live.pathH, shapeGrow.after.pathH), shapeGrow)
  rec(3, near(shapeGrow.after.pathW, shapeGrow.after.opW, 8) && near(shapeGrow.after.pathH, shapeGrow.after.opH, 8), shapeGrow.after)
  rec(4, !shapeGrow.after.svgViewBox, shapeGrow.after)

  const shapeShrink = await drag(page, shapeEl.id, 'right-bottom', -110, -80)
  rec(5, near(shapeShrink.live.pathW, shapeShrink.after.pathW), shapeShrink)
  rec(6, near(shapeShrink.live.pathH, shapeShrink.after.pathH), shapeShrink)
  rec(7, near(shapeShrink.after.pathW, shapeShrink.after.opW, 8) && near(shapeShrink.after.pathH, shapeShrink.after.opH, 8), shapeShrink.after)

  await loadElement(page, { ...shapeEl, id: 'e2e-match-shape-axes' })
  const shapeRight = await drag(page, 'e2e-match-shape-axes', 'right', 80, 0)
  rec(8, near(shapeRight.live.pathW, shapeRight.after.pathW), shapeRight)
  const shapeBottom = await drag(page, 'e2e-match-shape-axes', 'bottom', 0, 70)
  rec(9, near(shapeBottom.live.pathH, shapeBottom.after.pathH), shapeBottom)
  rec(10, near(shapeBottom.after.storeW, shapeBottom.after.boxW, 2) && near(shapeBottom.after.storeH, shapeBottom.after.boxH, 2), shapeBottom.after)

  await loadElement(page, headerTable)
  const tableGrow = await drag(page, headerTable.id, 'bottom', 0, 80)
  rec(11, near(tableGrow.live.row0, tableGrow.after.row0), tableGrow)
  rec(12, near(tableGrow.after.row0, tableGrow.after.row1), tableGrow.after)
  const tableShrink = await drag(page, headerTable.id, 'bottom', 0, -90)
  rec(13, near(tableShrink.live.row0, tableShrink.after.row0), tableShrink)
  rec(14, near(tableShrink.after.row0, tableShrink.after.row1), tableShrink.after)
  const tableWidth = await drag(page, headerTable.id, 'right', -80, 0)
  rec(15, near(tableWidth.live.tableW, tableWidth.after.tableW), tableWidth)

  await loadElement(page, textEl)
  const textW = await drag(page, textEl.id, 'right', 80, 0)
  rec(16, near(textW.live.boxW, textW.after.boxW) && near(textW.live.opW, textW.after.opW), textW)
  const textH = await drag(page, textEl.id, 'bottom', 0, 70)
  rec(17, near(textH.live.boxH, textH.after.boxH) && near(textH.live.opH, textH.after.opH), textH)

  await loadElement(page, imageEl)
  const imageGrow = await drag(page, imageEl.id, 'right-bottom', 70, 50)
  rec(18, near(imageGrow.live.boxW, imageGrow.after.boxW) && near(imageGrow.live.boxH, imageGrow.after.boxH), imageGrow)

  await loadElement(page, chartEl)
  const chartW = await drag(page, chartEl.id, 'right', 80, 0)
  rec(19, near(chartW.live.opW, chartW.after.opW), chartW)

  await loadElement(page, latexEl)
  const latexH = await drag(page, latexEl.id, 'bottom', 0, 60)
  rec(20, near(latexH.live.boxH, latexH.after.boxH) && near(latexH.live.opH, latexH.after.opH), latexH)

  const failed = results.filter(p => !p.pass)
  const width = 62
  console.log('#   result  case'.padEnd(width + 12) + 'measured')
  console.log('-'.repeat(110))
  for (const [id, name] of CASES) {
    const proof = results.find(p => p.id === id)
    if (!proof) throw new Error(`missing proof ${id} ${name}`)
    const mark = proof.pass ? 'PASS' : 'FAIL'
    const m = proof.measured || {}
    const live = m.live || m
    const after = m.after || m
    console.log(`${String(id).padEnd(4)}${mark.padEnd(8)}${name.padEnd(width)}${JSON.stringify({
      livePath: live.pathW ? [Number(live.pathW.toFixed?.(1) ?? live.pathW), Number(live.pathH?.toFixed?.(1) ?? live.pathH)] : undefined,
      afterPath: after.pathW ? [Number(after.pathW.toFixed?.(1) ?? after.pathW), Number(after.pathH?.toFixed?.(1) ?? after.pathH)] : undefined,
      liveRow0: live.row0,
      afterRow0: after.row0,
      afterRow1: after.row1,
      viewBox: after.svgViewBox,
      error: m.error,
    })}`)
  }
  if (results.length !== CASES.length) throw new Error(`expected ${CASES.length} proofs, got ${results.length}`)
  if (failed.length) throw new Error(`${failed.length} resize-commit-match proofs failed: ${failed.map(p => p.id).join(', ')}`)
  console.log('-'.repeat(110))
  console.log('resize-commit-match e2e passed (20 cases)')
  await page.close()
}
finally {
  await browser.close()
  if (child) child.kill()
}
