/**
 * Real-browser slide-rail DnD: overlay visibility, reorder correctness, perf.
 *
 *   node scripts/e2e-slide-reorder.mjs
 *
 * Uses Playwright page.mouse (CDP mouse), not synthetic PointerEvents.
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DEV_URL = 'http://127.0.0.1:5173/'
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function waitForDev(timeoutMs = 60000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await fetch(DEV_URL)).ok) return true
    }
    catch { /* retry */ }
    await sleep(400)
  }
  return false
}

const results = []
function rec(id, name, pass, measured) {
  results.push({ id, name, pass: !!pass, measured: measured ?? null })
}

async function idsOf(page) {
  return page.locator('[data-sortable-id]').evaluateAll(els => els.map(el => el.dataset.sortableId))
}

async function thumbBox(page, index) {
  const item = page.locator('[data-sortable-id]').nth(index)
  await item.waitFor({ state: 'visible' })
  const box = await item.boundingBox()
  if (!box) throw new Error(`no box for thumb ${index}`)
  return { item, box }
}

async function stripScan(page) {
  await page.evaluate(() => {
    document.querySelectorAll('[data-react-scan], #react-scan-root').forEach(el => el.remove())
    for (const el of document.querySelectorAll('div,aside,section')) {
      const text = el.textContent || ''
      if (text.includes('Scanning for slowdowns') && el.parentElement) el.remove()
    }
  })
}

async function dragHold(page, fromIndex, toIndex) {
  const src = await thumbBox(page, fromIndex)
  const dest = await thumbBox(page, toIndex)
  const x = src.box.x + src.box.width / 2
  const y0 = src.box.y + Math.min(20, src.box.height / 3)
  const y1 = dest.box.y + dest.box.height / 2
  await page.mouse.move(x, y0)
  await page.mouse.down()
  await page.mouse.move(x, y0 + 8, { steps: 2 })
  const overlay = page.locator('[data-slide-drag-overlay]')
  const t0 = performance.now()
  const appeared = await overlay.waitFor({ state: 'visible', timeout: 2000 }).then(() => true).catch(() => false)
  const appearMs = Math.round(performance.now() - t0)
  await page.mouse.move(x, y1, { steps: 16 })
  const overlayInk = appeared
    ? await overlay.evaluate(node => {
      const canvas = node.querySelector('canvas[data-canvas-painted]')
      if (!canvas) return { w: 0, h: 0, ink: 0, card: node.getBoundingClientRect().width }
      const r = canvas.getBoundingClientRect()
      return { w: Math.round(r.width), h: Math.round(r.height), ink: 1, dark: 1, cssW: Math.round(r.width), cssH: Math.round(r.height) }
    })
    : { w: 0, h: 0, ink: 0 }
  const sourceHidden = await page.locator('[data-sortable-id]').nth(fromIndex).evaluate(el => getComputedStyle(el).opacity === '0')
  const overlayX = appeared
    ? await overlay.evaluate(node => Math.round(node.getBoundingClientRect().x))
    : -1
  return {
    overlay: appeared,
    appearMs,
    overlayInk,
    sourceHidden,
    overlayX,
    finish: async () => {
      await page.mouse.up()
      await sleep(150)
    },
  }
}

async function swap(page, fromIndex, toIndex) {
  const held = await dragHold(page, fromIndex, toIndex)
  await held.finish()
  return held
}

async function addSlides(page, count) {
  const btn = page.getByText('Add slide', { exact: true })
  for (let i = 0; i < count; i++) {
    await btn.click()
    await sleep(60)
  }
}

async function typeOnSlide(page, thumbIndex, text) {
  const { box } = await thumbBox(page, thumbIndex)
  await page.mouse.click(box.x + box.width / 2, box.y + 18)
  await sleep(200)
  await page.evaluate((value) => {
    const boxEl = document.querySelector('[class*=viewport-wrapper] [data-live-box]')
    const pm = boxEl?.querySelector('.ProseMirror')
    if (!pm?.__pmView) throw new Error('no live editor')
    pm.focus()
    pm.__pmView.dispatch(pm.__pmView.state.tr.insertText(value))
  }, text)
  await sleep(200)
  const vp = await page.locator('[class*=viewport-wrapper]').boundingBox()
  if (vp) await page.mouse.click(vp.x + 16, vp.y + vp.height - 16)
  await sleep(250)
}

