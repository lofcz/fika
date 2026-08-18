/**
 * Real-browser chart insert + thumbnail raster. Every chart type must paint
 * into the slide thumb with the same series/category colors as the live
 * echarts canvas — not the old Konva stub (white square + rainbow bars).
 *
 *   node scripts/e2e-charts.mjs
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DEV_URL = 'http://127.0.0.1:5173/'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const CHART_TYPES = ['bar', 'column', 'line', 'area', 'scatter', 'pie', 'ring', 'radar']
const PIE_FAMILY = new Set(['pie', 'ring'])

const CASES = [
  [1, 'Insert chart control is on the canvas tool'],
  [2, 'Chart pool opens from the toolbar'],
  [3, 'Pool lists a bar / column chart'],
  [4, 'Pool lists a horizontal bar chart'],
  [5, 'Pool lists a line chart'],
  [6, 'Pool lists an area chart'],
  [7, 'Pool lists a scatter chart'],
  [8, 'Pool lists a pie chart'],
  [9, 'Pool lists a ring chart'],
  [10, 'Pool lists a radar chart'],
  [11, 'Inserting a bar chart creates a live chart'],
  [12, 'Live bar chart is tagged bar'],
  [13, 'Bar thumb rasterizes (not pending)'],
  [14, 'Bar thumb has series-1 dark blue'],
  [15, 'Bar thumb has series-2 light blue'],
  [16, 'Bar thumb is not the stub white square'],
  [17, 'Bar thumb is not category-rainbow bars'],
  [18, 'Live bar SVG uses both series colors'],
  [19, 'Inserting a column chart creates a live chart'],
  [20, 'Column thumb has both series colors'],
  [21, 'Column thumb is not a rainbow stub'],
  [22, 'Inserting a line chart creates a live chart'],
  [23, 'Line thumb has both series colors'],
  [24, 'Line thumb is not a rainbow stub'],
  [25, 'Inserting an area chart creates a live chart'],
  [26, 'Area thumb has both series colors'],
  [27, 'Area thumb is not a rainbow stub'],
  [28, 'Inserting a scatter chart creates a live chart'],
  [29, 'Scatter thumb has theme point color'],
  [30, 'Scatter thumb is not a rainbow stub'],
  [31, 'Inserting a pie chart creates a live chart'],
  [32, 'Pie thumb has multiple category colors'],
  [33, 'Pie thumb center is filled'],
  [34, 'Inserting a ring chart creates a live chart'],
  [35, 'Ring thumb has multiple category colors'],
  [36, 'Ring thumb has a hollow center'],
  [37, 'Inserting a radar chart creates a live chart'],
  [38, 'Radar thumb has both series colors'],
  [39, 'Radar thumb is not a rainbow stub'],
  [40, 'Style panel can change a chart to pie'],
  [41, 'Type change updates the live chart tag'],
  [42, 'Type change re-rasters the thumb as pie'],
  [43, 'Stack chip is available for bar charts'],
  [44, 'Stacking a bar chart keeps series colors'],
  [45, 'Two charts on one slide both stay live'],
  [46, 'First bar thumb still has series colors after other slides'],
  [47, 'Every chart type was inserted in this session'],
  [48, 'No thumb is still raster-pending'],
  [49, 'No cartesian thumb is a cropped white stub'],
  [50, 'Live canvas still has a chart after the session'],
]

async function waitForDev(timeoutMs = 60000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await fetch(DEV_URL)).ok) return true
    }
    catch { /* retry */ }
    await sleep(400)
  }
  return false
}

async function stripScan(page) {
  await page.evaluate(() => {
    document.querySelectorAll('[data-react-scan], #react-scan-root').forEach(el => el.remove())
  })
}

async function clickBox(page, locator, name) {
  await locator.waitFor({ state: 'visible', timeout: 8000 })
  let box = await locator.boundingBox()
  if (!box) box = await locator.locator('button, [role=button]').first().boundingBox()
  if (!box) throw new Error(`${name} has no box`)
  await page.mouse.click(box.x + Math.min(24, box.width / 2), box.y + box.height / 2)
}

async function clickTool(page, name) {
  await clickBox(page, page.locator(`[data-canvas-tool=${name}]`), `tool ${name}`)
  await sleep(200)
}

async function insertChart(page, type) {
  await clickTool(page, 'insert-chart')
  await clickBox(page, page.locator(`[data-chart-type=${type}]`), `pool ${type}`)
  await page.locator(`[data-element-type=chart] [data-chart-type=${type}]`).waitFor({ timeout: 8000 })
  await sleep(200)
}

