/**
 * Thumbnail rail scroll benchmark.
 *
 * Builds a 60-slide deck (text, shapes incl. SVG-heavy paths, charts, tables,
 * images), then scrolls the editor rail top→bottom→top for several round
 * trips while measuring:
 *   - long tasks (>=50ms) during the scroll phases
 *   - frame pacing (rAF deltas) during the scroll phases
 *   - ScreenSlide mounts inside thumbs (the "recomputed over and over" cost)
 *   - blank-thumb samples while scrolling (visible rows with no ink)
 *   - snapshot stats when the app exposes window.__FIKA_THUMB_SNAP__
 *
 *   node scripts/e2e-thumb-scroll.mjs --label=after --passes=3
 *
 * Writes scripts/e2e-thumb-scroll/out/<label>.json and prints a summary.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'scripts', 'e2e-thumb-scroll', 'out')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const DEV_PORTS = [5173, 5174, 5175, 5176]

const args = process.argv.slice(2)
const labelArg = args.find(a => a.startsWith('--label='))
const passesArg = args.find(a => a.startsWith('--passes='))
const warmArg = args.find(a => a.startsWith('--warm='))
const LABEL = labelArg ? labelArg.split('=').slice(1).join('=') : 'run'
const PASSES = passesArg ? Number(passesArg.split('=')[1]) || 3 : 3
// --warm=1 waits for the background snapshot sweep to cover the deck first
// (measures the steady state); --warm=0 measures cold, like the original rail.
const WARM = warmArg ? Number(warmArg.split('=')[1]) : 0

const N_SLIDES = 60
const ROUND_TRIPS = 3
const SETTLE_MS = 1400
const SCROLL_PX_PER_STEP = 34

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const densePath = seed => {
  let d = 'M 0 0'
  let x = 0
  let y = 0
  let s = seed
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return (s % 1000) / 1000
  }
  for (let i = 0; i < 260; i++) {
    x = (x + 3 + rnd() * 6) % 960
    y = (y + 2 + rnd() * 6) % 540
    const c = rnd() > 0.5
      ? ` Q ${(x - 8).toFixed(1)} ${(y - 6).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`
      : ` L ${x.toFixed(1)} ${y.toFixed(1)}`
    d += c
  }
  return d + ' Z'
}

const textEl = (id, content, top) => ({
  id, type: 'text', left: 60, top, width: 820, height: 320, rotate: 0,
  content, defaultFontName: 'Inter', defaultColor: '#18181b',
})

const buildDeck = () => {
  const slides = []
  for (let i = 0; i < N_SLIDES; i++) {
    const kind = i % 5
    const id = `bench-${String(i).padStart(2, '0')}-${kind}`
    const elements = []
    if (kind === 0 || kind === 3) {
      elements.push(textEl(`${id}-title`, `<p style="font-size: 34px"><strong>Bench slide ${i + 1}</strong></p>`, 48))
      elements.push(textEl(
        `${id}-body`,
        `<p style="font-size: 17px; line-height: 1.5">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum.</p>`,
        130,
      ))
      elements.push(textEl(
        `${id}-list`,
        '<ul><li><p style="font-size: 16px">Alpha item</p></li><li><p style="font-size: 16px">Beta item</p></li><li><p style="font-size: 16px">Gamma item</p></li></ul>',
        420,
      ))
    }
    if (kind === 1) {
      for (let s = 0; s < 8; s++) {
        elements.push({
          id: `${id}-shape-${s}`, type: 'shape', left: 20 + (s % 4) * 235, top: 20 + Math.floor(s / 4) * 260,
          width: 220, height: 240, rotate: 0, viewBox: [960, 540], path: densePath(i * 31 + s * 7 + 1),
          fixedRatio: false, fill: `hsl(${(i * 30 + s * 40) % 360} 55% 62%)`,
        })
      }
    }
    if (kind === 2) {
      const chartType = ['bar', 'column', 'line', 'area', 'pie', 'ring', 'radar', 'scatter'][i % 8]
      elements.push({
        id: `${id}-chart`, type: 'chart', left: 70, top: 90, width: 640, height: 420, rotate: 0,
        chartType, themeColors: ['#1c7ed6', '#37b24d', '#f59f00', '#e8590c', '#7048e8'],
        data: {
          labels: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6'],
          legends: ['Series A', 'Series B', 'Series C'],
          series: [
            [11, 32, 21, 44, 36, 27],
            [22, 12, 38, 19, 31, 41],
            [7, 26, 15, 33, 24, 12],
          ],
        },
      })
      elements.push(textEl(`${id}-cap`, '<p style="font-size: 18px">Chart slide caption</p>', 540))
    }
    if (kind === 3) {
      elements.push({
        id: `${id}-img`, type: 'image', left: 120, top: 120, width: 700, height: 380, rotate: 0,
        src: TINY_PNG,
      })
    }
    if (kind === 4) {
      const cell = (r, c) => ({ id: `${id}-c${r}${c}`, colspan: 1, rowspan: 1, text: `R${r}C${c} data` })
      elements.push({
        id: `${id}-table`, type: 'table', left: 60, top: 90, width: 850, height: 430, rotate: 0,
        outline: { width: 1, color: '#dee2e6', style: 'solid' },
        theme: { color: '#1c7ed6', rowHeader: false, rowFooter: false, colHeader: true, colFooter: false },
        colWidths: [0.25, 0.25, 0.25, 0.25], cellMinHeight: 32,
        data: Array.from({ length: 8 }, (_, r) => Array.from({ length: 4 }, (_, c) => cell(r, c))),
      })
    }
    slides.push({
      id,
      elements,
      background: i % 2
        ? { type: 'solid', color: '#ffffff' }
        : { type: 'gradient', gradient: { type: 'linear', rotate: 45, colors: [{ pos: 0, color: '#f8f9fa' }, { pos: 100, color: '#e9ecef' }] } },
    })
  }
  return slides
}

async function findFikaDev() {
  for (const port of DEV_PORTS) {
    const url = `http://127.0.0.1:${port}/`
    try {
      const res = await fetch(url)
      if (res.ok) {
        const html = await res.text()
        if (html.includes('fika-shell') || html.includes('>fika<')) return url
      }
    }
    catch { /* next port */ }
  }
  return null
}

