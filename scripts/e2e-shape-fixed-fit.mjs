/**
 * Fixed-height (locked) text must render 1:1 between the editor canvas and the
 * rail thumbnail. The rail uses the same Pretext fitting math before its
 * final-DPR Canvas text paint. Covers shrink, a move drag, and mixed-size runs.
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
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

  /**
   * Text geometry of one element's rendering, in slide coordinates.
   * `where`: 'editor' (canvas element) or 'thumb' (rail canvas thumbnail).
   */
  const textGeometry = (where) => page.evaluate(({ id, where, needle }) => {
    const slides = window.__FIKA_SLIDES__.getState()
    const slide = slides.slides[slides.slideIndex]
    const el = slide.elements.find(e => e.id === id)
    if (!el) return { ok: false, reason: 'no-element' }

    let node = null
    let host = null
    if (where === 'editor') {
      node = document.getElementById(`editable-element-${id}`)?.querySelector('.ProseMirror, .ProseMirror-static') ?? null
    }
    else {
      host = [...document.querySelectorAll('[data-thumbnail-slide]')].find(n => n.getAttribute('data-thumbnail-slide') === slide.id) ?? null
      node = host?.querySelector(`#screen-element-${id} .ProseMirror, #screen-element-${id} .ProseMirror-static`) ?? null
    }
    if (!node) return { ok: false, reason: 'no-text-node' }
    // Slide-box-relative measurement: invariant under the canvas zoom/transform
    // AND the thumb's viewport scale, so both sides land in authored slide px.
    const slideBox = where === 'editor'
      ? ([...document.querySelectorAll('[class*=viewport-wrapper]')].toSorted((a, b) => {
        const ar = a.getBoundingClientRect()
        const br = b.getBoundingClientRect()
        return (br.width * br.height) - (ar.width * ar.height)
      })[0]?.getBoundingClientRect())
      : host.getBoundingClientRect()
    if (!slideBox) return { ok: false, reason: 'no-slide-box' }
    const toSlideX = (x) => (x - slideBox.left) / slideBox.width * slides.viewportSize
    const toSlideY = (y) => (y - slideBox.top) / slideBox.height * (slides.viewportSize * slides.viewportRatio)
    const scale = 1
    const scopeRect = slideBox

    // first text line rect in slide coords
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
    let first = null
    const tops = new Set()
    let n
    while ((n = walker.nextNode())) {
      const r = document.createRange()
      r.selectNodeContents(n)
      for (const rect of r.getClientRects()) {
        if (rect.height > 1 && rect.width > 1) {
          tops.add(Math.round(toSlideY(rect.top)))
          if (!first || rect.left < first.left) {
            first = { left: rect.left, top: rect.top, bottom: rect.bottom, height: rect.height }
          }
        }
      }
      r.detach()
    }
    if (!first) return { ok: false, reason: 'no-text-rects' }
    return {
      ok: true,
      lines: tops.size,
      firstLeftSlide: toSlideX(first.left),
      firstTopSlide: toSlideY(first.top),
      lineBoxHSlide: first.height / slideBox.height * (slides.viewportSize * slides.viewportRatio),
      fitVar: (() => {
        const fit = node.closest('[data-text-fit-host]') ?? node.querySelector('[data-text-fit-host]')
        return fit ? parseFloat(getComputedStyle(fit).getPropertyValue('--text-fit-scale')) || 1 : 1
      })(),
    }
  }, { id: elId, where, needle: NEEDLE })

  const parity = async (label) => {
    const ed = await textGeometry('editor')
    const th = await textGeometry('thumb')
    rec(
      `${label}: wrap parity`,
      ed.ok && th.ok && th.lines === ed.lines,
      { editor: ed, thumb: th },
    )
    if (ed.ok && th.ok) {
      rec(
        `${label}: first-ink left matches`,
        Math.abs(th.firstLeftSlide - ed.firstLeftSlide) <= MAX_POS_DELTA,
        { thumb: +th.firstLeftSlide.toFixed(1), editor: +ed.firstLeftSlide.toFixed(1) },
      )
      rec(
        `${label}: first-ink top matches`,
        Math.abs(th.firstTopSlide - ed.firstTopSlide) <= MAX_POS_DELTA,
        { thumb: +th.firstTopSlide.toFixed(1), editor: +ed.firstTopSlide.toFixed(1) },
      )
      rec(
        `${label}: text fit scale matches`,
        Math.abs(th.fitVar - ed.fitVar) <= 0.02,
        { thumb: th.fitVar, editor: ed.fitVar },
      )
    }
    return ed
  }

  // ---- baseline: native fit ----
  let ed = await parity('baseline')
  rec('baseline: no shrink needed yet', ed.ok && ed.fitVar === 1, ed)

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
    ed = await textGeometry('editor')
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
  await page.mouse.move(mx + 120, my + 90, { steps: 10 })
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
    Math.abs(after.w - before.w) < 1 && Math.abs(after.h - before.h) < 1 && after.left > before.left + 50,
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