async function addSlide(page) {
  await clickBox(page, page.getByText('Add slide'), 'Add slide')
  await sleep(250)
}

async function pressEscape(page) {
  await page.keyboard.press('Escape')
  await sleep(120)
}

const results = []
function rec(id, name, pass, measured) {
  results.push({ id, name, pass: !!pass, measured: measured ?? null })
}

async function readChartPaint(page) {
  return page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    const SERIES0 = [59, 91, 219]
    const SERIES1 = [28, 126, 214]
    const TEAL = [12, 166, 120]
    const AMBER = [245, 159, 0]
    const PURPLE = [112, 72, 232]
    const STUB = [248, 250, 252]
    const near = (r, g, b, t, tol = 22) => Math.abs(r - t[0]) <= tol && Math.abs(g - t[1]) <= tol && Math.abs(b - t[2]) <= tol
    const nearWhite = (r, g, b) => r > 246 && g > 246 && b > 246

    const waitPaint = async () => {
      const start = Date.now()
      while (Date.now() - start < 5000) {
        const host = document.querySelector('[data-thumb-active] [data-thumbnail-slide]')
          || document.querySelector('[data-thumbnail-slide]')
        if (host?.querySelector('canvas[data-canvas-painted]')) return host
        await sleep(80)
      }
      return document.querySelector('[data-thumb-active] [data-thumbnail-slide]')
        || document.querySelector('[data-thumbnail-slide]')
    }

    const host = await waitPaint()
    const thumbCanvas = host?.querySelector('canvas[data-canvas-painted]') || null
    const state = window.__FIKA_SLIDES__.getState()
    const slide = state.slides[state.slideIndex]
    const chart = slide?.elements.find(el => el.type === 'chart')
    const live = document.querySelector('[class*=viewport-wrapper] [data-element-type=chart] [data-live-box]')
    const liveType = live?.getAttribute('data-chart-type') || ''
    const liveCount = document.querySelectorAll('[class*=viewport-wrapper] [data-element-type=chart]').length
    const svgFills = [...document.querySelectorAll('[class*=viewport-wrapper] [data-element-type=chart] svg [fill]')]
      .map(el => (el.getAttribute('fill') || '').toLowerCase())
      .filter(fill => fill && fill !== 'none' && fill !== 'transparent')
    const hexNear = (fill, rgb) => {
      const m = fill.match(/^#([0-9a-f]{6})$/i)
      if (!m) return false
      const n = parseInt(m[1], 16)
      return near((n >> 16) & 255, (n >> 8) & 255, n & 255, rgb, 18)
    }
    const liveSeries0 = svgFills.some(fill => hexNear(fill, SERIES0) || fill.includes('59, 91, 219') || fill.includes('59,91,219'))
    const liveSeries1 = svgFills.some(fill => hexNear(fill, SERIES1) || fill.includes('28, 126, 214') || fill.includes('28,126,214'))

    const empty = {
      liveType,
      liveCount,
      liveSeries0,
      liveSeries1,
      pending: !host || !thumbCanvas,
      ink: 0,
      series0: 0,
      series1: 0,
      teal: 0,
      amber: 0,
      purple: 0,
      stubBg: 0,
      chartPixels: 0,
      centerWhite: true,
      distinct: 0,
    }
    if (!thumbCanvas || !chart) return empty

    // Crop the chart region from the final-DPR slide canvas and run the same
    // pixel analysis used for the live chart.
    const SIZE = 180
    const raster = document.createElement('canvas')
    raster.width = SIZE
    raster.height = SIZE
    const rctx = raster.getContext('2d', { willReadFrequently: true })
    rctx.fillStyle = '#ffffff'
    rctx.fillRect(0, 0, SIZE, SIZE)
    rctx.imageSmoothingEnabled = true
    const slideW = state.viewportSize
    const slideH = state.viewportSize * state.viewportRatio
    rctx.drawImage(
      thumbCanvas,
      chart.left / slideW * thumbCanvas.width,
      chart.top / slideH * thumbCanvas.height,
      chart.width / slideW * thumbCanvas.width,
      chart.height / slideH * thumbCanvas.height,
      0,
      0,
      SIZE,
      SIZE,
    )
    const { data, width, height } = rctx.getImageData(0, 0, SIZE, SIZE)
    const x0 = Math.floor(width * 0.30)
    const x1 = Math.max(x0 + 1, Math.floor(width * 0.70))
    const y0 = Math.floor(height * 0.14)
    const y1 = Math.max(y0 + 1, Math.floor(height * 0.86))
    let ink = 0
    let series0 = 0
    let series1 = 0
    let teal = 0
    let amber = 0
    let purple = 0
    let stubBg = 0
    let chartPixels = 0
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * 4
        const a = data[i + 3]
        if (a < 12) continue
        chartPixels++
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        if (!nearWhite(r, g, b)) ink++
        if (near(r, g, b, SERIES0)) series0++
        if (near(r, g, b, SERIES1)) series1++
        if (near(r, g, b, TEAL)) teal++
        if (near(r, g, b, AMBER)) amber++
        if (near(r, g, b, PURPLE)) purple++
        if (near(r, g, b, STUB, 3)) stubBg++
      }
    }
    let centerWhite = true
    for (const [fx, fy] of [[0.46, 0.44], [0.48, 0.48], [0.5, 0.46], [0.52, 0.5], [0.47, 0.52], [0.5, 0.5]]) {
      const px = Math.floor(width * fx)
      const py = Math.floor(height * fy)
      const pi = (py * width + px) * 4
      if (data[pi + 3] >= 12 && !nearWhite(data[pi], data[pi + 1], data[pi + 2])) {
        centerWhite = false
        break
      }
    }
    const distinct = [series0, series1, teal, amber, purple].filter(n => n > 4).length
    return {
      liveType,
      liveCount,
      liveSeries0,
      liveSeries1,
      pending: !thumbCanvas,
      ink,
      series0,
      series1,
      teal,
      amber,
      purple,
      stubBg,
      chartPixels,
      centerWhite,
      distinct,
    }
  })
}