async function waitForDev(timeoutMs = 90000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const url = await findFikaDev()
    if (url) return url
    await sleep(400)
  }
  return null
}

const COLLECTOR = () => {
  window.__BENCH__ = {
    scrolling: false,
    longTasks: [],
    frames: [],
    liveMounts: 0,
    bitmapMounts: 0,
    blankSamples: 0,
    placeholderSamples: 0,
    inkedSamples: 0,
  }
  const bench = window.__BENCH__
  const rail = document.querySelector('.thumbnail-list') || document
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      if (bench.scrolling && entry.entryType === 'longtask') {
        bench.longTasks.push({ start: entry.startTime, duration: entry.duration })
      }
    }
  }).observe({ entryTypes: ['longtask'] })
  const tick = t => {
    if (bench.scrolling) bench.frames.push(t)
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  const mo = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue
        if (node.classList?.contains('screen-slide') || node.querySelector?.('.screen-slide')) {
          bench.liveMounts++
        }
        if (node.classList?.contains('thumb-snapshot') || node.querySelector?.('.thumb-snapshot')) {
          bench.bitmapMounts++
        }
      }
    }
  })
  mo.observe(rail, { childList: true, subtree: true })
  const sampleBlank = () => {
    if (bench.scrolling) {
      for (const host of document.querySelectorAll('[data-thumbnail-slide]')) {
        const rect = host.getBoundingClientRect()
        if (rect.bottom < 0 || rect.top > window.innerHeight) continue
        const inked = host.querySelector('.screen-slide, .thumb-snapshot')
        if (inked) bench.inkedSamples++
        else if (host.querySelector('.thumb-bg-placeholder')) bench.placeholderSamples++
        else bench.blankSamples++
      }
    }
    setTimeout(sampleBlank, 200)
  }
  setTimeout(sampleBlank, 200)
  return true
}

