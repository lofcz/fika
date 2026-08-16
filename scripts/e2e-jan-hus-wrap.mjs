/**
 * Jan Hus import: the rail thumb must wrap and align text exactly like the
 * editor canvas. Both are the same live DOM now, so line breaks and glyph
 * positions are compared directly between the two trees.
 *
 *   node scripts/e2e-jan-hus-wrap.mjs
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { JAN_HUS_PPTX } from '../tests/fixtures/paths.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const DEV_PORTS = [5173, 5174, 5175, 5176]
const NEEDLE = 'Jan Hus a T. G. Masaryk'
const MAX_LINE_DELTA = 0
const MAX_LEFT_DELTA = 0.012

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

/** Title element on the current slide. */
async function titleElement(page) {
  return page.evaluate((needle) => {
    const slides = window.__FIKA_SLIDES__.getState()
    const slide = slides.slides[slides.slideIndex]
    const element = slide?.elements.find(el => (el.content || el.text?.content || '').includes(needle))
    return element ? { id: element.id, width: element.width, left: element.left } : null
  }, NEEDLE)
}

/**
 * Measure the title's line boxes inside a surface (editor canvas or live
 * thumb): line count and first-glyph left/top, normalized to the surface.
 */
async function readLines(page, surface) {
  return page.evaluate(({ needle, surface }) => {
    const scope = surface === 'thumb'
      ? (() => {
        const slides = window.__FIKA_SLIDES__.getState()
        const slide = slides.slides[slides.slideIndex]
        return [...document.querySelectorAll('[data-thumbnail-slide]')].find(el => (
          el.getAttribute('data-thumbnail-slide') === slide.id
        ))
      })()
      : [...document.querySelectorAll('[class*=viewport-wrapper]')].toSorted((a, b) => {
        const ar = a.getBoundingClientRect()
        const br = b.getBoundingClientRect()
        return (br.width * br.height) - (ar.width * ar.height)
      })[0]
    if (!scope) return { ok: false, reason: `no-${surface}` }
    const root = [...(scope.querySelectorAll('.ProseMirror, .ProseMirror-static') || [])]
      .find(node => (node.textContent || '').includes(needle) && node.getBoundingClientRect().width > 1)
    if (!root) return { ok: false, reason: `no-${surface}-text` }
    const scopeBox = scope.getBoundingClientRect()
    const range = document.createRange()
    range.selectNodeContents(root)
    const rects = [...range.getClientRects()].filter(r => r.width > 0.5 && r.height > 0.5)
    range.detach()
    if (!rects.length) return { ok: false, reason: 'no-rects' }
    const lineTops = [...new Set(rects.map(r => Math.round(r.top / 4)))].length
    const minX = rects.reduce((m, r) => Math.min(m, r.left), Infinity)
    const minY = rects.reduce((m, r) => Math.min(m, r.top), Infinity)
    return {
      ok: true,
      lines: lineTops,
      left: (minX - scopeBox.left) / Math.max(1, scopeBox.width),
      top: (minY - scopeBox.top) / Math.max(1, scopeBox.height),
    }
  }, { needle: NEEDLE, surface })
}

async function pair(page) {
  const editor = await readLines(page, 'editor')
  const thumb = await readLines(page, 'thumb')
  return { editor, thumb }
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

  const input = page.locator('input[type=file][accept*=".pptx"]')
  await input.setInputFiles(JAN_HUS_PPTX)
  const replace = page.getByText('Replace', { exact: true })
  if (await replace.waitFor({ timeout: 10000 }).then(() => true).catch(() => false)) {
    await replace.click()
  }
  await page.getByText(NEEDLE, { exact: false }).first().waitFor({ timeout: 180000 })
  await page.evaluate(() => window.__FIKA_SLIDES__.getState().updateSlideIndex(0))
  await sleep(800)

  const before = await pair(page)
  rec('editor shows the imported title', before.editor.ok, before)
  rec('rail thumb mounts the imported title', before.thumb.ok, before)
  rec(
    'title wraps the same before resize',
    before.editor.ok && before.thumb.ok && Math.abs(before.thumb.lines - before.editor.lines) <= MAX_LINE_DELTA,
    before,
  )
  rec(
    'title first-glyph left edge matches before resize',
    before.editor.ok && before.thumb.ok && Math.abs(before.thumb.left - before.editor.left) <= MAX_LEFT_DELTA,
    before,
  )

  // Resize the title narrower by dragging its right handle in.
  const el = await titleElement(page)
  if (!el) throw new Error('title element not found')
  let selected = false
  for (let i = 0; i < 8 && !selected; i++) {
    await page.evaluate((id) => {
      const main = window.__FIKA_MAIN__
      main.getState().setEditingElementId('')
      main.getState().setActiveElementIdList([id])
      main.getState().setEditorareaFocus(true)
    }, el.id)
    await sleep(120)
    selected = (await page.locator(`#operate-element-${el.id} [data-resize-handle]`).count()) > 0
  }
  if (!selected) throw new Error('could not select title')
  const handle = page.locator(`#operate-element-${el.id} [data-resize-handle="right"]`).first()
  await handle.waitFor({ state: 'attached', timeout: 8000 })
  await handle.scrollIntoViewIfNeeded()
  const handleBox = await handle.boundingBox()
  if (!handleBox) throw new Error('title resize handle has no box')
  const startX = handleBox.x + handleBox.width / 2
  const startY = handleBox.y + handleBox.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX - 60, startY, { steps: 10 })
  await page.mouse.up()
  await sleep(600)

  const elAfter = await titleElement(page)
  console.log('title width before/after drag:', el.width, '->', elAfter?.width)
  rec('resize handle committed a new width', !!elAfter && elAfter.width !== el.width, { before: el.width, after: elAfter?.width })

  const after = await pair(page)
  rec(
    'title wraps the same after resize',
    after.editor.ok && after.thumb.ok && Math.abs(after.thumb.lines - after.editor.lines) <= MAX_LINE_DELTA,
    after,
  )
  rec(
    'title first-glyph left edge matches after resize',
    after.editor.ok && after.thumb.ok && Math.abs(after.thumb.left - after.editor.left) <= MAX_LEFT_DELTA,
    after,
  )
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
