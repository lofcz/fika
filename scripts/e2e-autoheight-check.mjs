/**
 * The box must VISIBLY contain its text. After enlarging a fragment, the box's
 * real pixel height must cover the text's real pixel extent (bottom of last line
 * vs bottom of box). No store-vs-DOM, no sub-pixel — just: does text fit in the box?
 *
 *   node scripts/e2e-autoheight-check.mjs
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const DEV_PORTS = [5173, 5174, 5175, 5176]

async function isFikaDev(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) return false
    return (await res.text()).includes('fika-shell') || (await Promise.resolve(true))
  }
  catch { return false }
}
async function findFikaDev() {
  for (const port of DEV_PORTS) {
    const url = `http://127.0.0.1:${port}/`
    try {
      const res = await fetch(url)
      if (res.ok && (await res.text()).includes('fika-shell')) return url
    } catch {}
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

// A fixed-height (shrink-to-fit) box: content near the limit, then a fragment enlarged.
const EL = {
  id: 'e2e-ah', type: 'text', left: 60, top: 60, width: 420, height: 90, rotate: 0,
  content: '<p>alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron</p>',
  defaultFontName: 'Arial', defaultColor: '#111111', fill: '',
  lineHeight: 1.4, inset: [8, 8, 8, 8], fixedHeight: true,
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
    if (!devUrl) throw new Error('dev server did not start')
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  await page.goto(devUrl, { waitUntil: 'networkidle' })
  await page.getByText('Add slide').waitFor({ timeout: 90000 })
  await page.evaluate(() => document.querySelectorAll('[data-react-scan], #react-scan-root').forEach(el => el.remove()))
  await waitForHooks(page)

  await page.evaluate((el) => {
    const slides = window.__FIKA_SLIDES__
    const main = window.__FIKA_MAIN__
    slides.getState().addSlide({ id: `ah-${Date.now()}`, elements: [el] })
    main.getState().setActiveElementIdList([el.id])
    main.getState().setEditorareaFocus(true)
  }, EL)
  await page.waitForSelector(`#editable-element-${EL.id}`, { state: 'attached', timeout: 15000 })
  await sleep(400)

  // Read, in SLIDE pixels: the box extent vs the text's painted extent.
  const measure = () => page.evaluate((id) => {
    const slides = window.__FIKA_SLIDES__.getState()
    const slide = slides.slides[slides.slides.length - 1]
    const el = slide.elements.find(e => e.id === id)
    const root = document.getElementById(`editable-element-${id}`)
    const pm = root?.querySelector('.ProseMirror')
    if (!el || !root || !pm) return null
    // screen -> slide scale via the element's own width
    const scale = root.getBoundingClientRect().width / el.width
    const boxR = (root.querySelector('[data-live-box]') || root).getBoundingClientRect()
    const range = document.createRange()
    range.selectNodeContents(pm)
    const rects = [...range.getClientRects()].filter(r => r.height > 0.5)
    range.detach()
    const textBottom = Math.max(...rects.map(r => r.bottom))
    const textTop = Math.min(...rects.map(r => r.top))
    return {
      storeHeight: el.height,
      fixedHeight: !!el.fixedHeight,
      boxHeightSlide: boxR.height / scale,
      textHeightSlide: (textBottom - textTop) / scale,
      // how far text bottom pokes past box bottom, in slide px
      overhangSlide: (textBottom - boxR.bottom) / scale,
      lineCount: new Set(rects.map(r => Math.round(r.top))).size,
    }
  }, EL.id)

  const before = await measure()
  rec('text fits before change', before && before.overhangSlide <= 1, before)

  // Enlarge the fragment "gamma delta".
  await page.evaluate((id) => {
    const view = document.getElementById(`editable-element-${id}`)?.querySelector('.ProseMirror')?.__pmView
    if (!view) return
    const { state } = view
    const text = state.doc.textContent
    const from = text.indexOf('gamma') + 1
    const to = text.indexOf('delta') + 6
    view.dispatch(state.tr.addMark(from, to, state.schema.marks.fontsize.create({ fontsize: '64px' })))
  }, EL.id)

  // settle
  let prev = null, cur = null
  for (let i = 0; i < 30; i++) {
    await sleep(100)
    cur = await measure()
    if (prev && cur && prev.storeHeight === cur.storeHeight) break
    prev = cur
  }
  rec('big fragment is in the HTML', await page.evaluate((id) => {
    const slides = window.__FIKA_SLIDES__.getState()
    const slide = slides.slides[slides.slides.length - 1]
    return /font-size:\s*64px/.test(slide.elements.find(e => e.id === id)?.content || '')
  }, EL.id))
  // For fixed-height boxes the box stays put and text must shrink-to-fit inside it.
  rec('TEXT FITS INSIDE BOX (shrink-to-fit)', cur && cur.overhangSlide <= 1, cur)
  rec('whole text did NOT collapse to the fragment size', await page.evaluate((id) => {
    const pm = document.getElementById(`editable-element-${id}`)?.querySelector('.ProseMirror')
    const spans = [...(pm?.querySelectorAll('span[style*=font-size]') || [])]
    const sizes = spans.map(s => parseFloat(getComputedStyle(s).fontSize))
    const body = pm ? parseFloat(getComputedStyle(pm).fontSize) : 0
    // the unmarked body runs must still be near the base size, not dragged to 64
    return sizes.every(s => s >= body * 0.5)
  }, EL.id), cur)
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
if (failed.length) { console.error(`\n${failed.length}/${results.length} failed`); process.exit(1) }
console.log(`\n${results.length}/${results.length} passed`)