const RUN_PASS = async ({ pass }) => {
  // The whole pass runs inside ONE evaluate: element handles crossing the
  // boundary are unreliable in this app, and in-page rAF pacing resembles a
  // real wheel-driven scroll much more closely than cross-process stepping.
  return pageRef.evaluate(async ({ roundTrips, settleMs, stepPx }) => {
    const bench = window.__BENCH__
    const scroller = document.querySelector('.thumbnail-list')
    if (!scroller) throw new Error('rail scroller not found')
    const nextFrame = () => new Promise(r => requestAnimationFrame(r))
    const maxScroll = () => Math.max(0, scroller.scrollHeight - scroller.clientHeight)
    const wheel = deltaY => {
      scroller.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true, cancelable: true, deltaY, deltaMode: 0, clientX: 40, clientY: 300, view: window,
      }))
    }

    bench.longTasks = []
    bench.frames = []
    bench.liveMounts = 0
    bench.bitmapMounts = 0
    bench.blankSamples = 0
    bench.inkedSamples = 0

    scroller.scrollTop = 0
    await new Promise(r => setTimeout(r, settleMs))
    bench.scrolling = true
    for (let trip = 0; trip < roundTrips; trip++) {
      while (scroller.scrollTop < maxScroll() - 1) {
        scroller.scrollTop = Math.min(maxScroll(), scroller.scrollTop + stepPx)
        wheel(stepPx)
        await nextFrame()
      }
      await new Promise(r => setTimeout(r, settleMs))
      while (scroller.scrollTop > 1) {
        scroller.scrollTop = Math.max(0, scroller.scrollTop - stepPx)
        wheel(-stepPx)
        await nextFrame()
      }
      await new Promise(r => setTimeout(r, settleMs))
    }
    bench.scrolling = false

    const frames = bench.frames
    const deltas = []
    for (let i = 1; i < frames.length; i++) deltas.push(frames[i] - frames[i - 1])
    deltas.sort((a, b) => a - b)
    const pct = q => deltas[Math.min(deltas.length - 1, Math.floor(deltas.length * q))] || 0
    const snap = window.__FIKA_THUMB_SNAP__
    return {
      scroller: { max: maxScroll(), thumbs: document.querySelectorAll('[data-thumbnail-slide]').length },
      longTasks: bench.longTasks.map(t => ({ start: t.start, duration: t.duration })),
      longTaskTotalMs: bench.longTasks.reduce((sum, t) => sum + t.duration, 0),
      frameCount: deltas.length + 1,
      frameP50: pct(0.5),
      frameP95: pct(0.95),
      frameMax: deltas[deltas.length - 1] || 0,
      framesOver20ms: deltas.filter(d => d > 20).length,
      framesOver50ms: deltas.filter(d => d > 50).length,
      liveMounts: bench.liveMounts,
      bitmapMounts: bench.bitmapMounts,
      blankSamples: bench.blankSamples,
      placeholderSamples: bench.placeholderSamples,
      inkedSamples: bench.inkedSamples,
      snapshotStats: snap ? snap.read() : null,
    }
  }, { roundTrips: ROUND_TRIPS, settleMs: SETTLE_MS, stepPx: SCROLL_PX_PER_STEP })
}

let pageRef = null

const summarize = passes => {
  const pick = fn => {
    const values = passes.map(fn).sort((a, b) => a - b)
    return values[Math.floor(values.length / 2)]
  }
  return {
    passes: passes.length,
    longTaskCount: pick(p => p.longTasks.length),
    longTaskTotalMs: Math.round(pick(p => p.longTaskTotalMs)),
    longTaskMaxMs: Math.round(pick(p => Math.max(0, ...p.longTasks.map(t => t.duration)))),
    frameCount: pick(p => p.frameCount),
    frameP50: pick(p => p.frameP50),
    frameP95: pick(p => p.frameP95),
    frameMax: pick(p => p.frameMax),
    framesOver20ms: pick(p => p.framesOver20ms),
    framesOver50ms: pick(p => p.framesOver50ms),
    liveMounts: pick(p => p.liveMounts),
    bitmapMounts: pick(p => p.bitmapMounts),
    blankSamples: pick(p => p.blankSamples),
    placeholderSamples: pick(p => p.placeholderSamples),
    inkedSamples: pick(p => p.inkedSamples),
  }
}

