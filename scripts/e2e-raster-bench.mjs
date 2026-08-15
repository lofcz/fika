/**
 * Measured raster benchmark on the Sciobot desktop deck.
 *
 *   node scripts/e2e-raster-bench.mjs
 *
 * Copies Desktop/Sciobot (1).pptx into public/, imports it, then reports
 * organic (during import) and cold-repaint timings from __FIKA_RASTER__.
 */
import { existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DEV_PORTS = [5173, 5174, 5175, 5176]
const DESKTOP_PPTX = join(process.env.USERPROFILE || '', 'Desktop', 'Sciobot (1).pptx')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const round = value => Math.round(value)
const pct = (part, total) => (total ? `${Math.round((part / total) * 100)}%` : '0%')

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
  const override = process.env.FIKA_DEV_URL
  if (override) return override.endsWith('/') ? override : `${override}/`
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
  while (Date.now() - start < 30000) {
    if (await page.evaluate(() => !!(window.__FIKA_SLIDES__ && window.__FIKA_RASTER__))) return
    await sleep(250)
  }
  throw new Error('fika store / raster hooks did not appear')
}

async function raster(page) {
  return page.evaluate(() => window.__FIKA_RASTER__.read())
}

async function waitRaster(page, predicate, timeoutMs = 180000) {
  const start = Date.now()
  let last = null
  while (Date.now() - start < timeoutMs) {
    last = await raster(page)
    if (predicate(last)) return last
    await sleep(120)
  }
  return last
}

function printReport(title, report) {
  console.log(`\n=== ${title} ===`)
  console.log(JSON.stringify(report, null, 2))
}

if (!existsSync(DESKTOP_PPTX)) {
  console.error(`Missing benchmark deck: ${DESKTOP_PPTX}`)
  process.exit(1)
}

const mb = statSync(DESKTOP_PPTX).size / (1024 * 1024)
console.log(`deck: ${DESKTOP_PPTX} (${mb.toFixed(1)} MB)`)

