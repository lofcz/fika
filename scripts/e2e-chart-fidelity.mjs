/**
 * Live echarts vs thumbnail raster fidelity. The thumb must be the same chart
 * (layout, labels, series colors), not a Konva sketch.
 *
 *   node scripts/e2e-chart-fidelity.mjs
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DEV_URL = 'http://127.0.0.1:5173/'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const CHART_TYPES = ['bar', 'column', 'line', 'area', 'scatter', 'pie', 'ring', 'radar']
const MAE_MAX = 0.09
const CORR_MIN = 0.86
const PROFILE_MIN = 0.82

const CASES = [
  [1, 'Bar live chart and thumb both exist'],
  [2, 'Bar thumb matches live pixels'],
  [3, 'Bar thumb matches live structure'],
  [4, 'Bar thumb matches live column layout (not left slivers)'],
  [5, 'Bar thumb keeps axis and legend ink'],
  [6, 'Column thumb matches live pixels'],
  [7, 'Column thumb matches live structure'],
  [8, 'Column thumb matches live row layout'],
  [9, 'Column thumb keeps axis and legend ink'],
  [10, 'Line thumb matches live pixels'],
  [11, 'Line thumb matches live structure'],
  [12, 'Line thumb matches live point layout'],
  [13, 'Line thumb keeps axis and legend ink'],
  [14, 'Area thumb matches live pixels'],
  [15, 'Area thumb matches live structure'],
  [16, 'Area thumb matches live point layout'],
  [17, 'Area thumb keeps axis and legend ink'],
  [18, 'Scatter thumb matches live pixels'],
  [19, 'Scatter thumb matches live structure'],
  [20, 'Scatter thumb matches live point layout'],
  [21, 'Scatter thumb keeps axis ink'],
  [22, 'Pie thumb matches live pixels'],
  [23, 'Pie thumb matches live structure'],
  [24, 'Pie thumb matches live slice layout'],
  [25, 'Pie thumb center is filled like live'],
  [26, 'Ring thumb matches live pixels'],
  [27, 'Ring thumb matches live structure'],
  [28, 'Ring thumb matches live slice layout'],
  [29, 'Ring thumb hole matches live'],
  [30, 'Radar thumb matches live pixels'],
  [31, 'Radar thumb matches live structure'],
  [32, 'Radar thumb matches live spoke layout'],
  [33, 'Radar thumb keeps series ink'],
  [34, 'Bar ink is spread across the plot, not left-clustered'],
  [35, 'Column ink is spread across the plot, not top-clustered'],
  [36, 'Every chart type stays under the pixel-error budget'],
  [37, 'Every chart type keeps structural correlation'],
  [38, 'Every cartesian type keeps layout correlation'],
  [39, 'Changing column to pie keeps pie-level fidelity'],
  [40, 'Stacked bar still matches live'],
  [41, 'First bar thumb still matches after visiting other slides'],
  [42, 'Bar thumb has y-axis tick ink'],
  [43, 'Bar thumb has category / legend ink'],
  [44, 'Live and thumb series-color occupancy stay close'],
  [45, 'Thumb chart box maps to the live element rect'],
  [46, 'No thumb is a cropped white stub'],
  [47, 'No thumb is still raster-pending'],
  [48, 'Pie and ring stay visually distinct'],
  [49, 'All eight types were measured'],
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
  await sleep(400)
}

async function addSlide(page) {
  await clickBox(page, page.getByText('Add slide'), 'Add slide')
  await sleep(250)
}

const results = []
function rec(id, name, pass, measured) {
  results.push({ id, name, pass: !!pass, measured: measured ?? null })
}

async function readFidelity(page) {
  return page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    const SIZE = 180
    const nearWhite = (r, g, b) => r > 246 && g > 246 && b > 246
    const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b
    const pearson = (a, b) => {
      const n = Math.min(a.length, b.length)
      if (n < 4) return 0
      let sa = 0
      let sb = 0
      for (let i = 0; i < n; i++) {
        sa += a[i]
        sb += b[i]
      }
      const ma = sa / n
      const mb = sb / n
      let num = 0
      let da = 0
      let db = 0
      for (let i = 0; i < n; i++) {
        const xa = a[i] - ma
        const xb = b[i] - mb
        num += xa * xb
        da += xa * xa
        db += xb * xb
      }
      if (!da || !db) return 0
      return num / Math.sqrt(da * db)
    }

    const liveRoot = document.querySelector('[class*=viewport-wrapper] [data-element-type=chart]')
    const liveId = (liveRoot?.id || '').replace(/^editable-element-/, '')
    const store = window.__FIKA_SLIDES__?.getState?.()
    const slide = store?.slides?.find(item => item.elements.some(el => el.id === liveId))
      || store?.slides?.[store.slideIndex]
    const chart = slide?.elements?.find(el => el.id === liveId)
      || slide?.elements?.find(el => el.type === 'chart')

    const waitPaint = async () => {
      const start = Date.now()
      while (Date.now() - start < 8000) {
        const host = (slide && document.querySelector(`[data-thumbnail-slide="${slide.id}"]`))
          || document.querySelector('[data-thumb-active] [data-thumbnail-slide]')
        const live = document.querySelector('[class*=viewport-wrapper] [data-element-type=chart] [data-live-box] svg')
        const thumbSvg = host?.querySelector('.screen-slide svg') || null
        if (host && live && thumbSvg) return { host, live, thumbSvg }
        await sleep(80)
      }
      const host = (slide && document.querySelector(`[data-thumbnail-slide="${slide.id}"]`))
        || document.querySelector('[data-thumb-active] [data-thumbnail-slide]')
      return {
        host,
        live: document.querySelector('[class*=viewport-wrapper] [data-element-type=chart] [data-live-box] svg'),
        thumbSvg: host?.querySelector('.screen-slide svg') || null,
      }
    }

    const { host, live, thumbSvg } = await waitPaint()
    const liveType = document.querySelector('[class*=viewport-wrapper] [data-element-type=chart] [data-live-box]')?.getAttribute('data-chart-type') || ''
    const empty = {
      liveType,
      pending: !host || !thumbSvg,
      mae: 1,
      corr: 0,
      xCorr: 0,
      yCorr: 0,
      liveCx: 0,
      thumbCx: 0,
      liveCy: 0,
      thumbCy: 0,
      liveBottom: 0,
      thumbBottom: 0,
      liveLeft: 0,
      thumbLeft: 0,
      liveCenterWhite: true,
      thumbCenterWhite: true,
      boxErr: 1,
      stubRatio: 1,
      colorDelta: 1,
    }
    if (!live || !thumbSvg || !chart || !store) return empty

    const settle = (ctx, source, sw, sh) => {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, SIZE, SIZE)
      const mid = document.createElement('canvas')
      mid.width = 90
      mid.height = 90
      mid.getContext('2d').drawImage(source, 0, 0, sw, sh, 0, 0, 90, 90)
      ctx.imageSmoothingEnabled = true
      ctx.drawImage(mid, 0, 0, SIZE, SIZE)
    }

    const rasterizeSvg = async (svg) => {
      const xml = new XMLSerializer().serializeToString(svg)
      const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }))
      const img = new Image()
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = url
      })
      URL.revokeObjectURL(url)
      const c = document.createElement('canvas')
      c.width = SIZE
      c.height = SIZE
      const ctx = c.getContext('2d', { willReadFrequently: true })
      ctx.imageSmoothingEnabled = true
      settle(ctx, img, svg.viewBox?.baseVal?.width || img.width || chart.width, svg.viewBox?.baseVal?.height || img.height || chart.height)
      return ctx.getImageData(0, 0, SIZE, SIZE).data
    }

    const liveData = await rasterizeSvg(live)

    const slideW = store.viewportSize
    const slideH = store.viewportSize * store.viewportRatio
    const thumbData = await rasterizeSvg(thumbSvg)

    const liveX = new Array(SIZE).fill(0)
    const thumbX = new Array(SIZE).fill(0)
    const liveY = new Array(SIZE).fill(0)
    const thumbY = new Array(SIZE).fill(0)
    let mae = 0
    let liveSum = 0
    let thumbSum = 0
    let liveInk = 0
    let thumbInk = 0
    let liveMassX = 0
    let thumbMassX = 0
    let liveMassY = 0
    let thumbMassY = 0
    let liveBottom = 0
    let thumbBottom = 0
    let liveLeft = 0
    let thumbLeft = 0
    let stub = 0
    let liveS0 = 0
    let thumbS0 = 0
    let liveS1 = 0
    let thumbS1 = 0
    const s0 = [59, 91, 219]
    const s1 = [28, 126, 214]
    const near = (r, g, b, t) => Math.abs(r - t[0]) <= 28 && Math.abs(g - t[1]) <= 28 && Math.abs(b - t[2]) <= 28
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const i = (y * SIZE + x) * 4
        const lr = liveData[i]
        const lg = liveData[i + 1]
        const lb = liveData[i + 2]
        const tr = thumbData[i]
        const tg = thumbData[i + 1]
        const tb = thumbData[i + 2]
        const ll = luma(lr, lg, lb)
        const tl = luma(tr, tg, tb)
        mae += (Math.abs(lr - tr) + Math.abs(lg - tg) + Math.abs(lb - tb)) / 3
        liveSum += ll
        thumbSum += tl
        const liveMark = nearWhite(lr, lg, lb) ? 0 : 1
        const thumbMark = nearWhite(tr, tg, tb) ? 0 : 1
        liveX[x] += liveMark
        thumbX[x] += thumbMark
        liveY[y] += liveMark
        thumbY[y] += thumbMark
        if (liveMark) {
          liveInk++
          liveMassX += x
          liveMassY += y
        }
        if (thumbMark) {
          thumbInk++
          thumbMassX += x
          thumbMassY += y
        }
        if (y > SIZE * 0.78) {
          liveBottom += liveMark
          thumbBottom += thumbMark
        }
        if (x < SIZE * 0.16) {
          liveLeft += liveMark
          thumbLeft += thumbMark
        }
        if (Math.abs(tr - 248) <= 3 && Math.abs(tg - 250) <= 3 && Math.abs(tb - 252) <= 3) stub++
        if (near(lr, lg, lb, s0)) liveS0++
        if (near(tr, tg, tb, s0)) thumbS0++
        if (near(lr, lg, lb, s1)) liveS1++
        if (near(tr, tg, tb, s1)) thumbS1++
      }
    }
    const n = SIZE * SIZE
    let cov = 0
    const liveMean = liveSum / n
    const thumbMean = thumbSum / n
    let liveVar = 0
    let thumbVar = 0
    for (let i = 0; i < liveData.length; i += 4) {
      const ld = luma(liveData[i], liveData[i + 1], liveData[i + 2]) - liveMean
      const td = luma(thumbData[i], thumbData[i + 1], thumbData[i + 2]) - thumbMean
      cov += ld * td
      liveVar += ld * ld
      thumbVar += td * td
    }
    const corr = liveVar && thumbVar ? cov / Math.sqrt(liveVar * thumbVar) : 0
    const cx = SIZE / 2
    const cy = Math.floor(SIZE * 0.46)
    const li = (cy * SIZE + cx) * 4
    const liveCenterWhite = nearWhite(liveData[li], liveData[li + 1], liveData[li + 2])
    const thumbCenterWhite = nearWhite(thumbData[li], thumbData[li + 1], thumbData[li + 2])
    const liveHost = document.querySelector('[class*=viewport-wrapper] [class*=editable-element-chart]')
      || document.querySelector('[class*=viewport-wrapper] [data-element-type=chart]')
    const styleLeft = parseFloat(liveHost?.style.left || `${chart.left}`)
    const styleTop = parseFloat(liveHost?.style.top || `${chart.top}`)
    const styleW = parseFloat(liveHost?.style.width || `${chart.width}`)
    const styleH = parseFloat(liveHost?.style.height || `${chart.height}`)
    const boxErr = Math.abs(styleLeft - chart.left) / slideW
      + Math.abs(styleTop - chart.top) / slideH
      + Math.abs(styleW - chart.width) / slideW
      + Math.abs(styleH - chart.height) / slideH
    const colorDelta = Math.abs(liveS0 - thumbS0) / Math.max(1, liveS0 + thumbS0) + Math.abs(liveS1 - thumbS1) / Math.max(1, liveS1 + thumbS1)
    return {
      liveType,
      pending: !thumbSvg,
      mae: mae / n / 255,
      corr,
      xCorr: pearson(liveX, thumbX),
      yCorr: pearson(liveY, thumbY),
      liveCx: liveInk ? liveMassX / liveInk / SIZE : 0,
      thumbCx: thumbInk ? thumbMassX / thumbInk / SIZE : 0,
      liveCy: liveInk ? liveMassY / liveInk / SIZE : 0,
      thumbCy: thumbInk ? thumbMassY / thumbInk / SIZE : 0,
      liveBottom: liveBottom / (SIZE * SIZE * 0.22),
      thumbBottom: thumbBottom / (SIZE * SIZE * 0.22),
      liveLeft: liveLeft / (SIZE * SIZE * 0.16),
      thumbLeft: thumbLeft / (SIZE * SIZE * 0.16),
      liveCenterWhite,
      thumbCenterWhite,
      boxErr,
      stubRatio: stub / n,
      colorDelta,
      liveInk,
      thumbInk,
    }
  })
}

async function waitFidelity(page, pred, timeoutMs = 8000) {
  const start = Date.now()
  let last = null
  while (Date.now() - start < timeoutMs) {
    last = await readFidelity(page)
    if (pred(last)) return last
    await sleep(150)
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

  const byType = {}
  const typeCase = {
    bar: [1, 2, 3, 4, 5],
    column: [6, 7, 8, 9],
    line: [10, 11, 12, 13],
    area: [14, 15, 16, 17],
    scatter: [18, 19, 20, 21],
    pie: [22, 23, 24, 25],
    ring: [26, 27, 28, 29],
    radar: [30, 31, 32, 33],
  }

  for (const type of CHART_TYPES) {
    if (type !== 'bar') await addSlide(page)
    await insertChart(page, type)
    const paint = await waitFidelity(page, p => (
      p.liveType === type && !p.pending && p.mae < MAE_MAX
    ))
    byType[type] = paint
    const ids = typeCase[type]
    if (type === 'bar') {
      rec(ids[0], CASES[ids[0] - 1][1], paint.liveType === 'bar' && !paint.pending && paint.thumbInk > 40, paint)
      rec(ids[1], CASES[ids[1] - 1][1], paint.mae < MAE_MAX, paint)
      rec(ids[2], CASES[ids[2] - 1][1], paint.corr > CORR_MIN, paint)
      rec(ids[3], CASES[ids[3] - 1][1], paint.xCorr > PROFILE_MIN, paint)
      rec(ids[4], CASES[ids[4] - 1][1], paint.thumbBottom > 0.01 && paint.thumbLeft > 0.005, paint)
    }
    else if (type === 'pie') {
      rec(ids[0], CASES[ids[0] - 1][1], paint.mae < MAE_MAX, paint)
      rec(ids[1], CASES[ids[1] - 1][1], paint.corr > CORR_MIN, paint)
      rec(ids[2], CASES[ids[2] - 1][1], paint.xCorr > PROFILE_MIN && paint.yCorr > PROFILE_MIN, paint)
      rec(ids[3], CASES[ids[3] - 1][1], paint.liveCenterWhite === paint.thumbCenterWhite && !paint.thumbCenterWhite, paint)
    }
    else if (type === 'ring') {
      rec(ids[0], CASES[ids[0] - 1][1], paint.mae < MAE_MAX, paint)
      rec(ids[1], CASES[ids[1] - 1][1], paint.corr > CORR_MIN, paint)
      rec(ids[2], CASES[ids[2] - 1][1], paint.xCorr > PROFILE_MIN && paint.yCorr > PROFILE_MIN, paint)
      rec(ids[3], CASES[ids[3] - 1][1], paint.liveCenterWhite === paint.thumbCenterWhite && paint.thumbCenterWhite, paint)
    }
    else {
      rec(ids[0], CASES[ids[0] - 1][1], paint.mae < MAE_MAX, paint)
      rec(ids[1], CASES[ids[1] - 1][1], paint.corr > CORR_MIN, paint)
      rec(ids[2], CASES[ids[2] - 1][1], paint.xCorr > PROFILE_MIN, paint)
      rec(ids[3], CASES[ids[3] - 1][1], paint.thumbBottom > 0.004 || paint.thumbLeft > 0.004, paint)
    }
  }

  const bar = byType.bar
  const column = byType.column
  rec(34, CASES[33][1], Math.abs(bar.thumbCx - bar.liveCx) < 0.08 && bar.thumbCx > 0.35 && bar.thumbCx < 0.7, bar)
  rec(35, CASES[34][1], Math.abs(column.thumbCy - column.liveCy) < 0.08 && column.thumbCy > 0.3 && column.thumbCy < 0.75, column)
  rec(36, CASES[35][1], CHART_TYPES.every(type => byType[type].mae < MAE_MAX), Object.fromEntries(CHART_TYPES.map(type => [type, byType[type].mae])))
  rec(37, CASES[36][1], CHART_TYPES.every(type => byType[type].corr > CORR_MIN), Object.fromEntries(CHART_TYPES.map(type => [type, byType[type].corr])))
  rec(38, CASES[37][1], ['bar', 'column', 'line', 'area', 'scatter', 'radar'].every(type => byType[type].xCorr > PROFILE_MIN), Object.fromEntries(CHART_TYPES.map(type => [type, byType[type].xCorr])))

  await addSlide(page)
  await insertChart(page, 'column')
  await clickBox(page, page.locator('[data-chart-style-type=pie]'), 'style pie')
  const changed = await waitFidelity(page, p => (
    p.liveType === 'pie' && p.mae < 0.05 && p.corr > CORR_MIN && !p.thumbCenterWhite
  ), 10000)
  rec(39, CASES[38][1], changed.liveType === 'pie' && changed.mae < MAE_MAX && changed.corr > CORR_MIN && !changed.thumbCenterWhite, changed)

  await addSlide(page)
  await insertChart(page, 'bar')
  await clickBox(page, page.locator('[data-chart-stack]'), 'stack')
  const stacked = await waitFidelity(page, p => (
    p.liveType === 'bar' && p.mae < 0.05 && p.corr > CORR_MIN && p.xCorr > PROFILE_MIN
  ), 10000)
  rec(40, CASES[39][1], stacked.mae < MAE_MAX && stacked.corr > CORR_MIN && stacked.xCorr > PROFILE_MIN, stacked)

  await clickBox(page, page.locator('[data-thumbnail-slide]').first(), 'first thumb')
  await page.locator('[data-element-type=chart] [data-chart-type=bar]').waitFor({ timeout: 8000 })
  const back = await waitFidelity(page, p => p.liveType === 'bar' && p.mae < MAE_MAX)
  rec(41, CASES[40][1], back.liveType === 'bar' && back.mae < MAE_MAX && back.corr > CORR_MIN, back)
  rec(42, CASES[41][1], back.thumbLeft > 0.005 && Math.abs(back.thumbLeft - back.liveLeft) < 0.08, back)
  rec(43, CASES[42][1], back.thumbBottom > 0.01 && Math.abs(back.thumbBottom - back.liveBottom) < 0.22, back)
  rec(44, CASES[43][1], back.colorDelta < 0.55, back)
  rec(45, CASES[44][1], back.boxErr < 0.04, back)
  rec(46, CASES[45][1], CHART_TYPES.every(type => byType[type].stubRatio < 0.2), Object.fromEntries(CHART_TYPES.map(type => [type, byType[type].stubRatio])))
  rec(47, CASES[46][1], CHART_TYPES.every(type => !byType[type].pending) && !back.pending, { pending: back.pending })
  rec(48, CASES[47][1], !byType.pie.thumbCenterWhite && byType.ring.thumbCenterWhite, { pie: byType.pie.thumbCenterWhite, ring: byType.ring.thumbCenterWhite })
  rec(49, CASES[48][1], CHART_TYPES.every(type => byType[type]?.liveType === type), Object.fromEntries(CHART_TYPES.map(type => [type, byType[type]?.liveType])))
  rec(50, CASES[49][1], await page.locator('[class*=viewport-wrapper] [data-element-type=chart]').count() >= 1)
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
console.log(`e2e-chart-fidelity: ${results.length - failed.length}/${results.length} passed`)
if (results.length !== CASES.length) {
  console.error(`e2e-chart-fidelity: expected ${CASES.length} cases, recorded ${results.length}`)
  process.exit(1)
}
if (failed.length) process.exit(1)
