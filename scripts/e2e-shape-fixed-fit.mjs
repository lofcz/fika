/**
 * Fixed-height (locked) text must render 1:1 between the editor canvas and the
 * rail thumbnail. The rail uses the same Pretext fitting math before its
 * final-DPR Canvas text paint. Covers shrink and a move drag.
 *
 *   node scripts/e2e-shape-fixed-fit.mjs
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { FIXED_FIT_DECK_PPTX } from '../tests/fixtures/paths.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DEV_PORTS = [5173, 5174, 5175, 5176]
const sleep = ms => new Promise(r => setTimeout(r, ms))
const NEEDLE = 'Jan Hus: Hled'

const MAX_POS_DELTA = 3
const MAX_SIZE_RATIO = 0.06

async function isFikaDev(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) return false
    const html = await res.text()
    return html.includes('fika-shell') || html.includes('>fika<')
  }
  catch { return false }
}
async function findFikaDev() {
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
    if (await page.evaluate(() => !!(window.__FIKA_SLIDES__ && window.__FIKA_MAIN__))) return
    await sleep(250)
  }
  throw new Error('fika hooks missing')
}

const results = []
const rec = (name, pass, measured) => results.push({ name, pass: !!pass, measured })

const browser = await chromium.launch({ headless: true })
let child = null
try {
  if (!existsSync(FIXED_FIT_DECK_PPTX)) throw new Error(`fixture missing: ${FIXED_FIT_DECK_PPTX}`)
  let devUrl = await waitForDev(1500)
  if (!devUrl) {
    child = spawn('npm', ['run', 'dev'], { cwd: root, shell: true, stdio: 'ignore' })
    devUrl = await waitForDev(90000)
    if (!devUrl) throw new Error('fika dev server did not start')
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 4 })
  await page.goto(devUrl, { waitUntil: 'networkidle' })
  await page.getByText('Add slide').waitFor({ timeout: 90000 })
  await page.evaluate(() => {
    document.querySelectorAll('[data-react-scan]').forEach(n => n.remove())
    const rs = document.getElementById('react-scan-root')
    if (rs) rs.remove()
  })
  await waitForHooks(page)

  const input = page.locator('input[type=file][accept*=".pptx"]')
  await input.setInputFiles(FIXED_FIT_DECK_PPTX)
  const replace = page.getByText('Replace', { exact: true })
  if (await replace.waitFor({ timeout: 10000 }).then(() => true).catch(() => false)) {
    await replace.click()
  }
  await page.getByText('Jan Hus', { exact: false }).first().waitFor({ timeout: 180000 })
  await page.evaluate(() => window.__FIKA_SLIDES__.getState().updateSlideIndex(2))
  await sleep(1200)

  const elId = await page.evaluate((needle) => {
    const slides = window.__FIKA_SLIDES__.getState()
    const element = slides.slides[2].elements.find(el => (el.content || el.text?.content || '').includes(needle))
    return element?.id
  }, NEEDLE)
  if (!elId) throw new Error('fixed-fit deck title not found')
  // Preserve the imported title's runs and geometry, but avoid measuring body
  // text underneath it after dragging.
  await page.evaluate(id => {
    const store = window.__FIKA_SLIDES__.getState()
    store.updateSlide({ elements: store.slides[2].elements.filter(el => el.id === id) })
  }, elId)
  await sleep(600)

  const editorFit = () => page.evaluate(id => {
    const node = document.getElementById(`editable-element-${id}`)?.querySelector('.ProseMirror, .ProseMirror-static')
    if (!node) return { ok: false, reason: 'no-editor-text' }
    const fit = node.closest('[data-text-fit-host]') ?? node.querySelector('[data-text-fit-host]')
    return { ok: true, fitVar: fit ? parseFloat(getComputedStyle(fit).getPropertyValue('--text-fit-scale')) || 1 : 1 }
  }, elId)

  // Compare glyph pixels on both surfaces; DOM line boxes include font leading
  // and cannot be compared to ink bounds. High DPR keeps 3 slide-px meaningful.
  const inkGeometry = async (where) => {
    const screenshot = where === 'editor' ? (await page.screenshot()).toString('base64') : null
    return page.evaluate(async ({ id, where, screenshot }) => {
      const state = window.__FIKA_SLIDES__.getState()
      const slide = state.slides[state.slideIndex]
      const el = slide.elements.find(value => value.id === id)
      let canvas, sx, sy, originX = 0, originY = 0
      if (where === 'editor') {
        const image = new Image()
        image.src = `data:image/png;base64,${screenshot}`
        await image.decode()
        canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
        canvas.getContext('2d').drawImage(image, 0, 0)
        const box = [...document.querySelectorAll('.viewport-wrapper')]
          .map(node => node.getBoundingClientRect()).sort((a, b) => b.width * b.height - a.width * a.height)[0]
        const dpr = image.width / innerWidth
        sx = box.width * dpr / state.viewportSize
        sy = box.height * dpr / (state.viewportSize * state.viewportRatio)
        originX = box.x * dpr; originY = box.y * dpr
      }
      else {
        const host = [...document.querySelectorAll('[data-thumbnail-slide]')].find(node => node.dataset.thumbnailSlide === slide.id)
        canvas = host?.querySelector('canvas[data-canvas-painted]')
        if (!canvas) return { ok: false, reason: 'no-painted-thumbnail' }
        sx = canvas.width / state.viewportSize
        sy = canvas.height / (state.viewportSize * state.viewportRatio)
      }
      const x = Math.floor(originX + el.left * sx), y = Math.floor(originY + el.top * sy)
      const width = Math.ceil(el.width * sx), height = Math.ceil(el.height * sy)
      const pixels = canvas.getContext('2d').getImageData(x, y, width, height).data
      const colors = new Map()
      for (let p = 0; p < pixels.length; p += 4) {
        const key = (pixels[p] >> 4) * 256 + (pixels[p + 1] >> 4) * 16 + (pixels[p + 2] >> 4)
        colors.set(key, (colors.get(key) || 0) + 1)
      }
      const background = [...colors].sort((a, b) => b[1] - a[1])[0][0]
      const bg = [(background >> 8) * 16 + 8, ((background >> 4) & 15) * 16 + 8, (background & 15) * 16 + 8]
      const rows = []
      let left = width, right = -1
      for (let row = 0; row < height; row++) {
        let ink = 0
        for (let col = 0; col < width; col++) {
          const p = (row * width + col) * 4
          if (pixels[p + 3] > 128 && bg.some((value, c) => Math.abs(pixels[p + c] - value) > 70)) {
            ink++; left = Math.min(left, col); right = Math.max(right, col)
          }
        }
        if (ink) rows.push(row)
      }
      if (!rows.length) return { ok: false, reason: 'no-text-ink' }
      let lines = 1
      for (let i = 1; i < rows.length; i++) if (rows[i] - rows[i - 1] > Math.max(2, 3 * sy)) lines++
      return { ok: true, lines, left: (x + left - originX) / sx, top: (y + rows[0] - originY) / sy,
        width: (right - left + 1) / sx, height: (rows.at(-1) - rows[0] + 1) / sy }
    }, { id: elId, where, screenshot })
  }
  const parity = async (label) => {
    // Selection outlines are editor UI, not slide ink.
    await page.evaluate(() => window.__FIKA_MAIN__.getState().setActiveElementIdList([]))
    await sleep(350)
    const ed = await inkGeometry('editor')
    const th = await inkGeometry('thumb')
    rec(`${label}: wrap parity`, ed.ok && th.ok && th.lines === ed.lines, { editor: ed, thumb: th })
    if (ed.ok && th.ok) {
      rec(`${label}: first-ink left matches`, Math.abs(th.left - ed.left) <= MAX_POS_DELTA, { editor: ed.left, thumb: th.left })
      rec(`${label}: first-ink top matches`, Math.abs(th.top - ed.top) <= MAX_POS_DELTA, { editor: ed.top, thumb: th.top })
      rec(`${label}: fitted glyph size matches`, Math.abs(th.width / ed.width - 1) <= MAX_SIZE_RATIO && Math.abs(th.height / ed.height - 1) <= MAX_SIZE_RATIO, { editor: ed, thumb: th })
    }
    return editorFit()
  }

  // ---- baseline: native fit ----
  let ed = await parity('baseline')
  rec('baseline: no shrink needed yet', ed.ok && ed.fitVar === 1, ed)
  // Negative controls prove the pixel checks reject blank, shifted, and
  // incorrectly scaled text instead of merely reading the model's geometry.
  const originalInk = await inkGeometry('thumb')
  const alterThumbnail = (mode) => page.evaluate(({ id, mode }) => {
    const state = window.__FIKA_SLIDES__.getState(), slide = state.slides[state.slideIndex]
    const host = [...document.querySelectorAll('[data-thumbnail-slide]')].find(node => node.dataset.thumbnailSlide === slide.id)
    const canvas = host.querySelector('canvas[data-canvas-painted]'), ctx = canvas.getContext('2d')
    if (!canvas.testOriginal) {
      canvas.testOriginal = document.createElement('canvas')
      canvas.testOriginal.width = canvas.width; canvas.testOriginal.height = canvas.height
      canvas.testOriginal.getContext('2d').drawImage(canvas, 0, 0)
    }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (mode === 'blank') { ctx.restore(); return }
    if (mode === 'shift') ctx.translate(12 * canvas.width / state.viewportSize, 0)
    if (mode === 'scale') {
      const el = slide.elements.find(value => value.id === id)
      const x = el.left * canvas.width / state.viewportSize, y = el.top * canvas.height / (state.viewportSize * state.viewportRatio)
      ctx.translate(x, y); ctx.scale(.8, .8); ctx.translate(-x, -y)
    }
    ctx.drawImage(canvas.testOriginal, 0, 0); ctx.restore()
    if (mode === 'restore') delete canvas.testOriginal
  }, { id: elId, mode })
  await alterThumbnail('shift')
  const shifted = await inkGeometry('thumb')
  rec('pixel measurement detects shifted glyphs', originalInk.ok && shifted.ok && Math.abs(shifted.left - originalInk.left) > MAX_POS_DELTA, { originalInk, shifted })
  await alterThumbnail('scale')
  const scaled = await inkGeometry('thumb')
  rec('pixel measurement detects wrong glyph size', originalInk.ok && scaled.ok && Math.abs(scaled.width / originalInk.width - 1) > MAX_SIZE_RATIO, { originalInk, scaled })
  await alterThumbnail('blank')
  rec('pixel measurement rejects blank thumbnails', !(await inkGeometry('thumb')).ok)
  await alterThumbnail('restore')


  // ---- force fixed + grow font until the editor shrinks ----
  await page.evaluate((id) => {
    const main = window.__FIKA_MAIN__
    main.getState().setEditingElementId('')
    main.getState().setActiveElementIdList([id])
    main.getState().setEditorareaFocus(true)
  }, elId)
  await sleep(400)
  const fixedBtn = page.locator('[data-height-mode=fixed]')
  if (await fixedBtn.count()) {
    await fixedBtn.first().click({ timeout: 8000 })
    await sleep(500)
  }
  for (let i = 0; i < 8; i++) {
    ed = await editorFit()
    if (ed.fitVar < 1) break
    const plus = page.locator('[class*=font-size-control] [class*=format-chip]').last()
    await plus.click({ timeout: 8000 })
    await sleep(500)
  }
  ed = await parity('shrunk')
  rec('editor shrinks the locked text (fit var < 1)', ed.ok && ed.fitVar < 1, ed)

  // ---- drag the box (pure move) and re-verify parity ----
  await page.evaluate((id) => {
    const main = window.__FIKA_MAIN__
    main.getState().setActiveElementIdList([id])
    main.getState().setEditorareaFocus(true)
  }, elId)
  await sleep(400)
  const before = await page.evaluate((id) => {
    const slides = window.__FIKA_SLIDES__.getState()
    const el = slides.slides[2].elements.find(e => e.id === id)
    return { left: el.left, top: el.top, w: el.width, h: el.height }
  }, elId)
  const op = await page.locator(`#operate-element-${elId}`).boundingBox()
  const mx = op.x + 2
  const my = op.y + op.height * 0.3
  await page.mouse.move(mx, my)
  await page.mouse.down()
  await page.mouse.move(mx - 50, my + 90, { steps: 10 })
  await sleep(80)
  await page.mouse.up()
  await sleep(700)
  const after = await page.evaluate((id) => {
    const slides = window.__FIKA_SLIDES__.getState()
    const el = slides.slides[2].elements.find(e => e.id === id)
    return { left: el.left, top: el.top, w: el.width, h: el.height }
  }, elId)
  rec(
    'drag moved the box without resizing it',
    Math.abs(after.w - before.w) < 1 && Math.abs(after.h - before.h) < 1 && after.left < before.left - 50,
    { before, after },
  )
  await page.evaluate(() => {
    window.__FIKA_MAIN__.getState().setActiveElementIdList([])
  })
  await sleep(600)
  await parity('moved')

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

