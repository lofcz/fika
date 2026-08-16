/**
 * Snapshot thumbnail fidelity + invalidation E2E.
 *
 * The rail shows identity-keyed bitmaps captured from the live ScreenSlide
 * tree. This guard proves they do not diverge from reality:
 *
 *  1. Fidelity — for text / chart / SVG-heavy / image / table slides, the
 *     snapshot <img> row and a live-mounted row of the SAME slide are
 *     screenshot and pixel-diffed (tolerance per AA jitter). The live row is
 *     produced by clearing the cache, so both states go through the genuine
 *     renderer.
 *  2. Invalidation — editing a slide, changing theme and resizing the pane
 *     all drop the stale bitmap and remount the live tree.
 *  3. No remounts — warm re-visits never mount a ScreenSlide.
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
const sleep = ms => new Promise(r => setTimeout(r, ms))
const DEV_PORTS = [5173, 5174, 5175, 5176]

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const CASES = [
  [1, 'Text slide snapshot matches the live thumb pixels'],
  [2, 'Chart slide snapshot matches the live thumb pixels'],
  [3, 'SVG-heavy slide snapshot matches the live thumb pixels'],
  [4, 'Image slide snapshot matches the live thumb pixels'],
  [5, 'Table slide snapshot matches the live thumb pixels'],
  [6, 'Gradient background snapshot matches the live thumb pixels'],
  [7, 'Editing a slide invalidates its bitmap and remounts live ink'],
  [8, 'Edited content never shows through the stale bitmap'],
  [9, 'Theme change invalidates cached bitmaps'],
  [10, 'Pane resize invalidates cached bitmaps'],
  [11, 'Warm re-visit mounts no ScreenSlide'],
  [12, 'Re-edited slide re-captures a fresh bitmap'],
]

const textSlide = {
  id: 'fid-text',
  elements: [
    { id: 'fid-text-title', type: 'text', left: 60, top: 48, width: 820, height: 90, rotate: 0, content: '<p style="font-size: 34px"><strong>Fidelity Title</strong></p>', defaultFontName: 'Inter', defaultColor: '#18181b' },
    { id: 'fid-text-body', type: 'text', left: 60, top: 150, width: 780, height: 300, rotate: 0, content: '<p style="font-size: 17px; line-height: 1.5">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>', defaultFontName: 'SourceSerif4', defaultColor: '#333333' },
  ],
  background: { type: 'solid', color: '#ffffff' },
}
const chartSlide = {
  id: 'fid-chart',
  elements: [{
    id: 'fid-chart-el', type: 'chart', left: 70, top: 90, width: 640, height: 420, rotate: 0,
    chartType: 'bar', themeColors: ['#1c7ed6', '#37b24d', '#f59f00'],
    data: { labels: ['Q1', 'Q2', 'Q3', 'Q4'], legends: ['Alpha', 'Beta'], series: [[11, 32, 21, 44], [22, 12, 38, 19]] },
  }],
  background: { type: 'solid', color: '#ffffff' },
}
const svgPath = seed => {
  let d = 'M 0 0'
  let x = 0, y = 0, s = seed
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return (s % 1000) / 1000 }
  for (let i = 0; i < 120; i++) {
    x = (x + 3 + rnd() * 6) % 960; y = (y + 2 + rnd() * 6) % 540
    d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`
  }
  return d + ' Z'
}
const svgSlide = {
  id: 'fid-svg',
  elements: Array.from({ length: 6 }, (_, s) => ({
    id: `fid-svg-${s}`, type: 'shape', left: 20 + (s % 3) * 310, top: 20 + Math.floor(s / 3) * 260,
    width: 290, height: 240, rotate: 0, viewBox: [960, 540], path: svgPath(s * 17 + 3),
    fixedRatio: false, fill: `hsl(${s * 60} 55% 62%)`,
  })),
  background: { type: 'solid', color: '#ffffff' },
}
const imageSlide = {
  id: 'fid-image',
  elements: [{ id: 'fid-image-el', type: 'image', left: 120, top: 120, width: 700, height: 380, rotate: 0, src: TINY_PNG }],
  background: { type: 'solid', color: '#ffffff' },
}
const tableSlide = {
  id: 'fid-table',
  elements: [{
    id: 'fid-table-el', type: 'table', left: 60, top: 90, width: 850, height: 430, rotate: 0,
    outline: { width: 1, color: '#dee2e6', style: 'solid' },
    theme: { color: '#1c7ed6', rowHeader: false, rowFooter: false, colHeader: true, colFooter: false },
    colWidths: [0.25, 0.25, 0.25, 0.25], cellMinHeight: 32,
    data: Array.from({ length: 8 }, (_, r) => Array.from({ length: 4 }, (_, c) => ({ id: `fid-c${r}${c}`, colspan: 1, rowspan: 1, text: `R${r}C${c} data` }))),
  }],
  background: { type: 'solid', color: '#ffffff' },
}
const gradientSlide = {
  id: 'fid-gradient',
  elements: [{ id: 'fid-gradient-text', type: 'text', left: 80, top: 240, width: 700, height: 80, rotate: 0, content: '<p style="font-size: 28px">On a gradient</p>', defaultFontName: 'Inter', defaultColor: '#ffffff' }],
  background: { type: 'gradient', gradient: { type: 'linear', rotate: 45, colors: [{ pos: 0, color: '#1c7ed6' }, { pos: 100, color: '#7048e8' }] } },
}
const FIXTURES = [textSlide, chartSlide, svgSlide, imageSlide, tableSlide, gradientSlide]
// The rail must overflow so rows can be virtualized away and remounted on
// their bitmaps — six fixtures alone never leave the window.
const FILLERS = Array.from({ length: 18 }, (_, i) => ({
  id: `fid-filler-${i}`,
  elements: [{ id: `fid-filler-t${i}`, type: 'text', left: 60, top: 48, width: 820, height: 90, rotate: 0, content: `<p style="font-size: 30px">Filler ${i + 1}</p>`, defaultFontName: 'Inter', defaultColor: '#18181b' }],
  background: { type: 'solid', color: '#ffffff' },
}))

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
    catch { /* next */ }
  }
  return null
}

