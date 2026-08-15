/**
 * Real-browser Houby import: fixed-height live resize + shrink-to-fit.
 *
 *   node scripts/e2e-houby-fixed-fit.mjs
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { HOUBY_PPTX } from '../tests/fixtures/paths.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DEV_URL = 'http://127.0.0.1:5173/'
const SAMPLE = HOUBY_PPTX
const sleep = ms => new Promise(r => setTimeout(r, ms))

if (!existsSync(SAMPLE)) {
  console.error('Missing fixture:', SAMPLE)
  process.exit(1)
}

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

async function stripScan(page) {
  await page.evaluate(() => {
    document.querySelectorAll('[data-react-scan], #react-scan-root').forEach(el => el.remove())
  })
}

async function importHouby(page) {
  const input = page.locator('input[type=file][accept*=".pptx"]')
  await input.setInputFiles(SAMPLE)
  const replace = page.getByText('Replace', { exact: true })
  if (await replace.waitFor({ timeout: 10000 }).then(() => true).catch(() => false)) {
    await replace.click()
  }
  await page.getByText(/Houby:\s*Skrytý/i).first().waitFor({ timeout: 180000 })
  await sleep(600)
}

async function titleMetrics(page) {
  return page.evaluate(() => {
    const box = [...document.querySelectorAll('[class*=viewport-wrapper] [data-live-box]')].find(el => /Houby:\s*Skrytý/i.test(el.textContent || ''))
    if (!box) return null
    const root = box.closest('[id^=editable-element-]')
    const id = root?.id?.replace('editable-element-', '') || ''
    const operate = document.getElementById(`operate-element-${id}`)
    const host = box.querySelector('[data-text-fit-host]')
    const pm = box.querySelector('.ProseMirror, .ProseMirror-static')
    const br = box.getBoundingClientRect()
    const pr = pm?.getBoundingClientRect()
    const or_ = operate?.getBoundingClientRect()
    const zoom = parseFloat(host?.style.zoom || getComputedStyle(host || box).zoom || '1') || 1
    const overflowPx = pr && or_ ? pr.bottom - or_.bottom : null
    const handles = [...document.querySelectorAll('[class*=resize-handler]')]
    return {
      id,
      zoom,
      box: { w: br.width, h: br.height },
      pm: pr ? { w: pr.width, h: pr.height, bottom: pr.bottom } : null,
      operate: or_ ? { w: or_.width, h: or_.height, bottom: or_.bottom } : null,
      overflowPx,
      handleCount: handles.length,
      hasBottom: !!document.querySelector('[class*=resize-handler].bottom, [class*=resize-handler][class*=bottom]'),
      text: (pm?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
    }
  })
}

async function clickTitle(page) {
  const box = await page.evaluate(() => {
    const el = [...document.querySelectorAll('[class*=viewport-wrapper] [data-live-box]')].find(n => /Houby:\s*Skrytý/i.test(n.textContent || ''))
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + 24, y: r.top + 12 }
  })
  if (!box) throw new Error('Houby title box not found')
  await page.mouse.click(box.x, box.y)
  await sleep(200)
}

async function lockFixedHeight(page) {
  const locked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('[data-tooltip]')].find(el => /Fixed height|Pevná výška|Stała wysokość/i.test(el.getAttribute('data-tooltip') || ''))
    if (!btn) return { found: false, on: false }
    const on = btn.className.includes('on')
    if (!on) btn.click()
    return { found: true, on }
  })
  await sleep(200)
  return locked
}

async function dragHandle(page, kind, dx, dy) {
  const pos = await page.evaluate((which) => {
    const el = [...document.querySelectorAll('[class*=resize-handler]')].find(n => {
      const cls = n.className
      if (which === 'bottom') return /(^|\s)bottom(\s|$)/.test(cls) && !cls.includes('left') && !cls.includes('right')
      if (which === 'right') return /(^|\s)right(\s|$)/.test(cls) && !cls.includes('top') && !cls.includes('bottom')
      if (which === 'left') return /(^|\s)left(\s|$)/.test(cls) && !cls.includes('top') && !cls.includes('bottom')
      return false
    })
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }, kind)
  if (!pos) return false
  await page.mouse.move(pos.x, pos.y)
  await page.mouse.down()
  await page.mouse.move(pos.x + dx, pos.y + dy, { steps: 12 })
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
  const mid = await titleMetrics(page)
  await page.mouse.up()
  await sleep(150)
  return mid
}

async function run(page) {
  await page.goto(DEV_URL, { waitUntil: 'networkidle' })
  await page.getByText('Add slide').waitFor({ timeout: 90000 })
  await stripScan(page)
  const t0 = Date.now()
  await importHouby(page)
  const importMs = Date.now() - t0
  await stripScan(page)

  rec(1, 'Houby PPTX imports from fixtures', /Houby/i.test(await page.locator('body').innerText()), { ms: importMs })
  rec(2, 'Import finishes in under 90s', importMs < 90000, { ms: importMs })
  rec(3, 'Slide 1 title is on the canvas', await page.getByText(/Houby:\s*Skrytý/i).count() > 0)
  rec(4, 'Title live box exists', !!(await titleMetrics(page))?.id)

  await clickTitle(page)
  let m = await titleMetrics(page)
  rec(5, 'Clicking the title selects it', !!(m?.operate), m)
  const locked = await lockFixedHeight(page)
  rec(6, 'Fixed-height control is available', locked.found, locked)
  await sleep(150)
  m = await titleMetrics(page)
  rec(7, 'Fixed-height title exposes a bottom handle', !!m?.hasBottom, m)
  rec(8, 'Fixed-height title exposes 8 resize handles', (m?.handleCount || 0) >= 8, m)
  rec(9, 'Title text is Houby: Skrytý svět', /Houby/i.test(m?.text || ''), m)
  rec(10, 'Operate chrome has a positive height', (m?.operate?.h || 0) > 20, m)
  rec(11, 'Title glyphs stay inside the operate box', (m?.overflowPx ?? 99) <= 2, m)
  rec(12, 'Live box height matches operate (±4px)', Math.abs((m?.box.h || 0) - (m?.operate?.h || 0)) <= 4, m)

  const before = m
  const midGrow = await dragHandle(page, 'bottom', 0, 80)
  rec(13, 'Bottom-handle drag starts (real mouse)', !!midGrow)
  rec(14, 'Live resize keeps title text on screen', /Houby/i.test(midGrow?.text || ''), midGrow)
  rec(15, 'Live resize keeps text inside the box', (midGrow?.overflowPx ?? 99) <= 3, midGrow)
  rec(16, 'Growing the box updates operate height during the drag', (midGrow?.operate?.h || 0) > (before?.operate?.h || 0) + 20, { before: before?.operate, mid: midGrow?.operate })
  rec(17, 'Growing the box does not drop zoom below the prior scale', (midGrow?.zoom || 0) + 0.001 >= (before?.zoom || 0) - 0.05, { before: before?.zoom, mid: midGrow?.zoom })
  const fitT0 = Date.now()
  await dragHandle(page, 'bottom', 0, 20)
  const fitMs = Date.now() - fitT0
  rec(18, 'One live resize + remasure finishes under 800ms', fitMs < 800, { ms: fitMs })

  m = await titleMetrics(page)
  rec(19, 'After grow-drop, text still inside the box', (m?.overflowPx ?? 99) <= 2, m)
  rec(20, 'After grow-drop, operate height stayed larger', (m?.operate?.h || 0) > (before?.operate?.h || 0) + 15, { before: before?.operate, after: m?.operate })

  const tall = m
  const midShrink = await dragHandle(page, 'bottom', 0, -155)
  rec(21, 'Shrink drag starts', !!midShrink)
  rec(22, 'Shrinking the box updates operate height during the drag', (midShrink?.operate?.h || 9999) < (tall?.operate?.h || 0) - 15, { tall: tall?.operate, mid: midShrink?.operate })
  rec(23, 'Shrink-to-fit keeps glyphs inside the box while dragging', (midShrink?.overflowPx ?? 99) <= 4, midShrink)
  rec(24, 'Shrink-to-fit zoom drops below 1 when the box is shorter than the type', (midShrink?.zoom || 1) < 0.98, midShrink)
  rec(25, 'Title string survives shrink', /Houby/i.test(midShrink?.text || ''))

  m = await titleMetrics(page)
  rec(26, 'After shrink-drop, text still inside the box', (m?.overflowPx ?? 99) <= 2, m)
  rec(27, 'After shrink-drop, box is shorter than the grown size', (m?.operate?.h || 0) < (tall?.operate?.h || 0) - 10, { tall: tall?.operate, after: m?.operate })

  const midWide = await dragHandle(page, 'right', 90, 0)
  rec(28, 'Right-handle drag starts', !!midWide)
  rec(29, 'Widening updates operate width during the drag', (midWide?.operate?.w || 0) > (m?.operate?.w || 0) + 20, { before: m?.operate, mid: midWide?.operate })
  rec(30, 'Widening keeps text inside the box', (midWide?.overflowPx ?? 99) <= 3, midWide)

  const midNarrow = await dragHandle(page, 'right', -80, 0)
  rec(31, 'Narrowing drag starts', !!midNarrow)
  rec(32, 'Narrowing updates operate width during the drag', (midNarrow?.operate?.w || 9999) < (midWide?.operate?.w || 0) - 15, { wide: midWide?.operate, mid: midNarrow?.operate })
  rec(33, 'Narrowing keeps text inside the box (fit, not clip-through)', (midNarrow?.overflowPx ?? 99) <= 3, midNarrow)

  const tDrag = Date.now()
  await dragHandle(page, 'bottom', 0, 40)
  await dragHandle(page, 'bottom', 0, -30)
  await dragHandle(page, 'right', 40, 0)
  const burstMs = Date.now() - tDrag
  rec(34, 'Three successive live resizes finish under 2500ms', burstMs < 2500, { ms: burstMs })
  m = await titleMetrics(page)
  rec(35, 'After the burst, title is still selected and inked', /Houby/i.test(m?.text || ''), m)
  rec(36, 'After the burst, text is still inside the box', (m?.overflowPx ?? 99) <= 2, m)
  rec(37, 'Fit zoom is in (0.2, 1]', m?.zoom > 0.2 && m?.zoom <= 1.001, m)

  const left = await dragHandle(page, 'left', -40, 0)
  rec(38, 'Left-handle drag starts', !!left)
  rec(39, 'Left resize keeps text inside the box', (left?.overflowPx ?? 99) <= 3, left)

  rec(40, 'No leftover drag overlay after resizes', await page.locator('[data-slide-drag-overlay]').count() === 0)

  await dragHandle(page, 'bottom', 0, 50)
  await page.locator('[data-sortable-id]').first().click()
  await sleep(200)
  rec(41, 'Deselect removes operate chrome', ((await titleMetrics(page))?.operate?.h || 0) < 8, await titleMetrics(page))
  await clickTitle(page)
  m = await titleMetrics(page)
  rec(42, 'Reselect restores operate chrome', (m?.operate?.h || 0) > 20, m)
  rec(43, 'Reselect: text still inside the box', (m?.overflowPx ?? 99) <= 2, m)
  rec(44, 'Reselect: title text unchanged', /Houby/i.test(m?.text || ''))

  const corner = await page.evaluate(() => {
    const el = [...document.querySelectorAll('[class*=resize-handler]')].find(n => /right-bottom/.test(n.className))
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  rec(45, 'Corner handle exists for fixed-height box', !!corner)
  if (corner) {
    await page.mouse.move(corner.x, corner.y)
    await page.mouse.down()
    await page.mouse.move(corner.x + 30, corner.y + 30, { steps: 10 })
    const midCorner = await titleMetrics(page)
    rec(46, 'Corner drag keeps text inside the box', (midCorner?.overflowPx ?? 99) <= 3, midCorner)
    await page.mouse.up()
    await sleep(120)
  }
  else {
    rec(46, 'Corner drag keeps text inside the box', false)
  }

  m = await titleMetrics(page)
  rec(47, 'Final operate box is still a real rectangle', (m?.operate?.w || 0) > 40 && (m?.operate?.h || 0) > 20, m)
  rec(48, 'Final title still reads Houby', /Houby/i.test(m?.text || ''))
  rec(49, 'Final text does not cut through the selection box', (m?.overflowPx ?? 99) <= 2, m)
  rec(50, 'Fit host is still mounted after the session', await page.locator('[data-text-fit-host]').count() > 0)
}

function printTable() {
  const pad = (s, n) => String(s).padEnd(n)
  console.log(`${pad('#', 4)}${pad('result', 8)}${pad('case', 62)}measured`)
  console.log('-'.repeat(96))
  for (const row of results) {
    const measured = row.measured ? JSON.stringify(row.measured) : ''
    console.log(`${pad(row.id, 4)}${pad(row.pass ? 'PASS' : 'FAIL', 8)}${pad(row.name, 62)}${measured}`)
  }
  const failed = results.filter(r => !r.pass)
  console.log('-'.repeat(96))
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
  if (failed.length || results.length !== 50) {
    console.error(failed.length ? `${failed.length} cases failed` : `expected 50 cases, got ${results.length}`)
    process.exitCode = 1
  }
  else console.log('houby-fixed-fit e2e passed (50 cases)')
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
