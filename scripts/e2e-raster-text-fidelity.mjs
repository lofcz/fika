/**
 * Editor canvas and rail thumbs must paint text with the same HTML/CSS.
 * Reproduces Houby slide 10: left-aligned shape labels shifted in the thumb
 * because the raster used Konva.Text (center + px-only sizes) instead of
 * the live ProseMirror paint.
 *
 *   node scripts/e2e-raster-text-fidelity.mjs
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { HOUBY_PPTX } from '../tests/fixtures/paths.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const DEV_PORTS = [5173, 5174, 5175, 5176, 5188]
const MAX_LEFT_DELTA = 0.012
/** Rail thumbs are ~300px; list ::marker + inset is a few dest pixels. */
const MAX_LIST_LEFT_DELTA = 0.025
const BODY = 'Neznámé houby nekopejte'
const TITLE = 'Respektujte lesní ekosystém'
const LIST_FIRST = 'AlphaHang'

const rectShape = (id, { left, top, width, height, fill = '', content, align = 'top', inset = [0, 0, 0, 0], lineHeight = 1.25 }) => ({
  id,
  type: 'shape',
  left,
  top,
  width,
  height,
  rotate: 0,
  viewBox: [200, 200],
  path: 'M 0 0 L 200 0 L 200 200 L 0 200 Z',
  fill,
  fixedRatio: false,
  text: {
    content,
    align,
    defaultFontName: 'Arial',
    defaultColor: '#403011',
    inset,
    lineHeight,
    paragraphSpace: 0,
  },
})

const fidelitySlide = {
  id: 'e2e-text-fidelity',
  background: { type: 'solid', color: '#F6EBD4' },
  elements: [
    rectShape('e2e-tf-title', {
      left: 39,
      top: 58,
      width: 372,
      height: 70,
      content: `<p style="text-align: left;line-height: 1.25;"><span style="color: #403011;font-size: 27.5pt;font-family: Arial;">${TITLE}</span></p>`,
    }),
    rectShape('e2e-tf-body', {
      left: 75,
      top: 144,
      width: 336,
      height: 17,
      content: `<p style="text-align: left;line-height: 1.25;"><span style="color: #403011;font-size: 13.5pt;font-family: Arial;">${BODY}</span></p>`,
    }),
  ],
}

