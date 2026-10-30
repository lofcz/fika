/**
 * Gutter drag: the rail and thumbnail follow the pointer while the painted
 * canvas remains mounted. On release its resolution matches the final size.
 *
 *   node scripts/e2e-gutter-drag.mjs
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DEV_PORTS = [5173, 5174, 5175, 5176]
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function isFikaDev(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) return false
    const html = await res.text()
    return html.includes('fika-shell') || html.includes('>fika<')
  }
  catch { return false }
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

const results = []
const rec = (name, pass, measured) => results.push({ name, pass: !!pass, measured })

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
  await page.evaluate(() => {
    document.querySelectorAll('[data-react-scan]').forEach(n => n.remove())
    const rs = document.getElementById('react-scan-root')
    if (rs) rs.remove()
  })
  await page.waitForFunction(() => !!(window.__FIKA_SLIDES__ && window.__FIKA_MAIN__))

  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  await page.evaluate(() => {
    window.__FIKA_SLIDES__.getState().setSlides([{ id: 'gutter-fixture', elements: [{ id: 'blue-box', type: 'shape', left: 100, top: 100, width: 400, height: 200, rotate: 0, viewBox: [100, 100], path: 'M0 0H100V100H0Z', fill: '#145de0', fixedRatio: false }] }])
    window.__FIKA_SLIDES__.getState().updateSlideIndex(0)
  })
  await page.waitForSelector('canvas[data-canvas-painted="gutter-fixture"]')
  await page.evaluate(() => { document.querySelector('canvas[data-canvas-painted="gutter-fixture"]').dataset.testIdentity = 'original' })
  const thumbState = () => page.evaluate(() => {
    const thumb = document.querySelector('[data-thumbnail-slide="gutter-fixture"]')
    const canvas = thumb?.querySelector('canvas[data-canvas-painted]')
    const list = document.querySelector('[class*=thumbnail-list]')
    if (!thumb || !canvas || !list) return { ok: false }
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    let ink = 0
    for (let p = 0; p < pixels.length; p += 4) if (pixels[p + 3] > 128 && pixels[p + 2] > pixels[p] + 70) ink++
    return {
      ok: true,
      thumbW: Math.round(thumb.getBoundingClientRect().width),
      listW: Math.round(list.getBoundingClientRect().width),
      canvasW: canvas.width,
      cssW: canvas.getBoundingClientRect().width,
      dpr: window.devicePixelRatio,
      sameCanvas: canvas.dataset.testIdentity === 'original',
      ink,
    }
  })

  const before = await thumbState()
  rec('rail starts with a crisp painted canvas', before.ok && before.ink > 20 && Math.abs(before.canvasW - before.cssW * before.dpr) <= 1, before)

  const sep = page.locator('.layout-separator').first()
  const sepBox = await sep.boundingBox()
  const startX = sepBox.x + sepBox.width / 2
  const startY = sepBox.y + sepBox.height / 2

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + 80, startY, { steps: 10 })
  await sleep(80)
  const mid = await thumbState()
  rec(
    'mid-drag: chrome tracks the pointer (wrapper/list resize live)',
    mid.ok && mid.thumbW > before.thumbW + 60 && mid.listW > before.listW + 60,
    { before: before.thumbW, mid: mid.thumbW, listBefore: before.listW, listMid: mid.listW },
  )
  rec(
    'mid-drag: existing painted canvas stays mounted',
    mid.ok && mid.sameCanvas && mid.ink > 20,
    mid,
  )
  // A mid-drag pause must not replace or blank the canvas.
  await sleep(450)
  const midPause = await thumbState()
  rec(
    'mid-drag pause: painted canvas remains mounted and visible',
    midPause.ok && midPause.sameCanvas && midPause.ink > 20,
    midPause,
  )
  await page.mouse.move(startX + 130, startY, { steps: 6 })
  await sleep(80)
  const mid2 = await thumbState()
  rec(
    'mid-drag: chrome keeps tracking the pointer',
    mid2.ok && mid2.thumbW > mid.thumbW,
    { first: mid.thumbW, second: mid2.thumbW },
  )
  await page.mouse.move(startX + 60, startY, { steps: 6 })
  await sleep(80)
  await page.mouse.up()
  await sleep(600)

  const after = await thumbState()
  rec(
    'after release: canvas resolution matches its displayed size',
    after.ok && after.sameCanvas && after.ink > 20 && Math.abs(after.canvasW - after.cssW * after.dpr) <= 1
      && after.thumbW !== mid2.thumbW,
    { released: mid2.thumbW, after: after.thumbW },
  )

  // drag back to restore
  const sepBox2 = await sep.boundingBox()
  await page.mouse.move(sepBox2.x + sepBox2.width / 2, sepBox2.y + sepBox2.height / 2)
  await page.mouse.down()
  await page.mouse.move(sepBox2.x + sepBox2.width / 2 - 60, sepBox2.y + sepBox2.height / 2, { steps: 10 })
  await page.mouse.up()
  await sleep(600)
  const restored = await thumbState()
  rec(
    'restored: painted canvas returns to the original width',
    restored.ok && restored.sameCanvas && restored.ink > 20 && Math.abs(restored.thumbW - before.thumbW) <= 4,
    { original: before.thumbW, restored: restored.thumbW },
  )

  await page.close()
}
finally {
  await browser.close()
  if (child) child.kill()
}

const failed = results.filter(r => !r.pass)
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}`)
  if (!r.pass && r.measured) console.log('   ', JSON.stringify(r.measured))
}
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} failed`)
  process.exit(1)
}
console.log(`\n${results.length}/${results.length} passed`)
