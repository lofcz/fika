/**
 * Every path-formula shape must keep the same painted `d` while dragging and
 * after mouseup. Stretching the insert path then swapping the formula path on
 * drop is the "shape changes after drag" / "corner became round" defect.
 *
 *   node scripts/e2e-resize-shapes.mjs
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const DEV_PORTS = [5173, 5174, 5175, 5176]

const SHAPES = [
  { key: 'roundRect', pathFormula: 'roundRect', keypoints: [0.125], path: 'M 25 0 L 175 0 Q 200 0 200 25 L 200 175 Q 200 200 175 200 L 25 200 Q 0 200 0 175 L 0 25 Q 0 0 25 0 Z', expectQ: true, sharpTopLeft: false },
  { key: 'cutRectSingle', pathFormula: 'cutRectSingle', keypoints: [0.2], path: 'M 0 200 L 0 0 L 160 0 L 200 40 L 200 200 Z', expectQ: false, sharpTopLeft: true },
  { key: 'cutRectSameSide', pathFormula: 'cutRectSameSide', keypoints: [0.2], path: 'M 0 40 L 40 0 L 160 0 L 200 40 L 200 200 L 0 200 Z', expectQ: false, sharpTopLeft: false },
  { key: 'cutRectDiagonal', pathFormula: 'cutRectDiagonal', keypoints: [0.2], path: 'M 0 160 L 0 0 L 160 0 L 200 40 L 200 200 L 40 200 Z', expectQ: false, sharpTopLeft: true },
  { key: 'cutRoundRect', pathFormula: 'cutRoundRect', keypoints: [0.125], path: 'M 25 0 L 175 0 L 200 25 L 200 200 L 0 200 L 0 25 Q 0 0 25 0 Z', expectQ: true, sharpTopLeft: false },
  { key: 'roundRectSingle', pathFormula: 'roundRectSingle', keypoints: [0.125], path: 'M 0 0 L 175 0 Q 200 0 200 25 L 200 200 L 0 200 L 0 0 Z', expectQ: true, sharpTopLeft: true },
  { key: 'roundRectSameSide', pathFormula: 'roundRectSameSide', keypoints: [0.125], path: 'M 0 25 Q 0 0 25 0 L 175 0 Q 200 0 200 25 L 200 200 L 0 200 Z', expectQ: true, sharpTopLeft: false },
  { key: 'roundRectDiagonal', pathFormula: 'roundRectDiagonal', keypoints: [0.125], path: 'M 25 0 L 200 0 L 200 175 Q 200 200 175 200 L 0 200 L 0 25 Q 0 0 25 0 Z', expectQ: true, sharpTopLeft: false },
  { key: 'triangle', pathFormula: 'triangle', keypoints: [0.5], path: 'M 100 0 L 0 200 L 200 200 Z', expectQ: false },
  { key: 'parallelogramLeft', pathFormula: 'parallelogramLeft', keypoints: [0.25], path: 'M 50 0 L 200 0 L 150 200 L 0 200 Z', expectQ: false },
  { key: 'parallelogramRight', pathFormula: 'parallelogramRight', keypoints: [0.25], path: 'M 0 0 L 150 0 L 200 200 L 50 200 Z', expectQ: false },
  { key: 'trapezoid', pathFormula: 'trapezoid', keypoints: [0.25], path: 'M 50 0 L 150 0 L 200 200 L 0 200 Z', expectQ: false },
  { key: 'bullet', pathFormula: 'bullet', keypoints: [0.2], path: 'M 100 0 L 0 40 L 0 200 L 200 200 L 200 40 Z', expectQ: false },
  { key: 'indicator', pathFormula: 'indicator', keypoints: [0.2], path: 'M 200 100 L 160 0 L 0 0 L 40 100 L 0 200 L 160 200 Z', expectQ: false },
  { key: 'diagStripe', pathFormula: 'diagStripe', keypoints: [0.5], path: 'M 200 0 L 100 0 L 0 100 L 0 200 Z', expectQ: false },
  { key: 'plus', pathFormula: 'plus', keypoints: [0.6], path: 'M 40 0 L 40 40 L 0 40 L 0 160 L 40 160 L 40 200 L 160 200 L 160 160 L 200 160 L 200 40 L 160 40 L 160 0 Z', expectQ: false },
  { key: 'L', pathFormula: 'L', keypoints: [0.25], path: 'M 0 0 L 0 200 L 200 200 L 200 150 L 50 150 L 50 0 Z', expectQ: false },
  { key: 'ringRect', pathFormula: 'ringRect', keypoints: [0.25], path: 'M 0 0 200 0 200 200 L 0 200 L 0 0 Z M 50 50 L 50 150 L 150 150 L 150 50 Z', expectQ: false },
  { key: 'donut', pathFormula: 'donut', keypoints: [0.25], path: 'M 0 100 A 100 100 0 1 1 0 101 Z M 150 100 A 50 50 0 1 0 150 101 Z', expectQ: false },
  { key: 'message', pathFormula: 'message', keypoints: [0.3, 0.2], path: 'M 0 0 L 200 0 L 200 160 L 100 160 L 60 200 L 60 160 L 0 160 Z', expectQ: false },
  { key: 'roundMessage', pathFormula: 'roundMessage', path: 'M 0 25 Q 0 0 25 0 L 175 0 Q 200 0 200 25 L 200 135 Q 200 160 175 160 L 100 160 L 60 200 L 60 160 L 25 160 Q 0 160 0 135 L 0 25 Z', expectQ: true },
  { key: 'staticRect', path: 'M 0 0 L 200 0 L 200 200 L 0 200 Z', expectQ: false, sharpTopLeft: true },
]

const CASES = []
for (const shape of SHAPES) {
  CASES.push([CASES.length + 1, `${shape.key} painted path stays the same after drop`])
  CASES.push([CASES.length + 1, `${shape.key} committed path matches the live painted path`])
}
if (CASES.length !== 44) throw new Error(`expected 44 path-stability cases, built ${CASES.length}`)
CASES.push([45, 'cutRectSingle top-left stays a straight corner after drop'])
CASES.push([46, 'cutRectSameSide top corners stay straight cuts after drop'])
CASES.push([47, 'cutRectDiagonal top-left stays a straight corner after drop'])
CASES.push([48, 'roundRectSingle top-left stays a straight corner after drop'])
CASES.push([49, 'staticRect has no curve commands after drop'])
CASES.push([50, 'cutRoundRect keeps a straight snip on the top-right after drop'])
CASES.push([51, 'roundRectSameSide top-left stays a curve after drop'])
CASES.push([52, 'roundRectDiagonal top-left stays a curve after drop'])

const toElement = (shape) => ({
  id: `e2e-shape-${shape.key}`,
  type: 'shape',
  left: 80,
  top: 80,
  width: 200,
  height: 200,
  rotate: 0,
  viewBox: [200, 200],
  path: shape.path,
  ...(shape.pathFormula ? { pathFormula: shape.pathFormula } : {}),
  ...(shape.keypoints ? { keypoints: shape.keypoints } : {}),
  fixedRatio: false,
  fill: '#4472c4',
})

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

async function injectElement(page, element) {
  return page.evaluate((el) => {
    const slides = window.__FIKA_SLIDES__
    const main = window.__FIKA_MAIN__
    if (!slides || !main) return false
    slides.getState().addSlide({
      id: `e2e-shape-slide-${el.id}-${Date.now()}`,
      elements: [el],
    })
    main.getState().setEditingElementId('')
    main.getState().setActiveElementIdList([el.id])
    main.getState().setEditorareaFocus(true)
    return true
  }, element)
}

async function loadElement(page, element) {
  await page.keyboard.press('Escape').catch(() => {})
  const ok = await injectElement(page, element)
  if (!ok) throw new Error('fika store hook missing')
  const appeared = await page.waitForSelector(`#editable-element-${element.id}`, { state: 'attached', timeout: 4000 }).then(() => true).catch(() => false)
  if (!appeared) {
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByText('Add slide').waitFor({ timeout: 15000 })
    await stripScan(page)
    await waitForStoreHook(page)
    if (!await injectElement(page, element)) throw new Error('fika store hook missing after reload')
    await page.waitForSelector(`#editable-element-${element.id}`, { state: 'attached', timeout: 15000 })
  }
  await sleep(120)
  await selectElement(page, element.id)
  await page.waitForSelector(`#operate-element-${element.id} [data-resize-handle="right-bottom"]`, { timeout: 15000 })
}

async function measure(page, id) {
  return page.evaluate((elId) => {
    const root = document.getElementById(`editable-element-${elId}`)
    const path = root?.querySelector('path')
    const painted = path?.getAttribute('d') || ''
    const st = window.__FIKA_SLIDES__.getState()
    const el = st.slides[st.slideIndex]?.elements.find(item => item.id === elId)
    return {
      painted,
      store: el?.path || '',
      hasQ: /\bQ\b/.test(painted),
      startsAtOrigin: /^M 0 0\b/.test(painted),
      pathCount: root?.querySelectorAll('path').length || 0,
    }
  }, id)
}

async function drag(page, id) {
  await selectElement(page, id)
  const handle = page.locator(`#operate-element-${id} [data-resize-handle="right-bottom"]`).first()
  const box = await handle.boundingBox()
  if (!box) throw new Error(`no handle on ${id}`)
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 90, y + 40, { steps: 12 })
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
  await page.getByText('Add slide').waitFor({ timeout: 15000 })
  await stripScan(page)
  await waitForStoreHook(page)

  const byKey = {}
  let caseId = 1
  for (const shape of SHAPES) {
    const element = toElement(shape)
    await loadElement(page, element)
    const dragResult = await drag(page, element.id)
    byKey[shape.key] = dragResult
    rec(caseId, dragResult.live.painted === dragResult.after.painted && !!dragResult.after.painted, {
      ...dragResult,
      liveHead: dragResult.live.painted.slice(0, 90),
      afterHead: dragResult.after.painted.slice(0, 90),
    })
    caseId += 1
    rec(caseId, dragResult.after.painted === dragResult.after.store && !!dragResult.after.store, dragResult.after)
    caseId += 1
  }

  const cutSingle = byKey.cutRectSingle.after
  rec(45, cutSingle && !cutSingle.hasQ && /\bL 0 0\b/.test(cutSingle.painted), cutSingle)
  const cutSame = byKey.cutRectSameSide.after
  rec(46, cutSame && !cutSame.hasQ && !cutSame.startsAtOrigin, cutSame)
  const cutDiag = byKey.cutRectDiagonal.after
  rec(47, cutDiag && !cutDiag.hasQ && /\bL 0 0\b/.test(cutDiag.painted), cutDiag)
  const roundSingle = byKey.roundRectSingle.after
  rec(48, roundSingle && roundSingle.hasQ && roundSingle.startsAtOrigin, roundSingle)
  const staticRect = byKey.staticRect.after
  rec(49, staticRect && !staticRect.hasQ && staticRect.startsAtOrigin, staticRect)
  const cutRound = byKey.cutRoundRect.after
  rec(50, cutRound && cutRound.hasQ && /L [0-9.]+ 0 L [0-9.]+ [0-9.]+/.test(cutRound.painted), cutRound)
  const roundSame = byKey.roundRectSameSide.after
  rec(51, roundSame && roundSame.hasQ && /^M 0 /.test(roundSame.painted) && !roundSame.startsAtOrigin, roundSame)
  const roundDiag = byKey.roundRectDiagonal.after
  rec(52, roundDiag && roundDiag.hasQ && !roundDiag.startsAtOrigin, roundDiag)

  const failed = results.filter(p => !p.pass)
  const width = 68
  console.log('#   result  case'.padEnd(width + 12) + 'measured')
  console.log('-'.repeat(120))
  for (const [id, name] of CASES) {
    const proof = results.find(p => p.id === id)
    if (!proof) throw new Error(`missing proof ${id} ${name}`)
    const mark = proof.pass ? 'PASS' : 'FAIL'
    const m = proof.measured || {}
    const after = m.after || m
    console.log(`${String(id).padEnd(4)}${mark.padEnd(8)}${name.padEnd(width)}${JSON.stringify({
      same: m.live ? m.live.painted === m.after.painted : undefined,
      hasQ: after.hasQ,
      origin: after.startsAtOrigin,
      liveHead: m.liveHead,
      afterHead: m.afterHead,
    })}`)
  }
  if (results.length !== CASES.length) throw new Error(`expected ${CASES.length} proofs, got ${results.length}`)
  if (failed.length) throw new Error(`${failed.length} resize-shapes proofs failed: ${failed.map(p => p.id).join(', ')}`)
  console.log('-'.repeat(120))
  console.log(`resize-shapes e2e passed (${CASES.length} cases)`)
  await page.close()
}
finally {
  await browser.close()
  if (child) child.kill()
}