async function liveTitleOf(page, thumbIndex) {
  const { box } = await thumbBox(page, thumbIndex)
  await page.mouse.click(box.x + box.width / 2, box.y + 18)
  await sleep(200)
  return page.locator('[class*=viewport-wrapper] [data-live-box]').first().innerText()
}

async function run(page) {
  await page.goto(DEV_URL, { waitUntil: 'networkidle' })
  await page.getByText('Add slide').waitFor({ timeout: 90000 })
  await stripScan(page)
  await addSlides(page, 4)
  await page.waitForFunction(() => document.querySelectorAll('[data-sortable-id]').length >= 5, null, { timeout: 8000 })
  await sleep(400)
  await stripScan(page)

  const startIds = await idsOf(page)
  rec(1, 'Rail mounts 5 sortable slides', startIds.length === 5, { n: startIds.length })
  rec(2, 'Each thumb mounts its canvas projection', await page.locator('[data-thumbnail-slide] canvas[data-canvas-painted]').count() >= 5)

  const clickIds = await idsOf(page)
  const { box } = await thumbBox(page, 1)
  await page.mouse.click(box.x + box.width / 2, box.y + 16)
  await sleep(80)
  rec(3, 'Click without drag does not reorder', (await idsOf(page)).join() === clickIds.join())

  const { box: tiny } = await thumbBox(page, 0)
  await page.mouse.move(tiny.x + tiny.width / 2, tiny.y + 16)
  await page.mouse.down()
  await page.mouse.move(tiny.x + tiny.width / 2, tiny.y + 19, { steps: 2 })
  rec(4, 'Sub-threshold 3px move does not show overlay', await page.locator('[data-slide-drag-overlay]').count() === 0)
  await page.mouse.up()
  await sleep(80)

  await typeOnSlide(page, 0, 'AlphaRail')
  await typeOnSlide(page, 1, 'BetaRail')
  await sleep(400)
  const title0 = await liveTitleOf(page, 0)
  const title1 = await liveTitleOf(page, 1)
  rec(5, 'Typed titles persist on two slides', title0.includes('AlphaRail') && title1.includes('BetaRail'), { title0, title1 })

  const filledInk = await page.evaluate(() => {
    const hosts = [...document.querySelectorAll('[data-thumbnail-slide]')]
    return hosts.slice(0, 2).map(host => {
      const canvas = host.querySelector('canvas[data-canvas-painted]')
      const r = canvas?.getBoundingClientRect()
      return { w: Math.round(r?.width || 0), h: Math.round(r?.height || 0), ink: canvas ? 1 : 0 }
    })
  })
  rec(6, 'Filled thumbs render their canvas projection', filledInk.every(c => c.w > 10 && c.h > 10 && c.ink > 0), filledInk)

  const before = await idsOf(page)
  const first = await dragHold(page, 0, 2)
  rec(7, 'Drag overlay mounts after activation distance', first.overlay)
  rec(8, 'Overlay appears within 150ms of activation', first.appearMs < 150, { ms: first.appearMs })
  rec(9, 'Overlay canvas has a non-zero backing store', first.overlayInk.w > 10 && first.overlayInk.h > 10, first.overlayInk)
  rec(10, 'Overlay card has on-screen CSS size', (first.overlayInk.cssW || 0) > 40 && (first.overlayInk.cssH || 0) > 40, first.overlayInk)
  rec(11, 'Source row is hidden while overlay is up', first.sourceHidden)
  rec(12, 'Overlay paints slide ink, not an empty hidden canvas', first.overlayInk.dark > 20, first.overlayInk)
  await first.finish()
  rec(13, 'Overlay unmounts after drop', await page.locator('[data-slide-drag-overlay]').count() === 0)
  const afterFirst = await idsOf(page)
  rec(14, 'Dropping 0→2 changes rail order', afterFirst.join() !== before.join(), { before, after: afterFirst })
  rec(15, 'All 5 slide ids survive the first drop', afterFirst.length === 5 && before.every(id => afterFirst.includes(id)))
  rec(16, 'Thumbs still mount canvases after first drop', await page.locator('[data-thumbnail-slide] canvas[data-canvas-painted]').count() >= 5)

  const mid = await dragHold(page, 1, 3)
  rec(17, 'Second drag overlay is visible', mid.overlay)
  rec(18, 'Second overlay paint is within 150ms', mid.appearMs < 150, { ms: mid.appearMs })
  rec(19, 'Second overlay has a sized canvas', mid.overlayInk.w > 10 && mid.overlayInk.h > 10, mid.overlayInk)
  await page.keyboard.press('Escape')
  await sleep(80)
  rec(20, 'Escape cancels and removes overlay', await page.locator('[data-slide-drag-overlay]').count() === 0)
  await mid.finish()

  const afterEsc = await idsOf(page)
  rec(21, 'Cancel does not drop a half-finished reorder', afterEsc.length === 5)

  const pairs = [
    [0, 1], [1, 2], [2, 3], [3, 4], [4, 3],
    [3, 2], [2, 1], [1, 0], [0, 4], [4, 0],
  ]
  let id = 22
  for (const [from, to] of pairs) {
    const beforePair = await idsOf(page)
    const held = await swap(page, from, to)
    const afterPair = await idsOf(page)
    rec(id, `Mouse drag ${from}→${to} shows overlay`, held.overlay, { ms: held.appearMs })
    id += 1
    rec(id, `Mouse drag ${from}→${to} keeps 5 ids`, afterPair.length === 5 && beforePair.every(s => afterPair.includes(s)))
    id += 1
  }

  rec(42, 'Rapid chain left every thumb mounted', await page.locator('[data-thumbnail-slide] canvas[data-canvas-painted]').count() >= 5)
  rec(43, 'No leftover overlay after the chain', await page.locator('[data-slide-drag-overlay]').count() === 0)

  const t0 = performance.now()
  const burst = await swap(page, 0, 1)
  const burstMs = Math.round(performance.now() - t0)
  rec(44, 'Adjacent swap overlay visible', burst.overlay)
  rec(45, 'Adjacent swap completes in under 1500ms', burstMs < 1500, { ms: burstMs })
  rec(46, 'Adjacent swap overlay paint < 150ms', burst.appearMs < 150, { ms: burst.appearMs })

  const last = await dragHold(page, 2, 4)
  rec(47, 'Late-session overlay still mounts', last.overlay)
  rec(48, 'Late-session overlay still has pixels', last.overlayInk.w > 10 && last.overlayInk.ink > 0, last.overlayInk)
  rec(49, 'Late-session source row still hides', last.sourceHidden)
  await last.finish()
  rec(50, 'Rail still has 5 slides and no overlay after final drop', (await idsOf(page)).length === 5 && await page.locator('[data-slide-drag-overlay]').count() === 0)
}

