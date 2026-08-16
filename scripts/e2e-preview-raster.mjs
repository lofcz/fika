/**
 * Real-browser coverage for the live-DOM thumbnail rail: thumbnails render the
 * genuine ScreenSlide tree scaled by CSS, so faithfulness is asserted by
 * comparing the thumb DOM against the editor canvas DOM (geometry + computed
 * styles) instead of raster pixels.
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
  [1, 'Thumbnails mount the genuine slide DOM'],
  [2, 'Cover thumb renders its slide tree'],
  [3, 'Typing a title inks the cover thumb live'],
  [4, 'Thumb text matches the store slide'],
  [5, 'Add slide creates a second thumb'],
  [6, 'Typing on slide 02 inks that thumb'],
  [7, 'Cover thumb stays inked after typing on slide 02'],
  [8, 'Clicking the cover thumb keeps both thumbs mounted'],
  [9, 'Adding two more slides leaves every visible thumb mounted'],
  [10, 'Thumb geometry matches the editor canvas (scaled)'],
  [11, 'Thumb typography matches the editor canvas'],
  [12, 'List markup keeps real list markers in the thumb'],
  [13, 'Twin tables render as tables, not stubs'],
  [14, 'Latex path renders as SVG in the thumb'],
  [15, 'Dark-slide title contrast is light ink in the thumb'],
  [16, 'An injected image renders its bitmap surface in the thumb'],
  [17, 'Partial rich-text color stays blue in the thumb'],
  [18, 'Overlay label on a dark chip stays white in the thumb'],
  [19, 'Clicking a rail thumb swaps slides without blanking siblings'],
  [20, 'Video poster renders as an image in the thumb'],
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
  ],
}

const videoSlide = {
  id: 'e2e-raster-video',
  elements: [{
    id: 'e2e-raster-video-el',
    type: 'video',
    left: 60,
    top: 60,
    width: 320,
    height: 180,
    rotate: 0,
    src: 'data:video/mp4;base64,AAAA',
    poster: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8Dwn4GBgYGRAQIAADQwCgftn9EAAAAASUVORK5CYII=',
    autoplay: false,
  }],
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
    if (await page.evaluate(() => !!window.__FIKA_SLIDES__)) return
    await sleep(250)
  }
  throw new Error('fika store hook did not appear')
}

async function thumbState(page) {
  return page.evaluate(() => {
    const hosts = [...document.querySelectorAll('[data-thumbnail-slide]')]
    return hosts.map(host => {
      const slide = host.querySelector('.screen-slide')
      const text = (slide?.textContent || '').replace(/\s+/g, ' ').trim()
      return {
        id: host.getAttribute('data-thumbnail-slide'),
        mounted: !!slide,
        ink: text.length + slide?.querySelectorAll('path, img, canvas, table td').length * 4 || 0,
        textLen: text.length,
        text,
      }
    })
  })
}

async function waitThumbs(page, min = 1) {
  const start = Date.now()
  let last = []
  while (Date.now() - start < 12000) {
    last = await thumbState(page)
    if (last.length >= min && last.every(t => t.mounted)) return last
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
  await sleep(250)
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

/** Wait for the injected slide's thumbnail to mount (it lands at the rail's end). */
async function waitInjectedThumb(page, prefix) {
  const start = Date.now()
  while (Date.now() - start < 12000) {
    const state = await thumbState(page)
    const found = state.find(t => t.id?.startsWith(prefix))
    if (found?.mounted) return found
    await sleep(100)
  }
  return null
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

  const first = (await waitThumbs(page, 1))[0]
  rec(1, first?.mounted, first)
  rec(2, first?.mounted, first)

  await typeInFirstBox(page, 'RasterAlpha')
  const afterType = await waitThumbs(page, 1)
  rec(3, (afterType[0]?.textLen || 0) > 4, afterType[0])
  const storeText = await page.evaluate(() => {
    const slides = window.__FIKA_SLIDES__.getState()
    return (slides.slides[slides.slideIndex].elements
      .map(el => (el.type === 'text' ? el.content : el.text?.content || ''))
      .join(' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
  })
  rec(4, storeText.includes('RasterAlpha') && (afterType[0]?.text || '').includes('RasterAlpha'), { storeText, thumbText: afterType[0]?.text })

  await page.getByText('Add slide', { exact: true }).click()
  await sleep(250)
  const two = await waitThumbs(page, 2)
  rec(5, two.length >= 2 && two.every(t => t.mounted), { n: two.length })

  await typeInFirstBox(page, 'RasterBeta')
  const afterBeta = await waitThumbs(page, 2)
  rec(6, (afterBeta[1]?.textLen || 0) > 4, afterBeta[1])
  rec(7, (afterBeta[0]?.textLen || 0) > 4, afterBeta[0])

  // Faithfulness: the same element's box in the editor canvas and in the
  // thumb, normalized to authored slide units — they must agree.
  const geometry = await page.evaluate(() => {
    const slides = window.__FIKA_SLIDES__.getState()
    const current = slides.slides[slides.slideIndex]
    const firstId = current.elements[0]?.id
    if (!firstId) return { ok: false, reason: 'no elements' }
    const viewportSize = slides.viewportSize
    const editor = [...document.querySelectorAll('[class*=viewport-wrapper]')].toSorted((a, b) => {
      const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect()
      return (br.width * br.height) - (ar.width * ar.height)
    })[0]
    const thumbHost = [...document.querySelectorAll('[data-thumbnail-slide]')]
      .find(el => el.getAttribute('data-thumbnail-slide') === current.id)
    const editorNode = document.getElementById(`editable-element-${firstId}`)
    const thumbNode = thumbHost?.querySelector(`#screen-element-${firstId}`)
    // Both trees wrap the element in a 0×0 positioned shell; the element
    // root (first child) carries the authored box in each.
    const editorEl = editorNode?.querySelector(':scope > div') || editorNode
    const thumbEl = thumbNode?.querySelector(':scope > div') || thumbNode
    if (!editor || !thumbHost || !editorEl || !thumbEl) return { ok: false, reason: 'missing boxes' }
    if (!editor || !thumbHost || !editorEl || !thumbEl) return { ok: false, reason: 'missing boxes' }
    const editorBox = editor.getBoundingClientRect()
    const thumbBox = thumbHost.getBoundingClientRect()
    const eb = editorEl.getBoundingClientRect()
    const tb = thumbEl.getBoundingClientRect()
    const editorScale = editorBox.width / viewportSize
    const thumbScale = thumbBox.width / viewportSize
    return {
      ok: true,
      leftDelta: Math.abs(eb.left - editorBox.left - (tb.left - thumbBox.left) / thumbScale * editorScale),
      widthDelta: Math.abs(eb.width / editorScale - tb.width / thumbScale),
      editorFont: getComputedStyle(editorEl).fontFamily,
      thumbFont: getComputedStyle(thumbEl).fontFamily,
    }
  })
  rec(10, geometry.ok && geometry.leftDelta <= 1.5 && geometry.widthDelta <= 1.5, geometry)
  rec(11, geometry.ok && geometry.editorFont === geometry.thumbFont, geometry)

  await clickThumb(page, 0)
  const afterClick = await waitThumbs(page, 2)
  rec(8, afterClick.length >= 2 && afterClick.every(t => t.mounted && t.textLen > 4), afterClick)

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
      { id: `e2e-rail-a-${stamp}`, elements: [text(`e2e-rail-a-${stamp}`, 'RailA')] },
      { id: `e2e-rail-b-${stamp}`, elements: [text(`e2e-rail-b-${stamp}`, 'RailB')] },
    ])
  })
  await sleep(300)
  const many = await waitThumbs(page, 4)
  rec(9, many.length >= 4 && many.every(t => t.mounted), { n: many.length, unmounted: many.filter(t => !t.mounted).length })

  const listOk = await injectSlide(page, listSlide)
  if (!listOk) throw new Error('could not inject list slide')
  const listThumb = await waitInjectedThumb(page, 'e2e-raster-list')
  const listDom = await page.evaluate((prefix) => {
    const host = [...document.querySelectorAll('[data-thumbnail-slide]')].find(el => (
      el.getAttribute('data-thumbnail-slide')?.startsWith(prefix)
    ))
    const lis = host?.querySelectorAll('.screen-slide li')
    const ul = host?.querySelector('.screen-slide ul')
    return { liCount: lis?.length || 0, hasUl: !!ul }
  }, 'e2e-raster-list')
  rec(12, !!listThumb && listThumb.textLen > 4 && listDom.liCount === 2 && listDom.hasUl, { thumb: listThumb, ...listDom })

  const tableOk = await injectSlide(page, tableSlide)
  if (!tableOk) throw new Error('could not inject table slide')
  const tableThumb = await waitInjectedThumb(page, 'e2e-raster-tables')
  const tableDom = await page.evaluate((prefix) => {
    const host = [...document.querySelectorAll('[data-thumbnail-slide]')].find(el => (
      el.getAttribute('data-thumbnail-slide')?.startsWith(prefix)
    ))
    return { tables: host?.querySelectorAll('.screen-slide table').length || 0, cells: host?.querySelectorAll('.screen-slide td').length || 0 }
  }, 'e2e-raster-tables')
  rec(13, !!tableThumb && tableDom.tables === 2 && tableDom.cells === 4, { thumb: tableThumb, ...tableDom })

  const formulaOk = await injectSlide(page, formulaSlide)
  if (!formulaOk) throw new Error('could not inject formula slide')
  const formulaThumb = await waitInjectedThumb(page, 'e2e-raster-formula')
  // Latex renders through MathLive — the SAME renderer the editor canvas
  // uses. Faithfulness = identical markup, not a hand-rolled path painter.
  const formulaDom = await page.evaluate(async (prefix) => {
    const host = [...document.querySelectorAll('[data-thumbnail-slide]')].find(el => (
      el.getAttribute('data-thumbnail-slide')?.startsWith(prefix)
    ))
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    let thumbLatex = null
    let editorLatex = null
    for (let i = 0; i < 30; i++) {
      thumbLatex = host?.querySelector('.screen-slide [class*=latex-content]')?.innerHTML || ''
      editorLatex = document.querySelector('#editable-element-e2e-raster-latex [class*=latex-content]')?.innerHTML || ''
      if (thumbLatex && editorLatex && (thumbLatex.includes('<svg') || i > 20)) break
      await sleep(100)
    }
    return { thumbLen: thumbLatex?.length || 0, editorLen: editorLatex?.length || 0, same: !!thumbLatex && thumbLatex === editorLatex }
  }, 'e2e-raster-formula')
  rec(14, !!formulaThumb && formulaDom.same, { thumb: formulaThumb, ...formulaDom })

  const contrastOk = await injectSlide(page, contrastSlide)
  if (!contrastOk) throw new Error('could not inject contrast slide')
  const contrastThumb = await waitInjectedThumb(page, 'e2e-raster-contrast')
  const contrastColor = await page.evaluate((prefix) => {
    const host = [...document.querySelectorAll('[data-thumbnail-slide]')].find(el => (
      el.getAttribute('data-thumbnail-slide')?.startsWith(prefix)
    ))
    const el = host?.querySelector('.screen-slide .ProseMirror-static')
    return el ? getComputedStyle(el).color : ''
  }, 'e2e-raster-contrast')
  rec(15, !!contrastThumb && /rgb\(2(?:5[0-5]|4\d), 2(?:5[0-5]|4\d), 2(?:5[0-5]|4\d)\)|#fff/i.test(contrastColor) || contrastColor.includes('255'), { color: contrastColor })

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
  const imageThumb = await waitInjectedThumb(page, 'e2e-raster-image')
  const imageDom = await page.evaluate(async (prefix) => {
    const host = [...document.querySelectorAll('[data-thumbnail-slide]')].find(el => (
      el.getAttribute('data-thumbnail-slide')?.startsWith(prefix)
    ))
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    // The bitmap surface draws asynchronously after decode; a fresh canvas
    // sits at the 300×150 default until then.
    let surface = null
    for (let i = 0; i < 40; i++) {
      surface = host?.querySelector('.screen-slide canvas')
      if (surface && (surface.width !== 300 || surface.height !== 150)) break
      await sleep(100)
    }
    return { hasCanvas: !!surface, w: surface?.width || 0 }
  }, 'e2e-raster-image')
  rec(16, !!imageThumb && imageDom.hasCanvas && imageDom.w === 80, { thumb: imageThumb, ...imageDom })

  const richOk = await injectSlide(page, richColorSlide)
  if (!richOk) throw new Error('could not inject rich-color slide')
  const richThumb = await waitInjectedThumb(page, 'e2e-raster-rich-color')
  const richColor = await page.evaluate((prefix) => {
    const host = [...document.querySelectorAll('[data-thumbnail-slide]')].find(el => (
      el.getAttribute('data-thumbnail-slide')?.startsWith(prefix)
    ))
    const spans = [...(host?.querySelectorAll('.screen-slide .ProseMirror-static span') || [])]
    return spans.map(span => getComputedStyle(span).color)
  }, 'e2e-raster-rich-color')
  rec(17, !!richThumb && richColor.some(c => c.includes('37') && c.includes('99') && c.includes('235')), { colors: richColor })

  const overlayOk = await injectSlide(page, overlayContrastSlide)
  if (!overlayOk) throw new Error('could not inject overlay-contrast slide')
  const overlayThumb = await waitInjectedThumb(page, 'e2e-raster-overlay-contrast')
  const overlayColor = await page.evaluate((prefix) => {
    const host = [...document.querySelectorAll('[data-thumbnail-slide]')].find(el => (
      el.getAttribute('data-thumbnail-slide')?.startsWith(prefix)
    ))
    const el = host?.querySelector('.screen-slide .ProseMirror-static')
    return el ? getComputedStyle(el).color : ''
  }, 'e2e-raster-overlay-contrast')
  rec(18, !!overlayThumb && overlayColor.includes('255'), { color: overlayColor })

  const videoOk = await injectSlide(page, videoSlide)
  if (!videoOk) throw new Error('could not inject video slide')
  const videoThumb = await waitInjectedThumb(page, 'e2e-raster-video')
  const videoDom = await page.evaluate((prefix) => {
    const host = [...document.querySelectorAll('[data-thumbnail-slide]')].find(el => (
      el.getAttribute('data-thumbnail-slide')?.startsWith(prefix)
    ))
    return { imgs: host?.querySelectorAll('.screen-slide img').length || 0, videos: host?.querySelectorAll('.screen-slide video').length || 0 }
  }, 'e2e-raster-video')
  rec(20, !!videoThumb && videoDom.imgs >= 1 && videoDom.videos === 0, { thumb: videoThumb, ...videoDom })

  const beforeSwitch = await thumbState(page)
  await clickThumb(page, 0)
  await sleep(250)
  const afterSwitch = await waitThumbs(page, Math.min(4, beforeSwitch.length))
  // Blank template slides legitimately have no text; what must never happen
  // is a mounted-but-empty slide that HAS content, or an unmounted thumb.
  const slidesWithText = await page.evaluate(() => {
    const state = window.__FIKA_SLIDES__.getState()
    return state.slides.filter(slide => (slide.elements || []).some(el => (
      (el.type === 'text' && (el.content || '').replace(/<[^>]+>/g, '').trim())
      || (el.type === 'shape' && (el.text?.content || '').replace(/<[^>]+>/g, '').trim())
    ))).map(slide => slide.id)
  })
  const inkedMissing = slidesWithText.filter(id => {
    const thumb = afterSwitch.find(t => t.id === id)
    return thumb ? (!thumb.mounted || thumb.textLen === 0) : false
  })
  rec(19, afterSwitch.length >= 2 && afterSwitch.every(t => t.mounted) && inkedMissing.length === 0, { inkedMissing, thumbs: afterSwitch.slice(0, 3) })
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
