/**
 * TEMP: measure the jump + snapdom capture cost.
 * 1) human-like drag with pauses: count freeze/unfreeze (transform) cycles
 * 2) snapdom per-thumb capture timings (the user's bitmap idea)
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { FIXED_FIT_DECK_PPTX } from '../tests/fixtures/paths.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DEV_PORTS = [5173, 5174, 5175, 5176]
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function isFikaDev(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) return false
    const html = await res.text()
    return html.includes('fika-shell') || html.includes('>fika<')
  } catch { return false }
}
async function waitForDev(timeoutMs = 60000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    for (const port of DEV_PORTS) {
      const url = `http://127.0.0.1:${port}/`
      if (await isFikaDev(url)) return url
    }
    await sleep(400)
  }
  return null
}

const browser = await chromium.launch({ headless: true })
let child = null
try {
  let devUrl = await waitForDev(1500)
  if (!devUrl) {
    child = spawn('npm', ['run', 'dev'], { cwd: root, shell: true, stdio: 'ignore' })
    devUrl = await waitForDev(90000)
    if (!devUrl) throw new Error('dev server did not start')
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(devUrl, { waitUntil: 'networkidle' })
  await page.getByText('Add slide').waitFor({ timeout: 90000 })
  await page.evaluate(() => {
    document.querySelectorAll('[data-react-scan]').forEach(n => n.remove())
    const rs = document.getElementById('react-scan-root')
    if (rs) rs.remove()
  })
  await page.waitForFunction(() => !!(window.__FIKA_SLIDES__ && window.__FIKA_MAIN__))

  const input = page.locator('input[type=file][accept*=".pptx"]')
  await input.setInputFiles(FIXED_FIT_DECK_PPTX)
  const replace = page.getByText('Replace', { exact: true })
  if (await replace.waitFor({ timeout: 10000 }).then(() => true).catch(() => false)) await replace.click()
  await page.getByText('Jan Hus', { exact: false }).first().waitFor({ timeout: 180000 })
  await sleep(800)
  await page.evaluate(() => {
    const slides = window.__FIKA_SLIDES__.getState()
    const orig = [...slides.slides]
    const clones = []
    let i = 0
    while (slides.slides.length + clones.length < 28) {
      clones.push({ ...orig[i % orig.length], id: `perf-${clones.length}` })
      i++
    }
    slides.addSlide(clones)
    slides.updateSlideIndex(0)
  })
  await sleep(1500)

  // poll the rows transform during the drag; count frozen<->cleared cycles
  await page.evaluate(() => {
    window.__JUMP__ = { samples: [] }
    window.__PERF__ = { frames: [] }
    let last = performance.now()
    const read = () => {
      const list = document.querySelector('[class*=thumbnail-list]')
      const rows = list?.firstElementChild
      window.__JUMP__.samples.push(rows ? (rows.style.transform ? 'scaled' : 'clear') : 'none')
    }
    const t = setInterval(read, 40)
    const tick = () => {
      const now = performance.now()
      window.__PERF__.frames.push(Math.round((now - last) * 10) / 10)
      last = now
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    window.__JUMP__.stop = () => clearInterval(t)
  })

  const sep = page.locator('.layout-separator').first()
  const sepBox = await sep.boundingBox()
  const startX = sepBox.x + sepBox.width / 2
  const startY = sepBox.y + sepBox.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  // human-like: irregular pauses, several > 120ms (the debounce fires mid-drag)
  const moves = [
    [30, 40], [70, 200], [100, 90], [40, 260], [90, 150],
    [130, 220], [60, 80], [110, 300], [80, 120], [50, 180],
  ]
  for (const [dx, pause] of moves) {
    await page.mouse.move(startX + dx, startY, { steps: 4 })
    await sleep(pause)
  }
  await page.mouse.up()
  await sleep(400)
  const jump = await page.evaluate(() => {
    window.__JUMP__.stop()
    const s = window.__JUMP__.samples
    let cycles = 0
    let prev = s[0]
    for (const v of s.slice(1)) {
      if (v !== prev) cycles++
      prev = v
    }
    const frames = window.__PERF__.frames
    const sorted = [...frames].sort((a, b) => a - b)
    const pct = p => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
    return {
      samples: s.length,
      transitions: cycles,
      frames: frames.length,
      meanMs: +(frames.reduce((a, b) => a + b, 0) / Math.max(1, frames.length)).toFixed(1),
      p95: pct(0.95),
      over32: frames.filter(f => f > 32).length,
    }
  })
  console.log('pause-y drag result:', JSON.stringify(jump))

  // snapdom capture cost: the dependency was removed by the live-rail
  // migration (no capture engine in the app anymore) — nothing to measure.
  console.log('snapdom: not installed (removed with the raster pipeline)')
  await page.close()
} finally {
  await browser.close()
  if (child) child.kill()
}