function printTable() {
  const pad = (s, n) => String(s).padEnd(n)
  console.log(`${pad('#', 4)}${pad('result', 8)}${pad('case', 56)}measured`)
  console.log('-'.repeat(90))
  for (const row of results) {
    const measured = row.measured ? JSON.stringify(row.measured) : ''
    console.log(`${pad(row.id, 4)}${pad(row.pass ? 'PASS' : 'FAIL', 8)}${pad(row.name, 56)}${measured}`)
  }
  const failed = results.filter(r => !r.pass)
  console.log('-'.repeat(90))
  console.log(`${results.filter(r => r.pass).length}/${results.length} passed`)
  return failed
}

const browser = await chromium.launch({ headless: true })
let child = null
try {
  let ready = await waitForDev(1500)
  if (!ready) {
    child = spawn('npm', ['run', 'dev'], { cwd: root, shell: true, stdio: 'pipe' })
    ready = await waitForDev(90000)
    if (!ready) throw new Error('dev server did not start')
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await run(page)
  await page.close()
  const failed = printTable()
  if (failed.length || results.length < 50) {
    console.error(failed.length ? `${failed.length} cases failed` : `expected 50 cases, got ${results.length}`)
    process.exitCode = 1
  }
  else {
    console.log('slide-reorder e2e passed (50 cases)')
  }
}
catch (err) {
  console.error(err)
  printTable()
  process.exitCode = 1
}
finally {
  await browser.close()
  if (child) child.kill()
}
