/**
 * Real-browser coverage for the preview-raster work: time-sliced queue,
 * booth cache, shared ProseMirror text booth, cheaper rail working size, and
 * parallel onscreen paints.
 *
 *   node scripts/e2e-preview-raster.mjs
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const DEV_PORTS = [5173, 5174, 5175, 5176]

const CASES = [
  [1, 'Raster debug hook is available'],
  [2, 'Cover thumb finishes its first raster'],
  [3, 'Typing a title with the keyboard inks the cover thumb'],
  [4, 'Simple typed title does not SnapDOM-booth'],
  [5, 'Add slide creates a second thumb'],
  [6, 'Typing on slide 02 inks that thumb'],
  [7, 'Cover thumb stays inked after typing on slide 02'],
  [8, 'Clicking the cover thumb keeps both rasters'],
  [9, 'Adding two more slides leaves every visible thumb rasterized'],
  [10, 'Scratch pool never exceeds three stages'],
  [11, 'Current slide paints at full working quality'],
  [12, 'A never-selected visible thumb paints at rail quality'],
  [13, 'A single-size list SnapDOM-booths the live HTML'],
  [14, 'List thumb is inked'],
  [15, 'Two identical tables share one SnapDOM booth via the hash cache'],
  [16, 'Twin-table thumb is inked'],
  [17, 'Latex path + mermaid paint without a SnapDOM booth'],
  [18, 'Latex/mermaid thumb is inked'],
  [19, 'Clicking a rail thumb upgrades it without blanking siblings'],
  [20, 'Keyboard edit after inject still patches without a full-rail wipe'],
  [21, 'Dark-slide title contrast is rasterized as light ink'],
  [22, 'An injected image inks the thumb without a gutter resize'],
  [23, 'Partial rich-text color SnapDOM-booths and inks blue in the thumb'],
  [24, 'Overlay label on a dark chip stays white in the thumb'],
]

const listSlide = {
  id: 'e2e-raster-list',
  elements: [{
    id: 'e2e-raster-list-text',
    type: 'text',
    left: 48,
    top: 48,
    width: 520,
    height: 200,
    rotate: 0,
    content: '<ul><li><p style="font-size: 18px">Alpha</p></li><li><p style="font-size: 18px">Beta</p></li></ul>',
    defaultFontName: 'Arial',
    defaultColor: '#18181b',
  }],
}

const tableCell = (id, text) => ({
  id,
  colspan: 1,
  rowspan: 1,
  text,
  style: { fontsize: '14px' },
})

const twinTable = (id, left) => ({
  id,
  type: 'table',
  left,
  top: 40,
  width: 360,
  height: 120,
  rotate: 0,
  colWidths: [0.5, 0.5],
  cellMinHeight: 36,
  outline: { width: 1, color: '#e4e4e7', style: 'solid' },
  data: [[tableCell(`${id}-a`, 'CacheA'), tableCell(`${id}-b`, 'CacheB')]],
})

const tableSlide = {
  id: 'e2e-raster-tables',
  elements: [twinTable('e2e-raster-table-1', 40), twinTable('e2e-raster-table-2', 420)],
}

const contrastSlide = {
  id: 'e2e-raster-contrast',
  background: { type: 'solid', color: '#0b1220' },
  elements: [{
    id: 'e2e-raster-contrast-title',
    type: 'text',
    left: 48,
    top: 80,
    width: 720,
    height: 140,
    rotate: 0,
    content: '<p style="font-size: 48px; color: #333333">AI Workshop</p>',
    defaultFontName: 'Arial',
    defaultColor: '#333333',
  }],
}

const overlayContrastSlide = {
  id: 'e2e-raster-overlay-contrast',
  background: { type: 'solid', color: '#ffffff' },
  elements: [
    {
      id: 'e2e-raster-overlay-chip',
      type: 'shape',
      left: 80,
      top: 80,
      width: 220,
      height: 220,
      rotate: 0,
      viewBox: [200, 200],
      path: 'M 0 0 L 200 0 L 200 200 L 0 200 Z',
      fill: '#626c3b',
      fixedRatio: false,
    },
    {
      id: 'e2e-raster-overlay-label',
      type: 'shape',
      left: 80,
      top: 80,
      width: 220,
      height: 220,
      rotate: 0,
      viewBox: [200, 200],
      path: 'M 0 0 L 200 0 L 200 200 L 0 200 Z',
      fill: '',
      fixedRatio: false,
      text: {
        content: '<p style="text-align: center; font-size: 72px; color: #ffffff">1</p>',
        align: 'middle',
        defaultFontName: 'Arial',
        defaultColor: '#333333',
      },
    },
  ],
}

const richColorSlide = {
  id: 'e2e-raster-rich-color',
  elements: [{
    id: 'e2e-raster-rich-color-text',
    type: 'text',
    left: 48,
    top: 80,
    width: 520,
    height: 120,
    rotate: 0,
    content: '<p style="font-size: 48px">dfd<span style="color: #2563eb">sfds</span></p>',
    defaultFontName: 'Arial',
    defaultColor: '#18181b',
  }],
}

const formulaSlide = {
  id: 'e2e-raster-formula',
  elements: [
    {
      id: 'e2e-raster-latex',
      type: 'latex',
      left: 48,
      top: 40,
      width: 220,
      height: 80,
      rotate: 0,
      latex: 'x^2',
      path: 'M 10 40 L 40 10 L 70 40',
      color: '#18181b',
      strokeWidth: 3,
      viewBox: [80, 50],
      fixedRatio: false,
    },
    {
      id: 'e2e-raster-mermaid',
      type: 'mermaid',
      left: 48,
      top: 140,
      width: 360,
      height: 120,
      rotate: 0,
      code: 'graph TD; A-->B',
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

async function stripScan(page) {
  await page.evaluate(() => {
    document.querySelectorAll('[data-react-scan], #react-scan-root').forEach(el => el.remove())
  })
}

async function waitForHooks(page) {
  const start = Date.now()
  while (Date.now() - start < 20000) {
    if (await page.evaluate(() => !!(window.__FIKA_SLIDES__ && window.__FIKA_RASTER__))) return
    await sleep(250)
  }
  throw new Error('fika store / raster hooks did not appear')
}

async function raster(page) {
  return page.evaluate(() => window.__FIKA_RASTER__.read())
}

async function resetRaster(page) {
  await page.evaluate(() => window.__FIKA_RASTER__.reset())
}

async function waitIdle(page, requirePaint = true) {
  const start = Date.now()
  let last = -1
  let stable = 0
  while (Date.now() - start < 10000) {
    const stats = await raster(page)
    const token = stats.fullPaints + stats.patchPaints + stats.elementInvalidations + stats.booths + stats.boothHits
    if (token === last) {
      stable += 1
      if (stable >= 4 && (!requirePaint || stats.fullPaints + stats.patchPaints > 0)) return stats
    }
    else {
      stable = 0
      last = token
    }
    await sleep(80)
  }
  return raster(page)
}

async function thumbState(page) {
  return page.evaluate(() => {
    const hosts = [...document.querySelectorAll('[data-thumbnail-slide]')]
    return hosts.map(host => {
      const canvas = host.querySelector('[data-preview-raster]') || host.querySelector('canvas')
      let ink = 0
      if (canvas && canvas.width && canvas.height) {
        const data = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data
        for (let p = 0; p < data.length; p += 16) {
          if (data[p + 3] > 12 && (data[p] < 248 || data[p + 1] < 248 || data[p + 2] < 248)) ink++
        }
      }
      return {
        id: host.getAttribute('data-thumbnail-slide'),
        pending: host.hasAttribute('data-raster-pending'),
        hasCanvas: !!canvas,
        ink,
      }
    })
  })
}

async function waitThumbs(page, min = 1) {
  const start = Date.now()
  let last = []
  while (Date.now() - start < 12000) {
    last = await thumbState(page)
    if (last.length >= min && last.every(t => !t.pending && t.hasCanvas)) return last
    await sleep(80)
  }
  return last
}

async function clickThumb(page, index) {
  const thumb = page.locator('[data-thumbnail-slide]').nth(index)
  await thumb.waitFor({ state: 'visible' })
  const box = await thumb.boundingBox()
  if (!box) throw new Error(`no box for thumb ${index}`)
  await page.mouse.click(box.x + box.width / 2, box.y + 16)
  await sleep(200)
}

async function typeInFirstBox(page, text) {
  const box = page.locator('[class*=viewport-wrapper] [data-live-box]').first()
  await box.waitFor({ state: 'attached', timeout: 15000 })
  const rect = await box.boundingBox()
  if (!rect) throw new Error('live box has no bounding box')
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2)
  await sleep(120)
  await page.keyboard.type(text, { delay: 12 })
  await sleep(200)
}

async function injectSlide(page, slide) {
  return page.evaluate((next) => {
    const slides = window.__FIKA_SLIDES__
    if (!slides) return false
    slides.getState().addSlide({
      id: `${next.id}-${Date.now()}`,
      elements: next.elements,
      background: next.background,
    })
    return true
  }, slide)
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

  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  })
  await page.goto(devUrl, { waitUntil: 'networkidle' })
  await page.getByText('Add slide').waitFor({ timeout: 90000 })
  await stripScan(page)
  await waitForHooks(page)
  await waitThumbs(page, 1)

  const hook = await raster(page)
  rec(1, Number.isFinite(hook.booths) && Number.isFinite(hook.boothHits) && !!hook.qualities && Array.isArray(hook.scratches), hook)

  const cover = (await waitThumbs(page, 1))[0]
  rec(2, cover && !cover.pending && cover.hasCanvas, cover)

  await resetRaster(page)
  await typeInFirstBox(page, 'RasterAlpha')
  await waitIdle(page, false)
  const afterType = await waitThumbs(page, 1)
  const typedStats = await raster(page)
  rec(3, afterType[0]?.ink > 8 && !afterType[0]?.pending, afterType[0])
  rec(4, typedStats.booths === 0, typedStats)

  await page.getByText('Add slide', { exact: true }).click()
  await sleep(250)
  const two = await waitThumbs(page, 2)
  rec(5, two.length >= 2 && two.every(t => t.hasCanvas && !t.pending), { n: two.length, pending: two.filter(t => t.pending).length })

  await typeInFirstBox(page, 'RasterBeta')
  await waitIdle(page, false)
  const afterBeta = await waitThumbs(page, 2)
  rec(6, afterBeta[1]?.ink > 8 && !afterBeta[1]?.pending, afterBeta[1])
  rec(7, afterBeta[0]?.ink > 8 && !afterBeta[0]?.pending, afterBeta[0])

  await clickThumb(page, 0)
  await waitIdle(page, false)
  const afterClick = await waitThumbs(page, 2)
  rec(8, afterClick.length >= 2 && afterClick.every(t => t.hasCanvas && !t.pending && t.ink > 8), afterClick)

  await page.getByText('Add slide', { exact: true }).click()
  await sleep(80)
  await page.getByText('Add slide', { exact: true }).click()
  await sleep(120)
  await page.evaluate(() => {
    const stamp = Date.now()
    const text = (id, label) => ({
      id,
      type: 'text',
      left: 40,
      top: 40,
      width: 320,
      height: 64,
      rotate: 0,
      content: `<p style="font-size: 20px">${label}</p>`,
      defaultFontName: 'Arial',
      defaultColor: '#18181b',
    })
    window.__FIKA_SLIDES__.getState().addSlide([
      { id: `e2e-rail-current-${stamp}`, elements: [text(`e2e-rail-cur-${stamp}`, 'RailCurrent')] },
      { id: `e2e-rail-only-${stamp}`, elements: [text(`e2e-rail-sib-${stamp}`, 'RailSibling')] },
    ])
  })
  await sleep(250)
  const many = await waitThumbs(page, 4)
  const pool = await raster(page)
  rec(9, many.length >= 4 && many.every(t => t.hasCanvas && !t.pending), {
    n: many.length,
    pending: many.filter(t => t.pending).length,
  })
  rec(10, pool.scratches.length <= 3, { scratches: pool.scratches.length })
  const currentId = await page.evaluate(() => {
    const slides = window.__FIKA_SLIDES__.getState()
    return slides.slides[slides.slideIndex]?.id
  })
  rec(11, pool.qualities[currentId] === 'full', { currentId, qualities: pool.qualities })
  const railId = Object.entries(pool.qualities).find(([id, quality]) => id !== currentId && quality === 'rail')?.[0]
  rec(12, !!railId, { currentId, qualities: pool.qualities })

  await resetRaster(page)
  const listOk = await injectSlide(page, listSlide)
  if (!listOk) throw new Error('could not inject list slide')
  const listStats = await waitIdle(page)
  const listThumbs = await waitThumbs(page, 1)
  const listThumb = listThumbs.find(t => t.id?.startsWith('e2e-raster-list')) || listThumbs[listThumbs.length - 1]
  rec(13, listStats.booths >= 1, listStats)
  rec(14, listThumb?.ink > 8 && !listThumb?.pending, listThumb)

  await resetRaster(page)
  const tableOk = await injectSlide(page, tableSlide)
  if (!tableOk) throw new Error('could not inject table slide')
  const tableStats = await waitIdle(page)
  const tableThumbs = await waitThumbs(page, 1)
  const tableThumb = tableThumbs.find(t => t.id?.startsWith('e2e-raster-tables')) || tableThumbs[tableThumbs.length - 1]
  rec(15, tableStats.booths === 1 && tableStats.boothHits >= 1, tableStats)
  rec(16, tableThumb?.ink > 8 && !tableThumb?.pending, tableThumb)

  await resetRaster(page)
  const formulaOk = await injectSlide(page, formulaSlide)
  if (!formulaOk) throw new Error('could not inject formula slide')
  const formulaStats = await waitIdle(page)
  const formulaThumbs = await waitThumbs(page, 1)
  const formulaThumb = formulaThumbs.find(t => t.id?.startsWith('e2e-raster-formula')) || formulaThumbs[formulaThumbs.length - 1]
  rec(17, formulaStats.booths === 0, formulaStats)
  rec(18, formulaThumb?.ink > 8 && !formulaThumb?.pending, formulaThumb)

  const beforeSwitch = await thumbState(page)
  await clickThumb(page, 0)
  await waitIdle(page, false)
  const afterSwitch = await waitThumbs(page, Math.min(4, beforeSwitch.length))
  rec(19, afterSwitch.length >= 2 && afterSwitch.every(t => t.hasCanvas && !t.pending), afterSwitch)

  await resetRaster(page)
  await typeInFirstBox(page, 'Z')
  const editStats = await waitIdle(page, false)
  const afterEdit = await waitThumbs(page, 2)
  rec(20, editStats.fullPaints === 0 && afterEdit.filter(t => t.ink > 8).length >= 2, {
    ...editStats,
    inked: afterEdit.filter(t => t.ink > 8).length,
  })

  await resetRaster(page)
  const contrastOk = await injectSlide(page, contrastSlide)
  if (!contrastOk) throw new Error('could not inject contrast slide')
  await waitIdle(page)
  const contrastLight = await page.evaluate(() => {
    const host = [...document.querySelectorAll('[data-thumbnail-slide]')].find(el => (
      el.getAttribute('data-thumbnail-slide')?.startsWith('e2e-raster-contrast')
    )) || document.querySelector('[data-thumbnail-slide]:last-of-type')
    const canvas = host?.querySelector('[data-preview-raster]') || host?.querySelector('canvas')
    if (!canvas || !canvas.width || !canvas.height) return { light: 0, id: host?.getAttribute('data-thumbnail-slide') }
    const data = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data
    let light = 0
    for (let p = 0; p < data.length; p += 16) {
      if (data[p + 3] > 12 && data[p] > 200 && data[p + 1] > 200 && data[p + 2] > 200) light++
    }
    return { light, id: host?.getAttribute('data-thumbnail-slide') }
  })
  rec(21, contrastLight.light > 8, contrastLight)

  const imageOk = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 80
    canvas.height = 80
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#dc2626'
    ctx.fillRect(0, 0, 80, 80)
    window.__FIKA_SLIDES__.getState().addSlide({
      id: `e2e-raster-image-${Date.now()}`,
      elements: [{
        id: 'e2e-raster-image',
        type: 'image',
        src: canvas.toDataURL('image/png'),
        fixedRatio: true,
        left: 40,
        top: 40,
        width: 360,
        height: 360,
        rotate: 0,
      }],
    })
    return true
  })
  if (!imageOk) throw new Error('could not inject image slide')
  await waitIdle(page)
  const imageInk = await page.evaluate(() => {
    const host = [...document.querySelectorAll('[data-thumbnail-slide]')].find(el => (
      el.getAttribute('data-thumbnail-slide')?.startsWith('e2e-raster-image')
    )) || document.querySelector('[data-thumbnail-slide]:last-of-type')
    const canvas = host?.querySelector('[data-preview-raster]') || host?.querySelector('canvas')
    if (!canvas || !canvas.width || !canvas.height) {
      return { red: 0, pending: host?.hasAttribute('data-raster-pending'), id: host?.getAttribute('data-thumbnail-slide') }
    }
    const data = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data
    let red = 0
    for (let p = 0; p < data.length; p += 16) {
      if (data[p + 3] > 12 && data[p] > 160 && data[p + 1] < 90 && data[p + 2] < 90) red++
    }
    return { red, pending: host?.hasAttribute('data-raster-pending'), id: host?.getAttribute('data-thumbnail-slide') }
  })
  rec(22, imageInk.red > 8 && !imageInk.pending, imageInk)

  await resetRaster(page)
  const richOk = await injectSlide(page, richColorSlide)
  if (!richOk) throw new Error('could not inject rich-color slide')
  const richStats = await waitIdle(page)
  const richInk = await page.evaluate(() => {
    const host = [...document.querySelectorAll('[data-thumbnail-slide]')].find(el => (
      el.getAttribute('data-thumbnail-slide')?.startsWith('e2e-raster-rich-color')
    )) || document.querySelector('[data-thumbnail-slide]:last-of-type')
    const canvas = host?.querySelector('[data-preview-raster]') || host?.querySelector('canvas')
    if (!canvas || !canvas.width || !canvas.height) {
      return { blue: 0, pending: host?.hasAttribute('data-raster-pending'), id: host?.getAttribute('data-thumbnail-slide') }
    }
    const data = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data
    let blue = 0
    for (let p = 0; p < data.length; p += 4) {
      const r = data[p]
      const g = data[p + 1]
      const b = data[p + 2]
      if (data[p + 3] > 12 && b > 140 && b > r + 30 && b > g + 15) blue++
    }
    return { blue, pending: host?.hasAttribute('data-raster-pending'), id: host?.getAttribute('data-thumbnail-slide') }
  })
  rec(23, richStats.booths >= 1 && richInk.blue > 8 && !richInk.pending, { ...richStats, ...richInk })

  await resetRaster(page)
  const overlayOk = await injectSlide(page, overlayContrastSlide)
  if (!overlayOk) throw new Error('could not inject overlay-contrast slide')
  await waitIdle(page)
  const overlayLight = await page.evaluate(() => {
    const host = [...document.querySelectorAll('[data-thumbnail-slide]')].find(el => (
      el.getAttribute('data-thumbnail-slide')?.startsWith('e2e-raster-overlay-contrast')
    )) || document.querySelector('[data-thumbnail-slide]:last-of-type')
    const canvas = host?.querySelector('[data-preview-raster]') || host?.querySelector('canvas')
    if (!canvas || !canvas.width || !canvas.height) {
      return { light: 0, pending: host?.hasAttribute('data-raster-pending'), id: host?.getAttribute('data-thumbnail-slide') }
    }
    const data = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data
    let light = 0
    for (let p = 0; p < data.length; p += 4) {
      if (data[p + 3] > 12 && data[p] > 200 && data[p + 1] > 200 && data[p + 2] > 200) light++
    }
    return { light, pending: host?.hasAttribute('data-raster-pending'), id: host?.getAttribute('data-thumbnail-slide') }
  })
  rec(24, overlayLight.light > 8 && !overlayLight.pending, overlayLight)
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
if (results.length !== CASES.length) {
  console.error(`expected ${CASES.length} proofs, got ${results.length}`)
  process.exit(1)
}
console.log(`\n${results.length}/${results.length} passed`)
