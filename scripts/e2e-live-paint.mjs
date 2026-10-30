/**
 * Live gradient / property updates must paint the canvas and the rail thumb
 * without remounting the canvas. Measure the displayed gradient from pixels.
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
  [3, 'angle slider does not remount the thumbnail canvas during the drag'],
  [4, 'no capture/stage machinery exists on the thumbnail path'],
  [5, 'sibling shape path node stays the same during the drag'],
  [6, 'mouseup commits the painted rotate to the store and the thumb follows'],
  [7, 'a burst of store gradient writes lands the final angle in the thumb'],
  [8, 'a burst of store gradient writes keeps the thumbnail canvas mounted'],
  [9, 'thumbnail pixels distinguish all four cardinal gradient directions'],
  [10, 'flat thumbnail paint cannot pass as a directional gradient'],
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
  // The rail mounts live slide DOM now — wait for the first thumbnail canvas.
  await page.waitForSelector('[data-thumbnail-slide] canvas[data-canvas-painted]', { timeout: 20000 })
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

/** Track the mounted canvas for the current slide. */
async function tagThumbTree(page) {
  await page.evaluate(() => {
    const slides = window.__FIKA_SLIDES__.getState()
    const current = slides.slides[slides.slideIndex]
    const host = [...document.querySelectorAll('[data-thumbnail-slide]')].find(el => (
      el.getAttribute('data-thumbnail-slide') === current?.id
    ))
    const slide = host?.querySelector('canvas[data-canvas-painted]')
    if (slide) slide.dataset.e2eNode = String(Date.now())
  })
}

async function readThumbNodeKey(page) {
  return page.evaluate(() => {
    const slides = window.__FIKA_SLIDES__.getState()
    const current = slides.slides[slides.slideIndex]
    const host = [...document.querySelectorAll('[data-thumbnail-slide]')].find(el => (
      el.getAttribute('data-thumbnail-slide') === current?.id
    ))
    return host?.querySelector('canvas[data-canvas-painted]')?.dataset.e2eNode || null
  })
}

/** Infer the painted gradient direction from color changes at three interior points. */
async function thumbGradientRotate(page, shapeId) {
  return page.evaluate((id) => {
    const state = window.__FIKA_SLIDES__.getState()
    const slide = state.slides[state.slideIndex]
    const shape = slide.elements.find(el => el.id === id)
    const host = [...document.querySelectorAll('[data-thumbnail-slide]')].find(el => el.dataset.thumbnailSlide === slide.id)
    const canvas = host?.querySelector('canvas[data-canvas-painted]')
    if (!shape || !canvas) return null
    const sx = canvas.width / state.viewportSize
    const sy = canvas.height / (state.viewportSize * state.viewportRatio)
    const sample = (x, y) => {
      const px = Math.round((shape.left + x * shape.width) * sx)
      const py = Math.round((shape.top + y * shape.height) * sy)
      const data = canvas.getContext('2d').getImageData(px - 1, py - 1, 3, 3).data
      let red = 0
      for (let i = 0; i < data.length; i += 4) red += data[i]
      return { x: px, y: py, red: red / 9 }
    }
    const a = sample(.6, .6), b = sample(.9, .6), c = sample(.6, .9)
    const dx = (b.red - a.red) / (b.x - a.x)
    const dy = (c.red - a.red) / (c.y - a.y)
    if (Math.hypot(dx, dy) < .05) return null
    return (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360
  }, shapeId)
}

// Pixel quantization makes angle measurements approximate; absent/flat paint fails.
const sameAngle = (measured, expected) => measured !== null && Math.abs((measured - expected + 540) % 360 - 180) <= 3

async function waitForThumbAngle(page, shapeId, expected) {
  const deadline = Date.now() + 5000
  let measured
  do {
    measured = await thumbGradientRotate(page, shapeId)
    if (expected === null ? measured === null : sameAngle(measured, expected)) return measured
    await sleep(50)
  } while (Date.now() < deadline)
  return measured
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
  await sleep(400)
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
  await sleep(400)
  await claimCurrentScratch(page, gradientShape.id)
  await tagThumbTree(page)
  const thumbKeyBefore = await readThumbNodeKey(page)
  const thumbRotateBefore = await thumbGradientRotate(page, gradientShape.id)

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
  const thumbKeyDuring = await readThumbNodeKey(page)
  const thumbRotateDuring = await thumbGradientRotate(page, gradientShape.id)
  const siblingSame = await page.evaluate((id) => (
    document.getElementById(`editable-element-${id}`)?.querySelector('path')?.getAttribute('data-e2e-path') === '1'
  ), siblingShape.id)

  await page.mouse.up()
  await sleep(350)
  const after = await snapshot(page)
  const thumbRotateAfter = await thumbGradientRotate(page, gradientShape.id)

  rec(1, live.paintedRotate !== before.paintedRotate && live.paintedRotate != null, { before: before.paintedRotate, live: live.paintedRotate })
  rec(2, live.storeRotate === before.storeRotate, { store: live.storeRotate, painted: live.paintedRotate })
  // During the drag, the store changes only on commit; the canvas stays mounted.
  rec(3, !!thumbKeyDuring && thumbKeyDuring === thumbKeyBefore, {
    thumbKeyDuring,
    thumbKeyBefore,
    thumbRotateBefore,
    thumbRotateDuring,
  })
  rec(4, await page.evaluate(() => !document.querySelector('[data-slide-dom-stage], [data-preview-raster]')), {})
  rec(5, siblingPathBefore && siblingSame, { siblingPathBefore, siblingSame })
  rec(6, after.storeRotate === after.paintedRotate && after.storeRotate !== before.storeRotate && sameAngle(thumbRotateAfter, after.storeRotate), {
    store: after.storeRotate,
    painted: after.paintedRotate,
    thumb: thumbRotateAfter,
  })

  await claimCurrentScratch(page, gradientShape.id)
  await tagThumbTree(page)
  const burstKeyBefore = await readThumbNodeKey(page)
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
  const burstStore = await snapshot(page)
  const burstThumb = await thumbGradientRotate(page, gradientShape.id)
  const burstKeyAfter = await readThumbNodeKey(page)
  rec(7, sameAngle(burstThumb, burstStore.storeRotate), {
    burstMs: Math.round(burst),
    store: burstStore.storeRotate,
    thumb: burstThumb,
  })
  rec(8, burstKeyAfter === burstKeyBefore, { burstKeyBefore, burstKeyAfter })
  const directions = []
  for (const rotate of [0, 90, 180, 270]) {
    await page.evaluate(({ id, rotate }) => {
      const s = window.__FIKA_SLIDES__.getState()
      const el = s.slides[s.slideIndex].elements.find(el => el.id === id)
      s.updateElement({ id, props: { gradient: { ...el.gradient, rotate } } })
    }, { id: gradientShape.id, rotate })
    directions.push({ expected: rotate, measured: await waitForThumbAngle(page, gradientShape.id, rotate) })
  }
  rec(9, directions.every(({ expected, measured }) => sameAngle(measured, expected)), directions)
  await page.evaluate(id => {
    const s = window.__FIKA_SLIDES__.getState()
    s.updateElement({ id, props: { gradient: { type: 'linear', rotate: 0, colors: [{ pos: 0, color: '#ffffff' }, { pos: 100, color: '#ffffff' }] } } })
  }, gradientShape.id)
  const flat = await waitForThumbAngle(page, gradientShape.id, null)
  rec(10, flat === null, { flat })
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
