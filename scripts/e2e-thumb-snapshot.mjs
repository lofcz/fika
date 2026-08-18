/**
 * Canvas thumbnail fidelity, invalidation, and DPR E2E.
 *
 * Compares the model-driven thumbnail canvas against the presenter's
 * ScreenSlide DOM reference renderer over a representative element corpus.
 *
 *   node scripts/e2e-thumb-snapshot.mjs
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'scripts', 'e2e-thumb-snapshot', 'out')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const ports = [5173, 5174, 5175, 5176]
const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const svgPath = seed => {
  let d = 'M 0 0'
  let x = 0, y = 0, s = seed
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return (s % 1000) / 1000 }
  for (let i = 0; i < 120; i++) {
    x = (x + 3 + rnd() * 6) % 960
    y = (y + 2 + rnd() * 6) % 540
    d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`
  }
  return d + ' Z'
}

const fixtures = [
  {
    name: 'text',
    tolerance: 14,
    slide: {
      id: 'canvas-fid-text',
      elements: [
        { id: 't1', type: 'text', left: 60, top: 48, width: 820, height: 90, rotate: 0, fixedHeight: true, content: '<p style="font-size:34px;text-align:center"><strong>Canvas Fidelity</strong></p>', defaultFontName: 'Arial', defaultColor: '#18181b' },
        { id: 't2', type: 'text', left: 80, top: 170, width: 760, height: 260, rotate: 0, fixedHeight: true, content: '<ul><li style="font-size:22px;color:#1c7ed6">Fast Unicode wrapping</li><li style="font-size:22px"><em>Rich inline</em> text paint</li></ul>', defaultFontName: 'Arial', defaultColor: '#333333' },
      ],
      background: { type: 'solid', color: '#ffffff' },
    },
  },
  {
    name: 'chart',
    tolerance: 8,
    slide: {
      id: 'canvas-fid-chart',
      elements: [{
        id: 'c1', type: 'chart', left: 70, top: 70, width: 780, height: 430, rotate: 0,
        chartType: 'bar', fill: '#fff', themeColors: ['#1c7ed6', '#37b24d'],
        data: { labels: ['Q1', 'Q2', 'Q3', 'Q4'], legends: ['Alpha', 'Beta'], series: [[11, 32, 21, 44], [22, 12, 38, 19]] },
      }],
      background: { type: 'solid', color: '#ffffff' },
    },
  },
  {
    name: 'svg-heavy',
    tolerance: 9,
    slide: {
      id: 'canvas-fid-svg',
      elements: Array.from({ length: 18 }, (_, index) => ({
        id: `s${index}`, type: 'shape',
        left: 18 + (index % 6) * 160, top: 20 + Math.floor(index / 6) * 170,
        width: 145, height: 150, rotate: index % 3 ? 0 : 5,
        viewBox: [960, 540], path: svgPath(index * 17 + 3), fixedRatio: false,
        fill: `hsl(${index * 31} 55% 62%)`,
      })),
      background: { type: 'solid', color: '#ffffff' },
    },
  },
  {
    name: 'image',
    tolerance: 13,
    slide: {
      id: 'canvas-fid-image',
      elements: [{ id: 'i1', type: 'image', left: 120, top: 90, width: 700, height: 400, rotate: 0, fixedRatio: false, src: tinyPng, radius: 30, outline: { width: 6, color: '#1c7ed6', style: 'solid' } }],
      background: { type: 'solid', color: '#f4f4f5' },
    },
  },
  {
    name: 'table',
    tolerance: 14,
    slide: {
      id: 'canvas-fid-table',
      elements: [{
        id: 'tb1', type: 'table', left: 60, top: 70, width: 850, height: 440, rotate: 0,
        outline: { width: 1, color: '#dee2e6', style: 'solid' },
        theme: { color: '#1c7ed6', rowHeader: true, rowFooter: false, colHeader: false, colFooter: false },
        colWidths: [0.25, 0.25, 0.25, 0.25], cellMinHeight: 50,
        data: Array.from({ length: 8 }, (_, r) => Array.from({ length: 4 }, (_, c) => ({
          id: `cell-${r}-${c}`, colspan: 1, rowspan: 1, text: `R${r + 1} C${c + 1}`,
          style: r === 0 ? { bold: true, color: '#fff', align: 'center' } : { align: 'center' },
        }))),
      }],
      background: { type: 'solid', color: '#ffffff' },
    },
  },
  {
    name: 'gradient',
    tolerance: 5,
    slide: {
      id: 'canvas-fid-gradient',
      elements: [{ id: 'g1', type: 'text', left: 80, top: 230, width: 760, height: 100, rotate: 0, fixedHeight: true, content: '<p style="font-size:36px;text-align:center">Gradient surface</p>', defaultFontName: 'Arial', defaultColor: '#ffffff' }],
      background: { type: 'gradient', gradient: { type: 'linear', rotate: 45, colors: [{ pos: 0, color: '#1c7ed6' }, { pos: 100, color: '#7048e8' }] } },
    },
  },
]
const fillers = Array.from({ length: 18 }, (_, index) => ({
  id: `canvas-filler-${index}`,
  elements: [{ id: `ft-${index}`, type: 'text', left: 80, top: 220, width: 800, height: 100, rotate: 0, content: `<p style="font-size:30px">Filler ${index}</p>`, defaultFontName: 'Arial', defaultColor: '#18181b' }],
  background: { type: 'solid', color: '#fff' },
}))

async function findDevServer() {
  for (const port of ports) {
    const url = `http://127.0.0.1:${port}/`
    try {
      const response = await fetch(url)
      if (response.ok && (await response.text()).includes('fika')) return url
    }
    catch { /* try next */ }
  }
  return null
}