async function waitChartPaint(page, pred, timeoutMs = 6000) {
  const start = Date.now()
  let last = null
  while (Date.now() - start < timeoutMs) {
    last = await readChartPaint(page)
    if (pred(last)) return last
    await sleep(120)
  }
  return last
}

const browser = await chromium.launch({ headless: true })
let child = null
try {
  let serverReady = await waitForDev(1500)
  if (!serverReady) {
    child = spawn('npm', ['run', 'dev'], { cwd: root, shell: true, stdio: 'ignore' })
    serverReady = await waitForDev(90000)
    if (!serverReady) throw new Error('dev server did not start on http://127.0.0.1:5173/')
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(DEV_URL, { waitUntil: 'networkidle' })
  await page.getByText('Add slide').waitFor({ timeout: 90000 })
  await stripScan(page)

  rec(1, 'Insert chart control is on the canvas tool', await page.locator('[data-canvas-tool=insert-chart]').count() === 1)

  await clickTool(page, 'insert-chart')
  rec(2, 'Chart pool opens from the toolbar', await page.locator('[data-chart-type]').count() >= 8)
  rec(3, 'Pool lists a bar / column chart', await page.locator('[data-chart-type=bar]').count() === 1)
  rec(4, 'Pool lists a horizontal bar chart', await page.locator('[data-chart-type=column]').count() === 1)
  rec(5, 'Pool lists a line chart', await page.locator('[data-chart-type=line]').count() === 1)
  rec(6, 'Pool lists an area chart', await page.locator('[data-chart-type=area]').count() === 1)
  rec(7, 'Pool lists a scatter chart', await page.locator('[data-chart-type=scatter]').count() === 1)
  rec(8, 'Pool lists a pie chart', await page.locator('[data-chart-type=pie]').count() === 1)
  rec(9, 'Pool lists a ring chart', await page.locator('[data-chart-type=ring]').count() === 1)
  rec(10, 'Pool lists a radar chart', await page.locator('[data-chart-type=radar]').count() === 1)

  await clickBox(page, page.locator('[data-chart-type=bar]'), 'pool bar')
  await page.locator('[data-element-type=chart] [data-chart-type=bar]').waitFor({ timeout: 8000 })
  const bar = await waitChartPaint(page, p => !p.pending && p.series0 > 8 && p.series1 > 8)
  rec(11, 'Inserting a bar chart creates a live chart', bar.liveCount >= 1, bar)
  rec(12, 'Live bar chart is tagged bar', bar.liveType === 'bar', bar)
  rec(13, 'Bar thumb rasterizes (not pending)', !bar.pending && bar.ink > 20, bar)
  rec(14, 'Bar thumb has series-1 dark blue', bar.series0 > 8, bar)
  rec(15, 'Bar thumb has series-2 light blue', bar.series1 > 8, bar)
  rec(16, 'Bar thumb is not the stub white square', bar.chartPixels > 0 && bar.stubBg / bar.chartPixels < 0.35, bar)
  rec(17, 'Bar thumb is not category-rainbow bars', bar.amber < 8 && bar.purple < 8, bar)
  rec(18, 'Live bar SVG uses both series colors', bar.liveSeries0 && bar.liveSeries1, bar)

  rec(43, 'Stack chip is available for bar charts', await page.locator('[data-chart-stack]').count() === 1)
  await clickBox(page, page.locator('[data-chart-stack]'), 'stack')
  const stacked = await waitChartPaint(page, p => !p.pending && p.series0 > 8 && p.series1 > 8)
  rec(44, 'Stacking a bar chart keeps series colors', stacked.series0 > 8 && stacked.series1 > 8 && stacked.amber < 8, stacked)
  await clickBox(page, page.locator('[data-chart-stack]'), 'unstack')
  await waitChartPaint(page, p => !p.pending && p.series0 > 8 && p.series1 > 8)

  const inserted = new Set(['bar'])
  const typeCases = {
    column: [19, 20, 21],
    line: [22, 23, 24],
    area: [25, 26, 27],
    scatter: [28, 29, 30],
    pie: [31, 32, 33],
    ring: [34, 35, 36],
    radar: [37, 38, 39],
  }

  for (const type of CHART_TYPES) {
    if (type === 'bar') continue
    await addSlide(page)
    await insertChart(page, type)
    inserted.add(type)
    const paint = await waitChartPaint(page, p => {
      if (p.pending || p.liveType !== type) return false
      if (type === 'column') return p.series0 > 6 && p.series1 > 6
      if (type === 'line' || type === 'area' || type === 'radar') return p.ink > 200 && p.liveSeries0 && p.liveSeries1
      if (type === 'scatter') return p.ink > 40 && p.liveSeries0
      if (PIE_FAMILY.has(type)) return p.distinct >= 3
      return p.ink > 20
    })
    const [liveId, colorId, extraId] = typeCases[type]
    rec(liveId, CASES[liveId - 1][1], paint.liveType === type && paint.liveCount >= 1, paint)
    if (type === 'column') {
      rec(colorId, CASES[colorId - 1][1], paint.series0 > 6 && paint.series1 > 6, paint)
      rec(extraId, CASES[extraId - 1][1], paint.amber < 8 && paint.purple < 8 && paint.stubBg / Math.max(1, paint.chartPixels) < 0.35, paint)
    }
    else if (type === 'line' || type === 'area' || type === 'radar') {
      rec(colorId, CASES[colorId - 1][1], paint.ink > 200 && paint.liveSeries0 && paint.liveSeries1, paint)
      rec(extraId, CASES[extraId - 1][1], paint.amber < 8 && paint.purple < 8 && paint.stubBg / Math.max(1, paint.chartPixels) < 0.35, paint)
    }
    else if (type === 'scatter') {
      rec(colorId, CASES[colorId - 1][1], paint.ink > 40 && paint.liveSeries0, paint)
      rec(extraId, CASES[extraId - 1][1], paint.amber < 8 && paint.purple < 8, paint)
    }
    else if (type === 'pie') {
      rec(colorId, CASES[colorId - 1][1], paint.distinct >= 3, paint)
      rec(extraId, CASES[extraId - 1][1], !paint.centerWhite, paint)
    }
    else if (type === 'ring') {
      rec(colorId, CASES[colorId - 1][1], paint.distinct >= 3, paint)
      rec(extraId, CASES[extraId - 1][1], paint.centerWhite, paint)
    }
  }

  await addSlide(page)
  await insertChart(page, 'column')
  await clickBox(page, page.locator('[data-chart-style-type=pie]'), 'style pie')
  const changed = await waitChartPaint(page, p => p.liveType === 'pie' && !p.pending && p.distinct >= 3)
  rec(40, 'Style panel can change a chart to pie', await page.locator('[data-chart-style-type=pie]').count() === 1, changed)
  rec(41, 'Type change updates the live chart tag', changed.liveType === 'pie', changed)
  rec(42, 'Type change re-rasters the thumb as pie', !changed.pending && changed.distinct >= 3 && !changed.centerWhite, changed)

  await insertChart(page, 'line')
  const two = await waitChartPaint(page, p => p.liveCount >= 2 && !p.pending)
  rec(45, 'Two charts on one slide both stay live', two.liveCount >= 2, two)

  const firstThumb = page.locator('[data-thumbnail-slide]').first()
  await clickBox(page, firstThumb, 'first thumb')
  await page.locator('[data-element-type=chart] [data-chart-type=bar]').waitFor({ timeout: 8000 })
  const back = await waitChartPaint(page, p => p.liveType === 'bar' && p.series0 > 8 && p.series1 > 8)
  rec(46, 'First bar thumb still has series colors after other slides', back.liveType === 'bar' && back.series0 > 8 && back.series1 > 8, back)

  const session = await page.evaluate(() => {
    const state = window.__FIKA_SLIDES__.getState()
    const types = state.slides.flatMap(slide => slide.elements.filter(el => el.type === 'chart').map(el => el.chartType))
    const pending = [...document.querySelectorAll('[data-thumbnail-slide]')].filter(host => !host.querySelector('canvas[data-canvas-painted]')).length
    const live = document.querySelectorAll('[class*=viewport-wrapper] [data-element-type=chart]').length
    return { types, pending, live }
  })
  rec(47, 'Every chart type was inserted in this session', CHART_TYPES.every(type => inserted.has(type) && session.types.includes(type)), { inserted: [...inserted], store: session.types })
  rec(48, 'No visible thumb is unmounted', session.pending === 0, session)

  const thumbs = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    const SERIES0 = [59, 91, 219]
    const SERIES1 = [28, 126, 214]
    const STUB = [248, 250, 252]
    const near = (r, g, b, t, tol = 22) => Math.abs(r - t[0]) <= tol && Math.abs(g - t[1]) <= tol && Math.abs(b - t[2]) <= tol
    const state = window.__FIKA_SLIDES__.getState()
    const out = []
    for (const host of document.querySelectorAll('[data-thumbnail-slide]')) {
      const slide = state.slides.find(item => item.id === host.getAttribute('data-thumbnail-slide'))
      const chart = slide?.elements.find(el => el.type === 'chart')
      const key = chart?.chartType || ''
      const canvas = host.querySelector('canvas[data-canvas-painted]')
      if (!key || !canvas || !chart) { out.push({ key, stubRatio: 1, series: 0, ink: 0 }); continue }
      const SIZE = 180
      const raster = document.createElement('canvas')
      raster.width = SIZE
      raster.height = SIZE
      const rctx = raster.getContext('2d', { willReadFrequently: true })
      rctx.fillStyle = '#ffffff'
      rctx.fillRect(0, 0, SIZE, SIZE)
      rctx.imageSmoothingEnabled = true
      const slideW = state.viewportSize
      const slideH = state.viewportSize * state.viewportRatio
      rctx.drawImage(
        canvas,
        chart.left / slideW * canvas.width,
        chart.top / slideH * canvas.height,
        chart.width / slideW * canvas.width,
        chart.height / slideH * canvas.height,
        0,
        0,
        SIZE,
        SIZE,
      )
      const { data } = rctx.getImageData(0, 0, SIZE, SIZE)
      let stub = 0
      let pix = 0
      let series = 0
      let ink = 0
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 12) continue
        pix++
        if (data[i] < 246 || data[i + 1] < 246 || data[i + 2] < 246) ink++
        if (near(data[i], data[i + 1], data[i + 2], STUB, 3)) stub++
        if (near(data[i], data[i + 1], data[i + 2], SERIES0) || near(data[i], data[i + 1], data[i + 2], SERIES1)) series++
      }
      out.push({ key, stubRatio: stub / Math.max(1, pix), series, ink })
      await sleep(0)
    }
    return out
  })
  const cartesianThumbs = thumbs.filter(t => /bar|column|line|area|radar/.test(t.key))
  rec(49, 'No cartesian thumb is a cropped white stub', cartesianThumbs.length > 0 && cartesianThumbs.every(t => t.stubRatio < 0.35 && t.ink > 80), thumbs)
  rec(50, 'Live canvas still has a chart after the session', session.live >= 1, session)

  await pressEscape(page)
}
finally {
  await browser.close()
  if (child) child.kill()
}

const failed = results.filter(r => !r.pass)
for (const row of results) {
  const mark = row.pass ? 'ok' : 'FAIL'
  console.log(`${String(row.id).padStart(2)}. ${mark}  ${row.name}`)
  if (!row.pass && row.measured) console.log('    ', JSON.stringify(row.measured))
}
console.log(`e2e-charts: ${results.length - failed.length}/${results.length} passed`)
if (results.length !== CASES.length) {
  console.error(`e2e-charts: expected ${CASES.length} cases, recorded ${results.length}`)
  process.exit(1)
}
if (failed.length) process.exit(1)