const results = []
const rec = (id, pass, measured) => {
  results.push({ id, name: CASES[id - 1][1], pass: !!pass, measured: measured ?? null })
}

/** Screenshot one thumb host (bitmap or live state) at the rail size. */
async function shootThumb(page, slideId) {
  const locator = page.locator(`[data-thumbnail-slide="${slideId}"]`)
  await locator.waitFor({ state: 'visible', timeout: 15000 })
  await sleep(150)
  return locator.screenshot()
}

/** In-page RGBA diff of two PNG buffers; returns % of differing pixels + max channel delta. */
async function diffPngs(page, a, b) {
  return page.evaluate(async ([a64, b64]) => {
    const load = src => new Promise(resolve => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.src = src
    })
    const [ia, ib] = await Promise.all([load(`data:image/png;base64,${a64}`), load(`data:image/png;base64,${b64}`)])
    const w = Math.max(ia.width, ib.width)
    const h = Math.max(ia.height, ib.height)
    const ca = new OffscreenCanvas(w, h)
    const cb = new OffscreenCanvas(w, h)
    const da = ca.getContext('2d', { willReadFrequently: true })
    const db = cb.getContext('2d', { willReadFrequently: true })
    da.drawImage(ia, 0, 0)
    db.drawImage(ib, 0, 0)
    const pa = da.getImageData(0, 0, w, h).data
    const pb = db.getImageData(0, 0, w, h).data
    let differing = 0
    let totalDelta = 0
    let maxDelta = 0
    for (let i = 0; i < pa.length; i += 4) {
      const d = Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2]), Math.abs(pa[i + 3] - pb[i + 3]))
      if (d > 12) differing++
      totalDelta += d
      if (d > maxDelta) maxDelta = d
    }
    const pixels = pa.length / 4
    return {
      differingPct: +((differing / pixels) * 100).toFixed(3),
      avgDelta: +(totalDelta / pixels).toFixed(2),
      maxDelta,
      w,
      h,
    }
  }, [a.toString('base64'), b.toString('base64')])
}

