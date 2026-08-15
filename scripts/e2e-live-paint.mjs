/**
 * Live gradient / property updates must paint the canvas without wiping the
 * preview raster. The old path wrote the store on every slider tick, which
 * cleared the Konva scratch stage and SnapDOM-rebuilt every sibling.
 *
 *   node scripts/e2e-live-paint.mjs
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const DEV_PORTS = [5173, 5174, 5175, 5176]

const CASES = [
  [1, 'angle slider updates the painted gradient during the drag'],
  [2, 'angle slider does not write gradient.rotate to the store until mouseup'],
  [3, 'angle slider does not full-rebuild the preview raster during the drag'],
  [4, 'angle slider does not SnapDOM-rebuild sibling text during the drag'],
  [5, 'sibling shape path node stays the same during the drag'],
  [6, 'mouseup commits the painted rotate to the store'],
  [7, 'a burst of store gradient writes patches one shape, not the whole slide'],
  [8, 'a burst of store gradient writes does not SnapDOM sibling text'],
]

const gradientShape = {
  id: 'e2e-live-paint-shape',
  type: 'shape',
  left: 80,
  top: 60,
  width: 280,
  height: 220,
  rotate: 0,
  viewBox: [200, 200],
  path: 'M 200 0 L 0 200 L 200 200 Z',
  fixedRatio: false,
  fill: '#1c7ed6',
  gradient: {
    type: 'linear',
    rotate: 0,
    colors: [
      { pos: 0, color: '#1c7ed6' },
      { pos: 100, color: '#ffffff' },
    ],
  },
}

const siblingShape = {
  id: 'e2e-live-paint-sibling',
  type: 'shape',
  left: 400,
  top: 80,
  width: 160,
  height: 160,
  rotate: 0,
  viewBox: [100, 100],
  path: 'M 0 0 L 100 0 L 100 100 L 0 100 Z',
  fixedRatio: false,
  fill: '#3b5bdb',
}

const siblingText = {
  id: 'e2e-live-paint-text',
  type: 'text',
  left: 80,
  top: 320,
  width: 360,
  height: 64,
  rotate: 0,
  content: '<p>Live paint sibling</p>',
  defaultFontName: 'Arial',
  defaultColor: '#18181b',
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

async function waitForRasterHook(page) {
  const start = Date.now()
  while (Date.now() - start < 20000) {
    if (await page.evaluate(() => !!window.__FIKA_RASTER__)) return
    await sleep(250)
  }
  throw new Error('window.__FIKA_RASTER__ hook did not appear')
}

async function selectElement(page, id) {
  for (let i = 0; i < 8; i++) {
    await page.evaluate((elId) => {
      const main = window.__FIKA_MAIN__
      main.getState().setEditingElementId('')
      main.getState().setActiveElementIdList([elId])
      main.getState().setToolbarState('elStyle')
      main.getState().setEditorareaFocus(true)
    }, id)
    await sleep(80)
    if (await page.locator(`#operate-element-${id}`).count()) return
  }
  throw new Error(`could not select ${id}`)
}

async function injectSlide(page) {
  return page.evaluate((elements) => {
    const slides = window.__FIKA_SLIDES__
    const main = window.__FIKA_MAIN__
    if (!slides || !main) return false
    slides.getState().addSlide({
      id: `e2e-live-paint-${Date.now()}`,
      elements,
    })
    main.getState().setEditingElementId('')
    main.getState().setActiveElementIdList([elements[0].id])
    main.getState().setToolbarState('elStyle')
    main.getState().setEditorareaFocus(true)
    return true
  }, [gradientShape, siblingShape, siblingText])
}

async function snapshot(page) {
  return page.evaluate(({ shapeId, siblingId }) => {
    const slides = window.__FIKA_SLIDES__.getState()
    const el = slides.slides[slides.slideIndex]?.elements.find(item => item.id === shapeId)
    const def = document.getElementById(`editable-gradient-${shapeId}`)
    const raw = def?.getAttribute('gradientTransform') || ''
    const match = raw.match(/rotate\(([-.\d]+)/)
    return {
      storeRotate: el?.gradient?.rotate ?? null,
      paintedRotate: match ? Number(match[1]) : null,
    }
  }, { shapeId: gradientShape.id, siblingId: siblingShape.id })
}

async function rasterStats(page) {
  return page.evaluate(() => window.__FIKA_RASTER__.read())
}

async function resetRaster(page) {
  await page.evaluate(() => window.__FIKA_RASTER__.reset())
}

async function waitForIdleRaster(page, requirePaint = true) {
  const start = Date.now()
  let last = -1
  let stable = 0
  while (Date.now() - start < 8000) {
    const stats = await rasterStats(page)
    const token = stats.fullPaints + stats.patchPaints + stats.elementInvalidations
    if (token === last) {
      stable += 1
      if (stable >= 3 && (!requirePaint || stats.fullPaints + stats.patchPaints > 0)) return stats
    }
    else {
      stable = 0
      last = token
    }
    await sleep(80)
  }
  return rasterStats(page)
}

async function claimCurrentScratch(page, id) {
  await page.evaluate((elId) => {
    const slides = window.__FIKA_SLIDES__
    const el = slides.getState().slides[slides.getState().slideIndex].elements.find(item => item.id === elId)
    slides.getState().updateElement({
      id: elId,
      props: { gradient: { ...el.gradient, rotate: (el.gradient.rotate + 15) % 360 } },
    })
  }, id)
  await waitForIdleRaster(page)
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
  await waitForRasterHook(page)

  const ok = await injectSlide(page)
  if (!ok) throw new Error('fika store hook missing')
  await page.waitForSelector(`#editable-element-${gradientShape.id}`, { state: 'attached', timeout: 15000 })
  await page.waitForSelector(`#editable-gradient-${gradientShape.id}`, { state: 'attached', timeout: 15000 })
  await selectElement(page, gradientShape.id)
  await page.waitForSelector('[data-style-slider="gradient-angle"]', { timeout: 15000 })
  await waitForIdleRaster(page)
  await claimCurrentScratch(page, gradientShape.id)
  await resetRaster(page)

  const before = await snapshot(page)
  const siblingPathBefore = await page.evaluate((id) => {
    const path = document.getElementById(`editable-element-${id}`)?.querySelector('path')
    path?.setAttribute('data-e2e-path', '1')
    return !!path
  }, siblingShape.id)

  const slider = page.locator('[data-style-slider="gradient-angle"]').first()
  const box = await slider.boundingBox()
  if (!box) throw new Error('gradient angle slider has no box')
  const y = box.y + box.height / 2
  await page.mouse.move(box.x + 8, y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width - 8, y, { steps: 18 })
  await sleep(80)

  const live = await snapshot(page)
  const liveStats = await rasterStats(page)
  const siblingSame = await page.evaluate((id) => (
    document.getElementById(`editable-element-${id}`)?.querySelector('path')?.getAttribute('data-e2e-path') === '1'
  ), siblingShape.id)

  await page.mouse.up()
  await sleep(350)
  const after = await snapshot(page)
  const afterStats = await rasterStats(page)

  rec(1, live.paintedRotate !== before.paintedRotate && live.paintedRotate != null, { before: before.paintedRotate, live: live.paintedRotate })
  rec(2, live.storeRotate === before.storeRotate, { store: live.storeRotate, painted: live.paintedRotate })
  rec(3, liveStats.fullPaints === 0, liveStats)
  rec(4, liveStats.booths === 0, { booths: liveStats.booths })
  rec(5, siblingPathBefore && siblingSame, { siblingPathBefore, siblingSame })
  rec(6, after.storeRotate === after.paintedRotate && after.storeRotate !== before.storeRotate, {
    store: after.storeRotate,
    painted: after.paintedRotate,
  })

  await waitForIdleRaster(page, false)
  await claimCurrentScratch(page, gradientShape.id)
  await resetRaster(page)
  const burst = await page.evaluate((id) => {
    const slides = window.__FIKA_SLIDES__
    const started = performance.now()
    for (let i = 0; i < 12; i++) {
      const el = slides.getState().slides[slides.getState().slideIndex].elements.find(item => item.id === id)
      slides.getState().updateElement({
        id,
        props: { gradient: { ...el.gradient, rotate: (15 * (i + 1)) % 360 } },
      })
    }
    return performance.now() - started
  }, gradientShape.id)
  await sleep(600)
  const burstStats = await rasterStats(page)
  rec(7, burstStats.fullPaints === 0 && burstStats.elementInvalidations <= 12 && burstStats.elementInvalidations >= 1, {
    ...burstStats,
    burstMs: Math.round(burst),
  })
  rec(8, burstStats.booths === 0, { booths: burstStats.booths, afterStats })
}
finally {
  await browser.close()
  if (child) child.kill()
}

const failed = results.filter(item => !item.pass)
for (const item of results) {
  const mark = item.pass ? 'PASS' : 'FAIL'
  console.log(`${mark} ${item.id} ${item.name}`)
  if (!item.pass && item.measured) console.log('   ', item.measured)
}
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} failed`)
  process.exit(1)
}
console.log(`\n${results.length}/${results.length} passed`)
