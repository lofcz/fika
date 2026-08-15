/**
 * Hypothesis: multi-select align/distribute still sizes lines by the start–end
 * chord, so a bent curve's painted arch will not line up with neighbors.
 *
 *   node scripts/e2e-line-align.mjs
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const DEV_PORTS = [5173, 5174, 5175, 5176, 5188]
const TOL = 1.5

const CASES = [
  [1, 'Two boxes: align left matches painted lefts'],
  [2, 'Curve + box: align left matches painted lefts'],
  [3, 'Curve + box: align right matches painted rights'],
  [4, 'Curve + box: align top matches painted tops'],
  [5, 'Curve + box: align bottom matches painted bottoms'],
  [6, 'Curve + box: horizontal center matches painted centers'],
  [7, 'Curve + box: vertical center matches painted centers'],
  [8, 'Single curve: align to canvas left puts painted minX at 0'],
  [9, 'Distribute horizontally: painted gaps are equal'],
  [10, 'Align right does not flatten the curve'],
]

const BOX = (id, left, top, width, height) => ({
  id,
  type: 'shape',
  left,
  top,
  width,
  height,
  rotate: 0,
  viewBox: [width, height],
  path: `M 0 0 L ${width} 0 L ${width} ${height} L 0 ${height} Z`,
  fixedRatio: false,
  fill: '#d4d4d8',
})

const CURVE = {
  id: 'e2e-align-curve',
  type: 'line',
  left: 420,
  top: 320,
  start: [0, 0],
  end: [240, 0],
  curve: [-80, -150],
  width: 4,
  style: 'solid',
  color: '#2563eb',
  points: ['', 'arrow'],
}

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
    if (await page.evaluate(() => !!(window.__FIKA_SLIDES__ && window.__FIKA_MAIN__))) return
    await sleep(250)
  }
  throw new Error('window.__FIKA_SLIDES__ hook did not appear')
}

async function injectSlide(page, elements, activeIds) {
  return page.evaluate(({ els, ids }) => {
    const slides = window.__FIKA_SLIDES__
    const main = window.__FIKA_MAIN__
    if (!slides || !main) return false
    slides.getState().addSlide({
      id: `e2e-align-slide-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      elements: els,
    })
    main.getState().setEditingElementId('')
    main.getState().setActiveElementIdList(ids)
    main.getState().setEditorareaFocus(true)
    return true
  }, { els: elements, ids: activeIds })
}

async function loadSlide(page, elements, activeIds) {
  await page.keyboard.press('Escape').catch(() => {})
  const ok = await injectSlide(page, elements, activeIds)
  if (!ok) throw new Error('fika store hook missing')
  await page.waitForSelector(`#editable-element-${elements[0].id}`, { state: 'attached', timeout: 8000 })
  await sleep(80)
  await page.evaluate((ids) => {
    const main = window.__FIKA_MAIN__
    main.getState().setActiveElementIdList(ids)
    main.getState().setEditorareaFocus(true)
    if (ids.length > 1) main.getState().setToolbarState('multiPosition')
    else main.getState().setToolbarState('elPosition')
  }, activeIds)
  await sleep(80)
}

function lineRange(el) {
  const xs = [el.start[0], el.end[0], ...(el.curve ? [el.curve[0]] : [])]
  const ys = [el.start[1], el.end[1], ...(el.curve ? [el.curve[1]] : [])]
  return {
    minX: el.left + Math.min(...xs),
    maxX: el.left + Math.max(...xs),
    minY: el.top + Math.min(...ys),
    maxY: el.top + Math.max(...ys),
  }
}

function boxRange(el) {
  return {
    minX: el.left,
    maxX: el.left + el.width,
    minY: el.top,
    maxY: el.top + el.height,
  }
}

async function storeElements(page, ids) {
  return page.evaluate((elIds) => {
    const st = window.__FIKA_SLIDES__.getState()
    const slide = st.slides[st.slideIndex]
    return elIds.map(id => slide.elements.find(el => el.id === id) || null)
  }, ids)
}

async function openPositionPanel(page, multi) {
  await page.evaluate((isMulti) => {
    window.__FIKA_MAIN__.getState().setToolbarState(isMulti ? 'multiPosition' : 'elPosition')
  }, multi)
  await sleep(80)
  const tabLabel = multi ? 'Position of selected items' : 'Position'
  const tab = page.getByText(tabLabel, { exact: true }).first()
  if (await tab.count()) await tab.click().catch(() => {})
  await sleep(120)
}

async function clickAlign(page, command, multi = true) {
  await openPositionPanel(page, multi)
  const any = page.locator(`[data-align="${command}"]`)
  if (await any.count() === 0) throw new Error(`no align control ${command}`)
  const visible = any.filter({ visible: true })
  if (await visible.count()) await visible.first().click()
  else await any.first().click({ force: true })
  await sleep(160)
}

function near(a, b) {
  return Math.abs(a - b) <= TOL
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

  const boxA = BOX('e2e-align-box-a', 80, 90, 200, 110)
  const boxB = BOX('e2e-align-box-b', 360, 200, 140, 90)
  await loadSlide(page, [boxA, boxB], [boxA.id, boxB.id])
  await clickAlign(page, 'left')
  const [a1, b1] = await storeElements(page, [boxA.id, boxB.id])
  rec(1, near(a1.left, b1.left), { a: a1.left, b: b1.left })

  await loadSlide(page, [boxA, CURVE], [boxA.id, CURVE.id])
  await clickAlign(page, 'left')
  const [boxLeft, curveLeft] = await storeElements(page, [boxA.id, CURVE.id])
  const leftBox = boxRange(boxLeft)
  const leftCurve = lineRange(curveLeft)
  rec(2, near(leftBox.minX, leftCurve.minX), { box: leftBox, curve: leftCurve })

  await loadSlide(page, [boxA, CURVE], [boxA.id, CURVE.id])
  await clickAlign(page, 'right')
  const [boxRight, curveRight] = await storeElements(page, [boxA.id, CURVE.id])
  const rightBox = boxRange(boxRight)
  const rightCurve = lineRange(curveRight)
  rec(3, near(rightBox.maxX, rightCurve.maxX), { box: rightBox, curve: rightCurve })

  await loadSlide(page, [boxA, CURVE], [boxA.id, CURVE.id])
  await clickAlign(page, 'top')
  const [boxTop, curveTop] = await storeElements(page, [boxA.id, CURVE.id])
  rec(4, near(boxRange(boxTop).minY, lineRange(curveTop).minY), { box: boxRange(boxTop), curve: lineRange(curveTop) })

  await loadSlide(page, [boxA, CURVE], [boxA.id, CURVE.id])
  await clickAlign(page, 'bottom')
  const [boxBottom, curveBottom] = await storeElements(page, [boxA.id, CURVE.id])
  rec(5, near(boxRange(boxBottom).maxY, lineRange(curveBottom).maxY), { box: boxRange(boxBottom), curve: lineRange(curveBottom) })

  await loadSlide(page, [boxA, CURVE], [boxA.id, CURVE.id])
  await clickAlign(page, 'horizontal')
  const [boxH, curveH] = await storeElements(page, [boxA.id, CURVE.id])
  const hBox = boxRange(boxH)
  const hCurve = lineRange(curveH)
  rec(6, near((hBox.minX + hBox.maxX) / 2, (hCurve.minX + hCurve.maxX) / 2), { box: hBox, curve: hCurve })

  await loadSlide(page, [boxA, CURVE], [boxA.id, CURVE.id])
  await clickAlign(page, 'vertical')
  const [boxV, curveV] = await storeElements(page, [boxA.id, CURVE.id])
  const vBox = boxRange(boxV)
  const vCurve = lineRange(curveV)
  rec(7, near((vBox.minY + vBox.maxY) / 2, (vCurve.minY + vCurve.maxY) / 2), { box: vBox, curve: vCurve })

  await loadSlide(page, [CURVE], [CURVE.id])
  await clickAlign(page, 'left', false)
  const [canvasCurve] = await storeElements(page, [CURVE.id])
  rec(8, near(lineRange(canvasCurve).minX, 0), { curve: lineRange(canvasCurve) })

  const leftBoxD = BOX('e2e-align-dist-a', 40, 80, 80, 70)
  const rightBoxD = BOX('e2e-align-dist-c', 700, 80, 80, 70)
  await loadSlide(page, [leftBoxD, CURVE, rightBoxD], [leftBoxD.id, CURVE.id, rightBoxD.id])
  await clickAlign(page, 'distribute-h')
  const [dA, dCurve, dC] = await storeElements(page, [leftBoxD.id, CURVE.id, rightBoxD.id])
  const rA = boxRange(dA)
  const rCurve = lineRange(dCurve)
  const rC = boxRange(dC)
  const gap1 = rCurve.minX - rA.maxX
  const gap2 = rC.minX - rCurve.maxX
  rec(9, near(gap1, gap2) && gap1 > 0, { gap1, gap2, rA, rCurve, rC })

  rec(10, curveRight?.curve && (curveRight.curve[1] < -40 || curveRight.curve[0] < -20), { curve: curveRight?.curve })

  const failed = results.filter(p => !p.pass)
  const width = 68
  console.log('#   result  case'.padEnd(width + 12) + 'measured')
  console.log('-'.repeat(120))
  for (const [id, name] of CASES) {
    const proof = results.find(p => p.id === id)
    if (!proof) throw new Error(`missing proof ${id} ${name}`)
    const mark = proof.pass ? 'PASS' : 'FAIL'
    console.log(`${String(id).padEnd(4)}${mark.padEnd(8)}${name.padEnd(width)}${JSON.stringify(proof.measured)}`)
  }
  if (results.length !== CASES.length) throw new Error(`expected ${CASES.length} proofs, got ${results.length}`)
  if (failed.length) throw new Error(`${failed.length} line-align proofs failed: ${failed.map(p => p.id).join(', ')}`)
  console.log('-'.repeat(120))
  console.log(`line-align e2e passed (${CASES.length} cases)`)
  await page.close()
}
finally {
  await browser.close()
  if (child) child.kill()
}
