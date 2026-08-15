/**
 * Reproduces the Houby thumb z-order bug: rescale a lower shape and the
 * raster used to paint it above text. Stack order must follow slide.elements.
 *
 *   node scripts/e2e-raster-zorder.mjs
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const DEV_PORTS = [5173, 5174, 5175, 5176, 5188]

const BEIGE = { r: 246, g: 235, b: 212 }
const TITLE = 'HOUBY'

const stackSlide = {
  id: 'e2e-zorder-houby',
  background: { type: 'solid', color: '#ffffff' },
  elements: [
    {
      id: 'e2e-zorder-beige',
      type: 'shape',
      left: 40,
      top: 40,
      width: 720,
      height: 360,
      rotate: 0,
      viewBox: [200, 200],
      path: 'M 0 0 L 200 0 L 200 200 L 0 200 Z',
      fill: '#F6EBD4',
      fixedRatio: false,
    },
    {
      id: 'e2e-zorder-title',
      type: 'text',
      left: 80,
      top: 120,
      width: 560,
      height: 140,
      rotate: 0,
      content: `<p style="font-size: 72px; color: #111111">${TITLE}</p>`,
      defaultFontName: 'Arial',
      defaultColor: '#111111',
    },
  ],
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
  while (Date.now() - start < 20000) {
    if (await page.evaluate(() => !!(window.__FIKA_SLIDES__ && window.__FIKA_RASTER__))) return
    await sleep(250)
  }
  throw new Error('fika store / raster hooks did not appear')
}

async function waitIdle(page) {
  const start = Date.now()
  let last = -1
  let stable = 0
  while (Date.now() - start < 12000) {
    const stats = await page.evaluate(() => window.__FIKA_RASTER__.read())
    const token = stats.fullPaints + stats.patchPaints + stats.elementInvalidations
    if (token === last) {
      stable += 1
      if (stable >= 4 && stats.fullPaints + stats.patchPaints > 0) return stats
    }
    else {
      stable = 0
      last = token
    }
    await sleep(80)
  }
  return page.evaluate(() => window.__FIKA_RASTER__.read())
}

async function sampleTitleRegion(page, slideIdPrefix) {
  return page.evaluate(({ prefix, beige }) => {
    const host = [...document.querySelectorAll('[data-thumbnail-slide]')].find(el => (
      el.getAttribute('data-thumbnail-slide')?.startsWith(prefix)
    ))
    const canvas = host?.querySelector('[data-preview-raster]') || host?.querySelector('canvas')
    const slides = window.__FIKA_SLIDES__.getState()
    const slide = slides.slides.find(item => item.id.startsWith(prefix))
    const title = slide?.elements.find(el => el.id === 'e2e-zorder-title')
    if (!canvas || !canvas.width || !canvas.height || !title) {
      return { dark: 0, beige: 0, ink: 0, id: host?.getAttribute('data-thumbnail-slide') || null }
    }
    const slideW = slides.viewportSize
    const slideH = slideW * slides.viewportRatio
    const sx = Math.round((title.left + title.width * 0.35) / slideW * canvas.width)
    const sy = Math.round((title.top + title.height * 0.45) / slideH * canvas.height)
    const rw = Math.max(8, Math.round(title.width * 0.4 / slideW * canvas.width))
    const rh = Math.max(8, Math.round(title.height * 0.35 / slideH * canvas.height))
    const data = canvas.getContext('2d', { willReadFrequently: true }).getImageData(
      Math.max(0, sx),
      Math.max(0, sy),
      Math.min(rw, canvas.width - sx),
      Math.min(rh, canvas.height - sy),
    ).data
    let dark = 0
    let beigeHits = 0
    let ink = 0
    for (let p = 0; p < data.length; p += 4) {
      const a = data[p + 3]
      if (a < 12) continue
      const r = data[p]
      const g = data[p + 1]
      const b = data[p + 2]
      if (r < 80 && g < 80 && b < 80) dark += 1
      if (Math.abs(r - beige.r) < 28 && Math.abs(g - beige.g) < 28 && Math.abs(b - beige.b) < 28) beigeHits += 1
      if (r < 248 || g < 248 || b < 248) ink += 1
    }
    return {
      dark,
      beige: beigeHits,
      ink,
      id: host.getAttribute('data-thumbnail-slide'),
      canvas: { w: canvas.width, h: canvas.height },
    }
  }, { prefix: slideIdPrefix, beige: BEIGE })
}

const results = []
function rec(name, pass, measured) {
  results.push({ name, pass: !!pass, measured: measured ?? null })
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

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  await page.goto(devUrl, { waitUntil: 'networkidle' })
  await page.getByText('Add slide').waitFor({ timeout: 90000 })
  await page.evaluate(() => {
    document.querySelectorAll('[data-react-scan], #react-scan-root').forEach(el => el.remove())
  })
  await waitForHooks(page)

  const injected = await page.evaluate((next) => {
    window.__FIKA_RASTER__.reset()
    window.__FIKA_SLIDES__.getState().addSlide({
      id: `${next.id}-${Date.now()}`,
      elements: next.elements,
      background: next.background,
    })
    return true
  }, stackSlide)
  if (!injected) throw new Error('could not inject z-order slide')

  await waitIdle(page)
  const before = await sampleTitleRegion(page, stackSlide.id)
  rec('before rescale, title ink sits above beige', before.dark > 12, before)

  const resized = await page.evaluate(() => {
    const slides = window.__FIKA_SLIDES__.getState()
    const slide = slides.slides.find(item => item.id.startsWith('e2e-zorder-houby'))
    const beige = slide?.elements.find(el => el.id === 'e2e-zorder-beige')
    if (!slide || !beige) return null
    const orderBefore = slide.elements.map(el => el.id)
    slides.updateElement({
      id: 'e2e-zorder-beige',
      slideId: slide.id,
      props: { width: beige.width - 80, height: beige.height - 40 },
    })
    const after = slides.slides.find(item => item.id === slide.id)
    return {
      orderBefore,
      orderAfter: after.elements.map(el => el.id),
      width: after.elements.find(el => el.id === 'e2e-zorder-beige')?.width,
    }
  })
  rec('rescale keeps the authored element order', !!resized && resized.orderBefore.join() === resized.orderAfter.join(), resized)

  await waitIdle(page)
  const after = await sampleTitleRegion(page, stackSlide.id)
  rec('after rescale, title ink still sits above beige', after.dark > 12 && after.dark >= before.dark * 0.5, { before, after })
}
finally {
  await browser.close()
  if (child) child.kill()
}

const failed = results.filter(item => !item.pass)
for (const item of results) {
  console.log(`${item.pass ? 'PASS' : 'FAIL'} ${item.name}`)
  if (!item.pass && item.measured) console.log('   ', item.measured)
}
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} failed`)
  process.exit(1)
}
console.log(`\n${results.length}/${results.length} passed`)