const browser = await chromium.launch({ headless: true })
let child = null
try {
  let devUrl = await findFikaDev()
  if (!devUrl) {
    child = spawn('npm', ['run', 'dev'], { cwd: root, shell: true, stdio: 'ignore' })
    devUrl = await waitForDev()
    if (!devUrl) throw new Error('fika dev server did not start')
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  pageRef = page
  await page.goto(devUrl, { waitUntil: 'networkidle' })
  await page.getByText('Add slide').waitFor({ timeout: 90000 })
  await page.evaluate(() => {
    document.querySelectorAll('[data-react-scan], #react-scan-root').forEach(el => el.remove())
  })
  const hooked = await page.evaluate(() => !!(window.__FIKA_SLIDES__ && window.__FIKA_MAIN__))
  if (!hooked) throw new Error('window.__FIKA_SLIDES__ hook did not appear')

  await page.evaluate(deck => {
    window.__FIKA_SLIDES__.getState().setSlides(deck)
  }, buildDeck())
  await page.waitForSelector('[data-thumbnail-slide]', { timeout: 20000 })
  await page.evaluate(COLLECTOR)
  await sleep(2500)

  if (WARM) {
    // Let the background sweep snapshot the whole deck before measuring.
    const started = Date.now()
    for (;;) {
      const cached = await page.evaluate(() => window.__FIKA_THUMB_SNAP__ ? window.__FIKA_THUMB_SNAP__.read().cached : 0)
      if (cached >= N_SLIDES - 2 || Date.now() - started > 180000) break
      await sleep(2500)
    }
    await sleep(3000)
  }

  const passes = []
  for (let pass = 1; pass <= PASSES; pass++) {
    passes.push(await RUN_PASS({ pass }))
    const p = passes[pass - 1]
    console.log(`pass ${pass}: scrollerMax=${p.scroller.max} thumbs=${p.scroller.thumbs} longTasks=${p.longTasks.length} liveMounts=${p.liveMounts} bitmapMounts=${p.bitmapMounts} blank=${p.blankSamples}/${p.blankSamples + p.inkedSamples}`)
  }

  const summary = summarize(passes)
  const snapshotStats = passes[passes.length - 1].snapshotStats
  const report = {
    label: LABEL,
    nSlides: N_SLIDES,
    roundTrips: ROUND_TRIPS,
    settleMs: SETTLE_MS,
    warm: WARM,
    date: new Date().toISOString(),
    summary,
    snapshotStats,
    passes: passes.map(p => ({ ...p, longTasks: p.longTasks.map(t => Math.round(t.duration)) })),
  }
  mkdirSync(outDir, { recursive: true })
  const outFile = join(outDir, `${LABEL}.json`)
  writeFileSync(outFile, JSON.stringify(report, null, 2))

  console.log(`\n=== ${LABEL} (median of ${PASSES} passes) ===`)
  console.log(`long tasks (>=50ms): count=${summary.longTaskCount} total=${summary.longTaskTotalMs}ms max=${summary.longTaskMaxMs}ms`)
  console.log(`frames: n=${summary.frameCount} p50=${summary.frameP50.toFixed(1)}ms p95=${summary.frameP95.toFixed(1)}ms max=${summary.frameMax.toFixed(1)}ms over20=${summary.framesOver20ms} over50=${summary.framesOver50ms}`)
  console.log(`thumb live mounts per pass: ${summary.liveMounts}`)
  console.log(`thumb bitmap mounts per pass: ${summary.bitmapMounts}`)
  console.log(`blank visible-thumb samples: ${summary.blankSamples} / ${summary.blankSamples + summary.inkedSamples}`)
  if (snapshotStats) console.log(`snapshots: ${JSON.stringify({ cached: snapshotStats.cached, captures: snapshotStats.captures, failed: snapshotStats.failed, hostile: snapshotStats.hostile, captureMsAvg: snapshotStats.captureMsAvg, captureMsMax: snapshotStats.captureMsMax })}`)
  console.log(`wrote ${outFile}`)
}
finally {
  await browser.close()
  if (child) child.kill()
}