const browser = await chromium.launch({ headless: true })
try {
  const devUrl = await waitForDev(1500)
  if (!devUrl) throw new Error('fika dev server is not running')

  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  })
  page.setDefaultTimeout(300000)
  await page.goto(devUrl, { waitUntil: 'networkidle' })
  await page.getByText('Add slide').waitFor({ timeout: 90000 })
  await waitForHooks(page)

  await page.evaluate(() => {
    window.__FIKA_RASTER__.markSession?.() || window.__FIKA_RASTER__.reset()
  })
  const importStarted = Date.now()
  const fileInput = page.locator('input[type=file][accept*=".pptx"]')
  await fileInput.waitFor({ state: 'attached', timeout: 15000 })
  await fileInput.setInputFiles(DESKTOP_PPTX)
  const replaceBtn = page.getByRole('button', { name: /replace/i }).first()
  try {
    await replaceBtn.waitFor({ state: 'visible', timeout: 8000 })
    await replaceBtn.click()
  }
  catch {
    // cover import may apply without a confirm dialog
  }
  const imported = await page.evaluate(async () => {
    const start = Date.now()
    let last = 0
    let stable = 0
    while (Date.now() - start < 300000) {
      const slides = window.__FIKA_SLIDES__.getState().slides
      if (slides.length === last && slides.length > 1) {
        stable += 1
        if (stable >= 10) {
          const types = {}
          let elements = 0
          let images = 0
          for (const slide of slides) {
            for (const el of slide.elements) {
              elements += 1
              types[el.type] = (types[el.type] || 0) + 1
              if (el.type === 'image') images += 1
            }
          }
          return { ok: true, slides: slides.length, elements, images, types }
        }
      }
      else {
        stable = 0
        last = slides.length
      }
      await new Promise(resolve => setTimeout(resolve, 300))
    }
    return { ok: false, slides: window.__FIKA_SLIDES__.getState().slides.length }
  })
  const importMs = Date.now() - importStarted
  if (!imported?.ok) throw new Error(`import failed: ${JSON.stringify(imported)}`)

  const organic = await waitRaster(page, stats => (
    stats.firstBlitMs != null && stats.fullPaints >= Math.min(3, imported.slides)
  ), 180000)
  const visible = await page.evaluate(() => (
    [...document.querySelectorAll('[data-thumbnail-slide]')].map(host => ({
      id: host.getAttribute('data-thumbnail-slide'),
      pending: host.hasAttribute('data-raster-pending'),
      hasCanvas: !!host.querySelector('canvas'),
    }))
  ))

  const organicReport = {
    importMs,
    deck: imported,
    visibleThumbs: visible.length,
    visiblePending: visible.filter(item => item.pending).length,
    firstBlitMs: organic.firstBlitMs,
    viewportReadyMs: organic.viewportReadyMs,
    currentHqMs: organic.currentHqMs,
    paints: {
      full: organic.fullPaints,
      patch: organic.patchPaints,
      lq: organic.lqPaints,
      hq: organic.hqPaints,
      booths: organic.booths,
      boothHits: organic.boothHits,
    },
    phaseMs: organic.timings,
    phaseShare: Object.fromEntries(
      Object.entries(organic.timings || {}).map(([key, value]) => [key, pct(value, organic.timings.slide)]),
    ),
    slowestSlides: [...(organic.slideSamples || [])].sort((a, b) => b.ms - a.ms).slice(0, 8),
  }
  printReport('organic (import + first paints)', organicReport)

  const canCold = await page.evaluate(() => typeof window.__FIKA_RASTER__.coldPaintVisible === 'function')
  if (!canCold) {
    console.warn('coldPaintVisible is not on this build — organic timings only')
    printReport('baseline summary', {
      deckMb: Number(mb.toFixed(1)),
      slides: imported.slides,
      elements: imported.elements,
      images: imported.images,
      importMs,
      organicFirstBlitMs: organic.firstBlitMs,
      organicViewportMs: organic.viewportReadyMs,
      note: 'restart fika dev to pick up raster timing hooks',
    })
  }
  else {
  await page.evaluate(() => window.__FIKA_RASTER__.coldPaintVisible())
  const cold = await waitRaster(page, stats => (
    stats.firstBlitMs != null && stats.viewportReadyMs != null && stats.fullPaints > 0
  ), 180000)
  const coldVisible = await page.evaluate(() => (
    [...document.querySelectorAll('[data-thumbnail-slide]')].every(host => (
      !host.hasAttribute('data-raster-pending') && !!host.querySelector('canvas')
    ))
  ))
  const coldReport = {
    firstBlitMs: cold.firstBlitMs,
    viewportReadyMs: cold.viewportReadyMs,
    currentHqMs: cold.currentHqMs,
    visibleReady: coldVisible,
    paints: {
      full: cold.fullPaints,
      patch: cold.patchPaints,
      lq: cold.lqPaints,
      hq: cold.hqPaints,
      booths: cold.booths,
      boothHits: cold.boothHits,
    },
    phaseMs: cold.timings,
    phaseShare: Object.fromEntries(
      Object.entries(cold.timings || {}).map(([key, value]) => [key, pct(value, cold.timings.slide)]),
    ),
    slowestSlides: [...(cold.slideSamples || [])].sort((a, b) => b.ms - a.ms).slice(0, 8),
    avgSlideMs: cold.slideSamples?.length
      ? round(cold.slideSamples.reduce((sum, item) => sum + item.ms, 0) / cold.slideSamples.length)
      : null,
  }
  printReport('cold visible repaint', coldReport)

  const baseline = {
    deckMb: Number(mb.toFixed(1)),
    slides: imported.slides,
    elements: imported.elements,
    images: imported.images,
    importMs,
    organicFirstBlitMs: organic.firstBlitMs,
    organicViewportMs: organic.viewportReadyMs,
    coldFirstBlitMs: cold.firstBlitMs,
    coldViewportMs: cold.viewportReadyMs,
    coldCurrentHqMs: cold.currentHqMs,
    coldPhaseMs: cold.timings,
    dominantPhase: Object.entries(cold.timings || {})
      .filter(([key]) => key !== 'slide')
      .sort((a, b) => b[1] - a[1])[0],
  }
  printReport('baseline summary', baseline)
  }
}
finally {
  await browser.close()
}
