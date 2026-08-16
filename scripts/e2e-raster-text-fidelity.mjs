/**
 * Editor canvas and rail thumbs must paint text with the same HTML/CSS.
 * Reproduces Houby slide 10: left-aligned shape labels shifted in the old
 * Konva raster (center + px-only sizes) while the thumb now renders the SAME
 * ProseMirror tree — so glyph positions are compared directly between the two
 * live DOM trees, normalized to slide fractions.
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
/** List ::marker + inset is a few pixels; both trees render it identically. */
const MAX_LIST_LEFT_DELTA = 0.02
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
    if (await page.evaluate(() => !!window.__FIKA_SLIDES__)) return
    await sleep(250)
  }
  throw new Error('fika store hook did not appear')
}

async function injectSlide(page, slide) {
  return page.evaluate((next) => {
    window.__FIKA_SLIDES__.getState().addSlide({
      id: `${next.id}-${Date.now()}`,
      elements: next.elements,
      background: next.background,
    })
    return true
  }, slide)
}

/**
 * First-glyph position of `needle` in the editor canvas and in the slide's
 * live thumb, each normalized to its slide box. Both are real DOM, so the
 * numbers must agree to a fraction of a glyph — any drift means the thumb
 * stopped rendering the editor's tree.
 */
async function measurePair(page, { needle, slidePrefix }) {
  return page.evaluate(({ needle, slidePrefix }) => {
    const viewport = [...document.querySelectorAll('[class*=viewport-wrapper]')].toSorted((a, b) => {
      const ar = a.getBoundingClientRect()
      const br = b.getBoundingClientRect()
      return (br.width * br.height) - (ar.width * ar.height)
    })[0]
    const host = [...document.querySelectorAll('[data-thumbnail-slide]')].find(el => (
      el.getAttribute('data-thumbnail-slide')?.startsWith(slidePrefix)
    ))
    if (!viewport || !host) return { ok: false, reason: !viewport ? 'no-viewport' : 'no-thumb' }

    const firstGlyph = (root, box) => {
      const pm = [...(root?.querySelectorAll('.ProseMirror, .ProseMirror-static') || [])]
        .find(node => (node.textContent || '').includes(needle))
      if (!pm) return null
      const walker = document.createTreeWalker(pm, NodeFilter.SHOW_TEXT)
      let node = walker.nextNode()
      while (node && !(node.textContent || '').trim()) node = walker.nextNode()
      if (!node) return null
      const range = document.createRange()
      const text = node.textContent
      const offset = text.search(/\S/)
      range.setStart(node, offset < 0 ? 0 : offset)
      range.setEnd(node, (offset < 0 ? 0 : offset) + 1)
      const rect = range.getBoundingClientRect()
      const hostBox = box.getBoundingClientRect()
      if (!rect.width && !rect.height) return null
      return {
        left: (rect.left - hostBox.left) / hostBox.width,
        top: (rect.top - hostBox.top) / hostBox.height,
      }
    }

    const editorInk = firstGlyph(viewport, viewport)
    const thumbInk = firstGlyph(host, host)
    return {
      ok: !!editorInk && !!thumbInk,
      reason: !editorInk ? 'no-editor-text' : !thumbInk ? 'no-thumb-text' : '',
      editorLeft: editorInk?.left ?? null,
      thumbLeft: thumbInk?.left ?? null,
      editorTop: editorInk?.top ?? null,
      thumbTop: thumbInk?.top ?? null,
      leftDelta: editorInk && thumbInk ? Math.abs(thumbInk.left - editorInk.left) : null,
      topDelta: editorInk && thumbInk ? Math.abs(thumbInk.top - editorInk.top) : null,
    }
  }, { needle, slidePrefix })
}

/** Wait until the slide's thumbnail mounts its DOM (rail virtualizer + React). */
async function waitThumbMounted(page, prefix, timeoutMs = 15000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const mounted = await page.evaluate((prefix) => {
      const host = [...document.querySelectorAll('[data-thumbnail-slide]')].find(el => (
        el.getAttribute('data-thumbnail-slide')?.startsWith(prefix)
      ))
      return !!host?.querySelector('.screen-slide')
    }, prefix)
    if (mounted) return true
    await sleep(120)
  }
  return false
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
  rec('Houby-style shape labels render through the slide DOM', await waitThumbMounted(page, fidelitySlide.id))
  await page.getByText(BODY).first().waitFor({ timeout: 15000 })

  const body = await measurePair(page, { needle: BODY, slidePrefix: fidelitySlide.id })
  rec('injected body first glyph left edge matches the thumb', body.ok && body.leftDelta <= MAX_LEFT_DELTA, body)

  const title = await measurePair(page, { needle: TITLE, slidePrefix: fidelitySlide.id })
  rec('injected title first glyph left edge matches the thumb', title.ok && title.leftDelta <= MAX_LEFT_DELTA, title)

  const listOk = await injectSlide(page, listSlide)
  if (!listOk) throw new Error('could not inject list slide')
  rec('list markup renders through the slide DOM, not a text flatten', await waitThumbMounted(page, listSlide.id))
  const listDom = await page.evaluate((prefix) => {
    const host = [...document.querySelectorAll('[data-thumbnail-slide]')].find(el => (
      el.getAttribute('data-thumbnail-slide')?.startsWith(prefix)
    ))
    return { lis: host?.querySelectorAll('.screen-slide li').length || 0, uls: host?.querySelectorAll('.screen-slide ul').length || 0 }
  }, listSlide.id)
  const list = await measurePair(page, { needle: LIST_FIRST, slidePrefix: listSlide.id })
  rec(
    'list first glyph stays left-aligned with the editor (real list markup)',
    listDom.lis === 2 && listDom.uls === 1 && list.ok && list.leftDelta <= MAX_LIST_LEFT_DELTA && list.thumbLeft < 0.12,
    { ...list, ...listDom },
  )

  if (existsSync(HOUBY_PPTX)) {
    const input = page.locator('input[type=file][accept*=".pptx"]')
    await input.setInputFiles(HOUBY_PPTX)
    const replace = page.getByText('Replace', { exact: true })
    if (await replace.waitFor({ timeout: 12000 }).then(() => true).catch(() => false)) {
      await replace.click()
    }
    await page.getByText(/Houby:\s*Skrytý/i).first().waitFor({ timeout: 180000 })
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
      rec('Houby import mounts the rail thumb', await waitThumbMounted(page, jumped.id))
      const houby = await measurePair(page, { needle: BODY, slidePrefix: jumped.id })
      rec('Houby slide 10 body left edge matches the thumb', houby.ok && houby.leftDelta <= MAX_LEFT_DELTA, houby)
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