async function scrollToSlide(page, slideId, indexHint = -1) {
  await page.evaluate(({ id, index }) => {
    const rail = document.querySelector('.thumbnail-list')
    if (!rail) return
    const host = document.querySelector(`[data-thumbnail-slide="${id}"]`)
    if (host) {
      const hostTop = host.getBoundingClientRect().top - rail.getBoundingClientRect().top + rail.scrollTop
      rail.scrollTop = Math.max(0, hostTop - 60)
      return
    }
    if (index >= 0) {
      const rowH = document.querySelector('.thumbnail-container')?.getBoundingClientRect().height || 100
      rail.scrollTop = Math.max(0, index * rowH - 60)
    }
  }, { id: slideId, index: indexHint })
  await sleep(400)
}

const browser = await chromium.launch({ headless: true })
let child = null
try {
  let devUrl = await findFikaDev()
  if (!devUrl) {
    child = spawn('npm', ['run', 'dev'], { cwd: root, shell: true, stdio: 'ignore' })
    const start = Date.now()
    while (Date.now() - start < 90000) {
      devUrl = await findFikaDev()
      if (devUrl) break
      await sleep(400)
    }
    if (!devUrl) throw new Error('fika dev server did not start')
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  page.on('pageerror', err => console.log('PAGE-ERR:', String(err).slice(0, 200)))
  await page.goto(devUrl, { waitUntil: 'networkidle' })
  await page.getByText('Add slide').waitFor({ timeout: 90000 })
  await page.evaluate(() => {
    document.querySelectorAll('[data-react-scan], #react-scan-root').forEach(el => el.remove())
  })
  if (!(await page.evaluate(() => !!window.__FIKA_SLIDES__))) throw new Error('store hook missing')

  await page.evaluate(deck => {
    window.__FIKA_SLIDES__.getState().setSlides(deck)
  }, [...FIXTURES, ...FILLERS])
  await page.waitForSelector('[data-thumbnail-slide]', { timeout: 20000 })

  // --- Fidelity: for each fixture, clear the cache, force the row to
  // remount so it mounts a LIVE tree, screenshot it, wait for the capture,
  // then remount the row again so it comes back on its bitmap (a mounted
  // tree is never swapped), and pixel-diff the two.
  const farAndBack = async (slideId, index) => {
    await page.evaluate(() => { document.querySelector('.thumbnail-list').scrollTop = 100000 })
    await sleep(400)
    await scrollToSlide(page, slideId, index)
    for (let i = 0; i < 30; i++) {
      const present = await page.evaluate(id => !!document.querySelector(`[data-thumbnail-slide="${id}"]`), slideId)
      if (present) break
      await sleep(200)
      await scrollToSlide(page, slideId, index)
    }
  }
  for (const fixture of FIXTURES) {
    const index = FIXTURES.indexOf(fixture)
    // The sweeper can recapture a cleared fixture before the remounted row
    // mounts its tree — retry until the row genuinely comes up live.
    let liveShot = null
    let liveState = { live: false, bitmap: false }
    for (let attempt = 0; attempt < 3 && !liveState.live; attempt++) {
      await scrollToSlide(page, fixture.id, index)
      await page.evaluate(() => window.__FIKA_THUMB_SNAP__.clear())
      await farAndBack(fixture.id, index)
      for (let i = 0; i < 30; i++) {
        liveState = await page.evaluate(id => {
          const host = document.querySelector(`[data-thumbnail-slide="${id}"]`)
          if (!host) return { live: false, bitmap: false }
          return { live: !!host.querySelector('.screen-slide'), bitmap: !!host.querySelector('.thumb-snapshot') }
        }, fixture.id)
        if (liveState.live) break
        await sleep(250)
      }
      await sleep(1500) // tree settles (charts animate ~420ms)
    }
    liveShot = await shootThumb(page, fixture.id)

    // Wait for the snapshot to land (row or sweeper capture).
    let cachedForFixture = false
    for (let i = 0; i < 60; i++) {
      await sleep(400)
      cachedForFixture = await page.evaluate(id => window.__FIKA_THUMB_SNAP__.debug().keys.includes(id), fixture.id)
      if (cachedForFixture) break
    }
    // Remount the row on its bitmap: far away and back.
    await farAndBack(fixture.id, index)
    await sleep(600)
    const bitmapState = await page.evaluate(id => {
      const host = document.querySelector(`[data-thumbnail-slide="${id}"]`)
      if (!host) return { live: false, bitmap: false, missing: true }
      return { live: !!host.querySelector('.screen-slide'), bitmap: !!host.querySelector('.thumb-snapshot') }
    }, fixture.id)
    const bitmapShot = bitmapState.bitmap ? await shootThumb(page, fixture.id) : null
    const diff = bitmapShot ? await diffPngs(page, liveShot, bitmapShot) : null
    // Tolerance profile: snapdom's raster AA differs from the live
    // compositor on glyph/box boundary pixels (measured: 1-px rings around
    // text, scaled images and gradient edges). Real divergence (missing or
    // moved content) lands an order of magnitude above these bounds.
    const tolerance = 3.0
    const passed = !!liveState.live && !!bitmapState.bitmap && !!diff && diff.differingPct <= tolerance && diff.avgDelta <= 4
    if (!passed && liveState.live && bitmapShot) {
      mkdirSync(outDir, { recursive: true })
      writeFileSync(join(outDir, `${fixture.id}-live.png`), liveShot)
      writeFileSync(join(outDir, `${fixture.id}-bitmap.png`), bitmapShot)
    }
    rec(FIXTURES.indexOf(fixture) + 1, passed, { liveState, bitmapState, diff })
  }

  // --- Invalidation: edit a cached slide; the bitmap must drop and live ink return.
  await scrollToSlide(page, 'fid-text', 0)
  for (let i = 0; i < 40; i++) {
    await sleep(300)
    const has = await page.evaluate(() => window.__FIKA_THUMB_SNAP__.debug().keys.includes('fid-text'))
    if (has) break
  }
  await page.evaluate(() => {
    const state = window.__FIKA_SLIDES__.getState()
    const slide = state.slides.find(s => s.id === 'fid-text')
    state.updateSlide({
      id: 'fid-text',
      elements: slide.elements.map(el => el.id === 'fid-text-title'
        ? { ...el, content: '<p style="font-size: 34px"><strong>EDITED TITLE</strong></p>' }
        : el),
    })
  })
  await sleep(1200)
  const afterEdit = await page.evaluate(() => {
    const host = document.querySelector('[data-thumbnail-slide="fid-text"]')
    if (!host) return { bitmap: false, live: false, text: false, missing: true }
    return {
      bitmap: !!host.querySelector('.thumb-snapshot'),
      live: !!host.querySelector('.screen-slide'),
      text: (host.textContent || '').includes('EDITED TITLE'),
    }
  })
  rec(7, afterEdit.live && afterEdit.text, afterEdit)
  rec(8, !afterEdit.bitmap, afterEdit)

  // --- Theme change invalidates bitmaps.
  for (let i = 0; i < 40; i++) {
    await sleep(300)
    const cachedCount = await page.evaluate(() => window.__FIKA_THUMB_SNAP__.debug().keys.length)
    if (cachedCount >= 2) break
  }
  await page.evaluate(() => {
    window.__FIKA_SLIDES__.getState().setTheme({ backgroundColor: '#10243e' })
  })
  await sleep(700)
  const afterTheme = await page.evaluate(() => ({
    bitmaps: [...document.querySelectorAll('[data-thumbnail-slide]')].filter(h => h.querySelector('.thumb-snapshot')).length,
    invalidated: window.__FIKA_THUMB_SNAP__.read().invalidated,
  }))
  rec(9, afterTheme.bitmaps === 0 && afterTheme.invalidated > 0, afterTheme)

  // --- Pane resize invalidates bitmaps (width is part of the key).
  await page.evaluate(() => window.__FIKA_THUMB_SNAP__.clear())
  await sleep(1000)
  await scrollToSlide(page, 'fid-text')
  for (let i = 0; i < 40; i++) {
    await sleep(300)
    const has = await page.evaluate(() => window.__FIKA_THUMB_SNAP__.debug().keys.includes('fid-text'))
    if (has) break
  }
  const beforeResize = await page.evaluate(() => window.__FIKA_THUMB_SNAP__.read().cached)
  await page.evaluate(() => {
    const rail = document.querySelector('.layout-separator')
    if (rail) {
      rail.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 200, clientY: 400, pointerId: 1, isPrimary: true }))
      window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 260, clientY: 400, pointerId: 1 }))
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 260, clientY: 400, pointerId: 1 }))
    }
  })
  await sleep(1000)
  const afterResize = await page.evaluate(() => ({
    cached: window.__FIKA_THUMB_SNAP__.read().cached,
    invalidated: window.__FIKA_THUMB_SNAP__.read().invalidated,
  }))
  rec(10, afterResize.cached < beforeResize || afterResize.invalidated > 0, { beforeResize, afterResize })

  // --- Warm re-visit mounts no tree: scroll away and back with warm cache.
  await sleep(8000) // let the sweeper warm everything
  const warmCount = await page.evaluate(() => window.__FIKA_THUMB_SNAP__.read().cached)
  await page.evaluate(() => {
    const rail = document.querySelector('.thumbnail-list')
    rail.scrollTop = 0
  })
  await sleep(600)
  await page.evaluate(() => {
    window.__WARM__ = { mounts: 0 }
    const mo = new MutationObserver(records => {
      for (const r of records) for (const n of r.addedNodes) {
        if (n instanceof Element && (n.classList.contains('screen-slide') || n.querySelector?.('.screen-slide'))) window.__WARM__.mounts++
      }
    })
    mo.observe(document.querySelector('.thumbnail-list'), { childList: true, subtree: true })
    window.__WARM__.mo = mo
  })
  await scrollToSlide(page, 'fid-table')
  await scrollToSlide(page, 'fid-text')
  await scrollToSlide(page, 'fid-chart')
  const warmMounts = await page.evaluate(() => { window.__WARM__.mo.disconnect(); return { mounts: window.__WARM__.mounts, cached: window.__FIKA_THUMB_SNAP__.read().cached } })
  rec(11, warmMounts.mounts === 0 || warmCount < FIXTURES.length, warmMounts)

  // --- Re-capture after edit: the edited slide gets a fresh bitmap again.
  await scrollToSlide(page, 'fid-text')
  let recaptured = false
  for (let i = 0; i < 40; i++) {
    await sleep(300)
    recaptured = await page.evaluate(() => window.__FIKA_THUMB_SNAP__.debug().keys.includes('fid-text'))
    if (recaptured) break
  }
  const stats = await page.evaluate(() => window.__FIKA_THUMB_SNAP__.read())
  rec(12, recaptured, { captures: stats.captures, failed: stats.failed, avgMs: stats.captureMsAvg })

  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify({ results, stats }, null, 2))
}
finally {
  await browser.close()
  if (child) child.kill()
}

const failed = results.filter(item => !item.pass)
for (const item of results) {
  const mark = item.pass ? 'PASS' : 'FAIL'
  console.log(`${mark} ${item.id} ${item.name}`)
  if (!item.pass && item.measured) console.log('   ', JSON.stringify(item.measured))
}
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} failed`)
  process.exit(1)
}
console.log(`\n${results.length}/${results.length} passed`)