const results = []
const record = (name, pass, measured) => results.push({ name, pass: !!pass, measured })

const diffPngs = (page, reference, actual) => page.evaluate(async ([reference64, actual64]) => {
  const load = src => new Promise(resolve => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.src = src
  })
  const [a, b] = await Promise.all([
    load(`data:image/png;base64,${reference64}`),
    load(`data:image/png;base64,${actual64}`),
  ])
  const width = b.width
  const height = b.height
  const ca = new OffscreenCanvas(width, height)
  const cb = new OffscreenCanvas(width, height)
  const actx = ca.getContext('2d', { willReadFrequently: true })
  const bctx = cb.getContext('2d', { willReadFrequently: true })
  actx.drawImage(a, 0, 0, width, height)
  bctx.drawImage(b, 0, 0, width, height)
  const ap = actx.getImageData(0, 0, width, height).data
  const bp = bctx.getImageData(0, 0, width, height).data
  let differing = 0
  let totalDelta = 0
  for (let i = 0; i < ap.length; i += 4) {
    const delta = Math.max(
      Math.abs(ap[i] - bp[i]),
      Math.abs(ap[i + 1] - bp[i + 1]),
      Math.abs(ap[i + 2] - bp[i + 2]),
      Math.abs(ap[i + 3] - bp[i + 3]),
    )
    if (delta > 18) differing++
    totalDelta += delta
  }
  const pixels = ap.length / 4
  return {
    differingPct: +((differing / pixels) * 100).toFixed(3),
    avgDelta: +(totalDelta / pixels).toFixed(2),
    width,
    height,
  }
}, [reference.toString('base64'), actual.toString('base64')])