const listSlide = {
  id: 'e2e-text-fidelity-list',
  background: { type: 'solid', color: '#ffffff' },
  elements: [{
    id: 'e2e-tf-list',
    type: 'text',
    left: 48,
    top: 48,
    width: 520,
    height: 200,
    rotate: 0,
    inset: [10, 10, 10, 10],
    content: `<ul><li><p style="font-size: 22px; color: #111111">${LIST_FIRST}</p></li><li><p style="font-size: 22px; color: #111111">BetaHang</p></li></ul>`,
    defaultFontName: 'Arial',
    defaultColor: '#111111',
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
  while (Date.now() - start < 20000) {
    const stats = await page.evaluate(() => window.__FIKA_RASTER__.read())
    const token = stats.fullPaints + stats.patchPaints + stats.elementInvalidations + stats.booths + stats.boothHits
    if (token === last) {
      stable += 1
      if (stable >= 5 && stats.fullPaints + stats.patchPaints > 0) return stats
    }
    else {
      stable = 0
      last = token
    }
    await sleep(80)
  }
  return page.evaluate(() => window.__FIKA_RASTER__.read())
}

async function injectSlide(page, slide) {
  return page.evaluate((next) => {
    window.__FIKA_RASTER__.reset()
    window.__FIKA_SLIDES__.getState().addSlide({
      id: `${next.id}-${Date.now()}`,
      elements: next.elements,
      background: next.background,
    })
    return true
  }, slide)
}

async function firstInkInScreenshot(page, clip) {
  if (clip.width < 1 || clip.height < 1) return null
  const buffer = await page.screenshot({ clip, type: 'png' })
  return page.evaluate(async (b64) => {
    const blob = await fetch(`data:image/png;base64,${b64}`).then(r => r.blob())
    const bmp = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    canvas.width = bmp.width
    canvas.height = bmp.height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(bmp, 0, 0)
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const isInk = (r, g, b, a) => {
      if (a < 20) return false
      const cream = Math.abs(r - 246) < 28 && Math.abs(g - 235) < 28 && Math.abs(b - 212) < 28
      const white = r > 248 && g > 248 && b > 248
      return !cream && !white && (r + g + b) < 520
    }
    for (let x = 0; x < canvas.width; x++) {
      for (let y = 0; y < canvas.height; y++) {
        const i = (y * canvas.width + x) * 4
        if (isInk(data[i], data[i + 1], data[i + 2], data[i + 3])) {
          return { x: x / canvas.width, y: y / canvas.height }
        }
      }
    }
    return null
  }, buffer.toString('base64'))
}

async function measurePair(page, { needle, slidePrefix, elementId }) {
  const geometry = await page.evaluate(({ needle, slidePrefix, elementId }) => {
    const viewport = [...document.querySelectorAll('[class*=viewport-wrapper]')].toSorted((a, b) => {
      const ar = a.getBoundingClientRect()
      const br = b.getBoundingClientRect()
      return (br.width * br.height) - (ar.width * ar.height)
    })[0]
    const host = [...document.querySelectorAll('[data-thumbnail-slide]')].find(el => (
      el.getAttribute('data-thumbnail-slide')?.startsWith(slidePrefix)
    ))
    const canvas = host?.querySelector('[data-preview-raster]') || host?.querySelector('canvas')
    const slides = window.__FIKA_SLIDES__.getState()
    const slide = slides.slides.find(item => (
      item.id.startsWith(slidePrefix) || item.elements.some(el => el.id === elementId)
    ))
    const element = slide?.elements.find(el => (
      el.id === elementId || (el.text?.content || el.content || '').includes(needle)
    ))
    const editorRoot = [...(viewport?.querySelectorAll('.ProseMirror, .ProseMirror-static') || [])]
      .find(node => (node.textContent || '').includes(needle) && node.getBoundingClientRect().width > 1)
    if (!viewport || !canvas || !canvas.width || !element || !editorRoot) {
      return {
        ok: false,
        reason: !viewport ? 'no-viewport' : !canvas ? 'no-thumb' : !element ? 'no-element' : 'no-editor-text',
      }
    }
    const view = viewport.getBoundingClientRect()
    const liveBox = editorRoot.closest('[data-live-box]')
    const liveRect = liveBox?.getBoundingClientRect()
    const rootRect = editorRoot.getBoundingClientRect()
    const box = liveRect && liveRect.width > 1 && liveRect.height > 1 ? liveRect : rootRect
    if (box.width < 1 || box.height < 1) {
      return { ok: false, reason: 'editor-box-empty', box: { w: box.width, h: box.height } }
    }
    const slideW = slides.viewportSize
    const slideH = slideW * slides.viewportRatio
    return {
      ok: true,
      view: { x: view.x, y: view.y, w: view.width, h: view.height },
      editor: { x: box.x, y: box.y, w: box.width, h: box.height },
      thumb: {
        x0: Math.max(0, Math.floor(element.left / slideW * canvas.width)),
        y0: Math.max(0, Math.floor(element.top / slideH * canvas.height)),
        x1: Math.min(canvas.width, Math.ceil((element.left + element.width) / slideW * canvas.width)),
        y1: Math.min(canvas.height, Math.ceil((element.top + element.height) / slideH * canvas.height)),
        canvasW: canvas.width,
        canvasH: canvas.height,
      },
      element: { id: element.id, left: element.left, top: element.top, width: element.width, height: element.height },
    }
  }, { needle, slidePrefix, elementId })
  if (!geometry.ok) return geometry

  const dpr = 2
  const editorInk = await firstInkInScreenshot(page, {
    x: geometry.editor.x,
    y: geometry.editor.y,
    width: geometry.editor.w,
    height: geometry.editor.h,
  })
  const thumbInk = await page.evaluate(({ thumb }) => {
    const canvas = document.querySelector(`[data-thumbnail-slide^="${thumb.prefix}"] [data-preview-raster], [data-thumbnail-slide^="${thumb.prefix}"] canvas`)
      || [...document.querySelectorAll('[data-thumbnail-slide]')].find(el => (
        el.getAttribute('data-thumbnail-slide')?.startsWith(thumb.prefix)
      ))?.querySelector('[data-preview-raster], canvas')
    if (!canvas) return null
    const w = Math.max(1, thumb.x1 - thumb.x0)
    const h = Math.max(1, thumb.y1 - thumb.y0)
    const data = canvas.getContext('2d', { willReadFrequently: true }).getImageData(thumb.x0, thumb.y0, w, h).data
    const isInk = (r, g, b, a) => {
      if (a < 20) return false
      const cream = Math.abs(r - 246) < 28 && Math.abs(g - 235) < 28 && Math.abs(b - 212) < 28
      const white = r > 248 && g > 248 && b > 248
      return !cream && !white && (r + g + b) < 520
    }
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        const i = (y * w + x) * 4
        if (isInk(data[i], data[i + 1], data[i + 2], data[i + 3])) {
          return { x: (thumb.x0 + x) / thumb.canvasW, y: (thumb.y0 + y) / thumb.canvasH }
        }
      }
    }
    return null
  }, { thumb: { ...geometry.thumb, prefix: slidePrefix } })

  const editorLeft = (geometry.editor.x - geometry.view.x + (editorInk?.x || 0) * geometry.editor.w) / geometry.view.w
  const editorTop = (geometry.editor.y - geometry.view.y + (editorInk?.y || 0) * geometry.editor.h) / geometry.view.h
  return {
    ok: !!editorInk && !!thumbInk,
    editorLeft,
    editorTop,
    thumbLeft: thumbInk?.x ?? null,
    thumbTop: thumbInk?.y ?? null,
    leftDelta: thumbInk && editorInk ? Math.abs(thumbInk.x - editorLeft) : null,
    topDelta: thumbInk && editorInk ? Math.abs(thumbInk.y - editorTop) : null,
    canvas: { w: geometry.thumb.canvasW, h: geometry.thumb.canvasH },
    element: geometry.element,
    dpr,
  }
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

  const injected = await injectSlide(page, fidelitySlide)
  if (!injected) throw new Error('could not inject fidelity slide')
  const stats = await waitIdle(page)
  rec('Houby-style shape labels paint without a SnapDOM booth', stats.booths === 0, stats)
  await page.getByText(BODY).first().waitFor({ timeout: 15000 })

  const body = await measurePair(page, {
    needle: BODY,
    slidePrefix: fidelitySlide.id,
    elementId: 'e2e-tf-body',
  })
  rec('injected body first glyph left edge matches the thumb', body.ok && body.leftDelta <= MAX_LEFT_DELTA, body)

  const title = await measurePair(page, {
    needle: TITLE,
    slidePrefix: fidelitySlide.id,
    elementId: 'e2e-tf-title',
  })
  rec('injected title first glyph left edge matches the thumb', title.ok && title.leftDelta <= MAX_LEFT_DELTA, title)

  const listOk = await injectSlide(page, listSlide)
  if (!listOk) throw new Error('could not inject list slide')
  const listStats = await waitIdle(page)
  rec('list markup SnapDOM-booths instead of flattening to Konva.Text', listStats.booths >= 1, listStats)
  const list = await measurePair(page, {
    needle: LIST_FIRST,
    slidePrefix: listSlide.id,
    elementId: 'e2e-tf-list',
  })
  rec(
    'list first glyph stays left-aligned with the editor (not Konva-flattened)',
    list.ok && list.leftDelta <= MAX_LIST_LEFT_DELTA && list.thumbLeft < 0.12,
    list,
  )

  if (existsSync(HOUBY_PPTX)) {
    const input = page.locator('input[type=file][accept*=".pptx"]')
    await input.setInputFiles(HOUBY_PPTX)
    const replace = page.getByText('Replace', { exact: true })
    if (await replace.waitFor({ timeout: 12000 }).then(() => true).catch(() => false)) {
      await replace.click()
    }
    await page.getByText(/Houby:\s*Skrytý/i).first().waitFor({ timeout: 180000 })
    await page.evaluate(() => window.__FIKA_RASTER__.reset())
    const jumped = await page.evaluate(() => {
      const slides = window.__FIKA_SLIDES__.getState()
      const index = slides.slides.findIndex(slide => (
        slide.elements.some(el => (el.text?.content || el.content || '').includes('Neznámé houby nekopejte'))
      ))
      if (index < 0) return null
      slides.updateSlideIndex(index)
      return { index, id: slides.slides[index].id, count: slides.slides.length }
    })
    rec('Houby deck exposes slide 10 body copy', !!jumped, jumped)
    if (jumped) {
      const houbyStats = await waitIdle(page)
      const houby = await measurePair(page, {
        needle: BODY,
        slidePrefix: jumped.id,
        elementId: '',
      })
      rec('Houby import rasterizes the rail', houbyStats.hqPaints + houbyStats.lqPaints > 0, houbyStats)
      rec('Houby slide 10 body left edge matches the thumb', houby.ok && houby.leftDelta <= MAX_LEFT_DELTA, { ...houby, booths: houbyStats.booths })
    }
  }
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