const browser = await chromium.launch({ headless: true })
let child
try {
  let url = await findDevServer()
  if (!url) {
    child = spawn('npm', ['run', 'dev'], { cwd: root, shell: true, stdio: 'ignore' })
    const started = Date.now()
    while (!url && Date.now() - started < 90_000) {
      await sleep(400)
      url = await findDevServer()
    }
  }
  if (!url) throw new Error('Fika dev server did not start')

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.getByText('Add slide').waitFor({ timeout: 90_000 })
  const deck = [
    ...fixtures.map(item => item.slide),
    ...fillers,
  ]
  await page.evaluate(value => window.__FIKA_SLIDES__.getState().setSlides(value), deck)

  const referencePage = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  await referencePage.goto(url, { waitUntil: 'networkidle' })
  await referencePage.getByText('Add slide').waitFor({ timeout: 90_000 })
  await referencePage.evaluate(value => window.__FIKA_SLIDES__.getState().setSlides(value), deck)
  await referencePage.locator('[data-editor-tool=present]').click()
  await referencePage.waitForSelector('[data-screen-current] > div', { timeout: 20_000 })

  for (let index = 0; index < fixtures.length; index++) {
    const fixture = fixtures[index]
    await page.evaluate(i => window.__FIKA_SLIDES__.getState().updateSlideIndex(i), index)
    await referencePage.evaluate(i => window.__FIKA_SLIDES__.getState().updateSlideIndex(i), index)
    const selector = `[data-thumbnail-slide="${fixture.slide.id}"]`
    await page.waitForSelector(`${selector} canvas[data-canvas-painted="${fixture.slide.id}"]`, { timeout: 20_000 })
    await sleep(fixture.name === 'chart' ? 1_500 : 500)
    await referencePage.waitForSelector(`[data-screen-slide="${index}"][data-screen-current] > div`, { timeout: 10_000 })
    const reference = await referencePage.locator(`[data-screen-slide="${index}"][data-screen-current] > div`).screenshot()
    const actual = await page.locator(`${selector} canvas`).screenshot()
    const diff = await diffPngs(page, reference, actual)
    const pass = diff.differingPct <= fixture.tolerance && diff.avgDelta <= fixture.tolerance * 1.7
    record(`fidelity:${fixture.name}`, pass, { ...diff, tolerance: fixture.tolerance })
    if (!pass) {
      mkdirSync(outDir, { recursive: true })
      writeFileSync(join(outDir, `${fixture.name}-editor.png`), reference)
      writeFileSync(join(outDir, `${fixture.name}-canvas.png`), actual)
    }
  }

  await page.evaluate(() => window.__FIKA_SLIDES__.getState().updateSlideIndex(0))
  const textSelector = '[data-thumbnail-slide="canvas-fid-text"]'
  await page.waitForSelector(`${textSelector} canvas[data-canvas-painted="canvas-fid-text"]`)
  const before = await page.locator(`${textSelector} canvas`).screenshot()
  await page.evaluate(() => {
    const state = window.__FIKA_SLIDES__.getState()
    const slide = state.slides[0]
    state.updateSlide({
      id: slide.id,
      elements: slide.elements.map(element => element.id === 't1'
        ? { ...element, content: '<p style="font-size:34px;text-align:center"><strong>EDITED CANVAS</strong></p>' }
        : element),
    })
  })
  await sleep(350)
  const after = await page.locator(`${textSelector} canvas`).screenshot()
  const editDiff = await diffPngs(page, before, after)
  record('invalidation:edit', editDiff.differingPct > 0.1, editDiff)

  const architecture = await page.evaluate(() => {
    const canvases = [...document.querySelectorAll('[data-thumbnail-slide] canvas')]
    return {
      count: canvases.length,
      exactDpr: canvases.every(canvas => Math.abs(canvas.width - Math.round(canvas.clientWidth * devicePixelRatio)) <= 1),
      screenSlidesInRail: document.querySelectorAll('.thumbnail-list .screen-slide').length,
      report: window.__FIKA_CANVAS_PAINT__?.read?.(),
    }
  })
  record('sharpness:exact-dpr', architecture.count > 0 && architecture.exactDpr, architecture)
  record('architecture:no-screen-slide-mounts', architecture.screenSlidesInRail === 0, architecture)

  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify({ results, paint: architecture.report }, null, 2))
}
finally {
  await browser.close()
  if (child) child.kill()
}

for (const result of results) {
  console.log(`${result.pass ? 'PASS' : 'FAIL'} ${result.name} ${JSON.stringify(result.measured)}`)
}
const failed = results.filter(result => !result.pass)
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} failed`)
  process.exit(1)
}
console.log(`\n${results.length}/${results.length} passed`)
