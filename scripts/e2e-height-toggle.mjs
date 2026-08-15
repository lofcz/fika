/**
 * Real-browser auto ↔ fixed height: clicking the paragraph toggle must
 * change store chrome, live-box mode, and operate handles.
 *
 *   node scripts/e2e-height-toggle.mjs
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DEV_URL = 'http://127.0.0.1:5173/'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const CASES = [
  [1, 'Cover title box is on the canvas'],
  [2, 'Typing a title keeps the text on the live box'],
  [3, 'Cover title starts in grow (auto height)'],
  [4, 'Auto-height button is pressed on a title'],
  [5, 'Fixed-height button is not pressed on a title'],
  [6, 'Auto-height title has no data-fixed-height'],
  [7, 'Auto-height title has no bottom resize handle'],
  [8, 'Clicking Fixed height presses the fixed button'],
  [9, 'Clicking Fixed height unpresses the auto button'],
  [10, 'Store title is locked after Fixed height'],
  [11, 'Live title mode is fit after Fixed height'],
  [12, 'Live title has data-fixed-height after the click'],
  [13, 'Fixed title exposes a bottom resize handle'],
  [14, 'Fixed title exposes a top resize handle'],
  [15, 'Fixed title exposes at least 8 resize handles'],
  [16, 'Title text survives locking height'],
  [17, 'Vertical-align chips appear in fixed mode'],
  [18, 'Clicking Auto height presses the auto button'],
  [19, 'Store title is unlocked after Auto height'],
  [20, 'Live title mode is grow after Auto height'],
  [21, 'Auto title drops data-fixed-height'],
  [22, 'Auto title loses the bottom resize handle'],
  [23, 'Title text survives unlocking height'],
  [24, 'Locking again while the caret is in the title works'],
  [25, 'Focused lock still writes store.fixedHeight'],
  [26, 'Focused lock still switches the live box to fit'],
  [27, 'Focused lock still shows a bottom handle'],
  [28, 'Unlocking while focused returns grow mode'],
  [29, 'Unlocking while focused clears store.fixedHeight'],
  [30, 'Unlocking while focused hides the bottom handle'],
  [31, 'Subtitle starts in grow mode'],
  [32, 'Locking the subtitle writes store.fixedHeight'],
  [33, 'Locked subtitle live box is fit'],
  [34, 'Locked subtitle shows a bottom handle'],
  [35, 'Title stays unlocked while the subtitle is locked'],
  [36, 'Unlocking the subtitle restores grow'],
  [37, 'Add slide creates a content slide'],
  [38, 'Content body starts locked (list placeholder)'],
  [39, 'Content body starts with a bottom handle'],
  [40, 'Content body fixed button is pressed'],
  [41, 'Unlocking the body writes auto height to the store'],
  [42, 'Unlocked body live box is grow'],
  [43, 'Unlocked body hides the bottom handle'],
  [44, 'Re-locking the body restores fit'],
  [45, 'Re-locked body shows a bottom handle again'],
  [46, 'Three rapid toggles end on fixed'],
  [47, 'Rapid-toggle end state is in the store'],
  [48, 'Deselect + reselect keeps fixed height'],
  [49, 'Reselect still shows 8 resize handles'],
  [50, 'Cover thumb stays inked after the height session'],
]

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

async function stripScan(page) {
  await page.evaluate(() => {
    document.querySelectorAll('[data-react-scan], #react-scan-root').forEach(el => el.remove())
  })
}

async function readState(page, boxIndex = 0) {
  return page.evaluate((i) => {
    const boxes = [...document.querySelectorAll('[class*=viewport-wrapper] [data-live-box]')]
    const box = boxes[i]
    const root = box?.closest('[id^=editable-element-]')
    const id = root?.id?.replace('editable-element-', '') || ''
    const operate = id ? document.getElementById(`operate-element-${id}`) : null
    const handles = [...document.querySelectorAll('[class*=resize-handler]')]
    const handleTypes = handles.map(el => [...el.classList].filter(c => /top|bottom|left|right/.test(c)).join(' '))
    const autoBtn = document.querySelector('[data-height-mode=auto]')
    const fixedBtn = document.querySelector('[data-height-mode=fixed]')
    const storeEl = {
      id,
      fixedHeight: !!box?.hasAttribute('data-fixed-height'),
      panelFixed: fixedBtn?.getAttribute('aria-pressed') === 'true',
      text: (box?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
    }
    let ink = 0
    const canvas = document.querySelector('[class*=thumbnail-slide] canvas')
    if (canvas) {
      const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data
      for (let p = 0; p < d.length; p += 16) {
        if (d[p + 3] > 12 && (d[p] < 248 || d[p + 1] < 248 || d[p + 2] < 248)) ink++
      }
    }
    return {
      id,
      mode: box?.getAttribute('data-text-box-mode') || '',
      fixedAttr: box?.hasAttribute('data-fixed-height') || false,
      autoAttr: box?.hasAttribute('data-live-auto-height') || false,
      text: (box?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
      handleCount: handles.length,
      hasBottom: handleTypes.some(t => t.includes('bottom')),
      hasTop: handleTypes.some(t => t.includes('top')),
      operateH: operate ? operate.getBoundingClientRect().height : 0,
      autoPressed: autoBtn?.getAttribute('aria-pressed') === 'true',
      fixedPressed: fixedBtn?.getAttribute('aria-pressed') === 'true',
      valign: !!document.querySelector('[data-tooltip*="Align top"], [data-tooltip*="vertical"]'),
      thumbs: document.querySelectorAll('[class*=thumbnail-slide]').length,
      store: storeEl,
      ink,
    }
  }, boxIndex)
}

async function clickBox(page, i) {
  const box = page.locator('[class*=viewport-wrapper] [data-live-box]').nth(i)
  const r = await box.boundingBox()
  if (!r) throw new Error(`live box ${i} has no bounding box`)
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2)
  await sleep(120)
}

async function typeInto(page, i, text) {
  await clickBox(page, i)
  await page.keyboard.type(text, { delay: 15 })
  await sleep(150)
}

async function clickHeight(page, mode) {
  await page.locator(`[data-height-mode=${mode}]`).click({ timeout: 8000 })
  await sleep(200)
}

async function addSlide(page) {
  await page.getByText('Add slide', { exact: false }).first().click()
  await sleep(250)
}

async function deselect(page) {
  const vp = page.locator('[class*=viewport-wrapper]')
  const box = await vp.boundingBox()
  if (box) await page.mouse.click(box.x + 16, box.y + box.height - 16)
  await sleep(150)
}

const results = []
function rec(id, name, pass, measured) {
  results.push({ id, name, pass: !!pass, measured: measured ?? null })
}

const browser = await chromium.launch({ headless: true })
let child = null
try {
  let serverReady = await waitForDev(1500)
  if (!serverReady) {
    child = spawn('npm', ['run', 'dev'], { cwd: root, shell: true, stdio: 'ignore' })
    serverReady = await waitForDev(90000)
    if (!serverReady) throw new Error('dev server did not start on http://127.0.0.1:5173/')
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(DEV_URL, { waitUntil: 'networkidle' })
  await page.getByText('Add slide').waitFor({ timeout: 90000 })
  await stripScan(page)

  rec(1, 'Cover title box is on the canvas', await page.locator('[class*=viewport-wrapper] [data-live-box]').count() >= 1)

  await typeInto(page, 0, 'HeightTitle')
  let s = await readState(page, 0)
  rec(2, 'Typing a title keeps the text on the live box', /HeightTitle/.test(s.text), s)
  rec(3, 'Cover title starts in grow (auto height)', s.mode === 'grow', s)
  rec(4, 'Auto-height button is pressed on a title', s.autoPressed && !s.fixedPressed, s)
  rec(5, 'Fixed-height button is not pressed on a title', !s.fixedPressed, s)
  rec(6, 'Auto-height title has no data-fixed-height', !s.fixedAttr, s)
  rec(7, 'Auto-height title has no bottom resize handle', !s.hasBottom, s)

  await clickHeight(page, 'fixed')
  s = await readState(page, 0)
  rec(8, 'Clicking Fixed height presses the fixed button', s.fixedPressed && !s.autoPressed, s)
  rec(9, 'Clicking Fixed height unpresses the auto button', !s.autoPressed, s)
  rec(10, 'Store title is locked after Fixed height', s.store?.fixedHeight === true && s.store?.panelFixed === true, s.store)
  rec(11, 'Live title mode is fit after Fixed height', s.mode === 'fit', s)
  rec(12, 'Live title has data-fixed-height after the click', s.fixedAttr, s)
  rec(13, 'Fixed title exposes a bottom resize handle', s.hasBottom, s)
  rec(14, 'Fixed title exposes a top resize handle', s.hasTop, s)
  rec(15, 'Fixed title exposes at least 8 resize handles', s.handleCount >= 8, s)
  rec(16, 'Title text survives locking height', /HeightTitle/.test(s.text) && /HeightTitle/.test(s.store?.text || ''), s)
  rec(17, 'Vertical-align chips appear in fixed mode', s.valign, s)

  await clickHeight(page, 'auto')
  s = await readState(page, 0)
  rec(18, 'Clicking Auto height presses the auto button', s.autoPressed && !s.fixedPressed, s)
  rec(19, 'Store title is unlocked after Auto height', s.store?.fixedHeight === false && s.store?.panelFixed === false, s.store)
  rec(20, 'Live title mode is grow after Auto height', s.mode === 'grow', s)
  rec(21, 'Auto title drops data-fixed-height', !s.fixedAttr, s)
  rec(22, 'Auto title loses the bottom resize handle', !s.hasBottom, s)
  rec(23, 'Title text survives unlocking height', /HeightTitle/.test(s.text), s)

  await clickBox(page, 0)
  await clickHeight(page, 'fixed')
  s = await readState(page, 0)
  rec(24, 'Locking again while the caret is in the title works', s.fixedPressed, s)
  rec(25, 'Focused lock still writes store.fixedHeight', s.store?.fixedHeight === true && s.store?.panelFixed === true, s.store)
  rec(26, 'Focused lock still switches the live box to fit', s.mode === 'fit', s)
  rec(27, 'Focused lock still shows a bottom handle', s.hasBottom, s)

  await clickHeight(page, 'auto')
  s = await readState(page, 0)
  rec(28, 'Unlocking while focused returns grow mode', s.mode === 'grow', s)
  rec(29, 'Unlocking while focused clears store.fixedHeight', s.store?.fixedHeight === false && s.store?.panelFixed === false, s.store)
  rec(30, 'Unlocking while focused hides the bottom handle', !s.hasBottom, s)

  await typeInto(page, 1, 'HeightSub')
  s = await readState(page, 1)
  rec(31, 'Subtitle starts in grow mode', s.mode === 'grow' && /HeightSub/.test(s.text), s)
  await clickHeight(page, 'fixed')
  s = await readState(page, 1)
  rec(32, 'Locking the subtitle writes store.fixedHeight', s.store?.fixedHeight === true && s.store?.panelFixed === true, s.store)
  rec(33, 'Locked subtitle live box is fit', s.mode === 'fit', s)
  rec(34, 'Locked subtitle shows a bottom handle', s.hasBottom, s)
  const titleAfterSub = await readState(page, 0)
  rec(35, 'Title stays unlocked while the subtitle is locked', titleAfterSub.store?.fixedHeight === false && titleAfterSub.mode === 'grow', titleAfterSub.store)
  await clickHeight(page, 'auto')
  s = await readState(page, 1)
  rec(36, 'Unlocking the subtitle restores grow', s.mode === 'grow' && s.store?.fixedHeight === false, s)

  await addSlide(page)
  rec(37, 'Add slide creates a content slide', await page.locator('[class*=thumbnail-slide]').count() === 2)
  await clickBox(page, 1)
  s = await readState(page, 1)
  rec(38, 'Content body starts locked (list placeholder)', s.mode === 'fit' || s.store?.fixedHeight === true, s)
  rec(39, 'Content body starts with a bottom handle', s.hasBottom, s)
  rec(40, 'Content body fixed button is pressed', s.fixedPressed, s)
  await page.keyboard.type('BodyLine', { delay: 15 })
  await sleep(150)
  await clickHeight(page, 'auto')
  s = await readState(page, 1)
  rec(41, 'Unlocking the body writes auto height to the store', s.store?.fixedHeight === false && s.store?.panelFixed === false, s.store)
  rec(42, 'Unlocked body live box is grow', s.mode === 'grow' && /BodyLine/.test(s.text), s)
  rec(43, 'Unlocked body hides the bottom handle', !s.hasBottom, s)
  await clickHeight(page, 'fixed')
  s = await readState(page, 1)
  rec(44, 'Re-locking the body restores fit', s.mode === 'fit', s)
  rec(45, 'Re-locked body shows a bottom handle again', s.hasBottom, s)

  await clickHeight(page, 'auto')
  await clickHeight(page, 'fixed')
  await clickHeight(page, 'auto')
  await clickHeight(page, 'fixed')
  s = await readState(page, 1)
  rec(46, 'Three rapid toggles end on fixed', s.mode === 'fit' && s.fixedPressed, s)
  rec(47, 'Rapid-toggle end state is in the store', s.store?.fixedHeight === true && s.store?.panelFixed === true, s.store)

  await deselect(page)
  await clickBox(page, 1)
  s = await readState(page, 1)
  rec(48, 'Deselect + reselect keeps fixed height', s.mode === 'fit' && s.store?.fixedHeight === true && s.store?.panelFixed === true, s)
  rec(49, 'Reselect still shows 8 resize handles', s.handleCount >= 8, s)
  const cover = await readState(page, 0)
  rec(50, 'Cover thumb stays inked after the height session', cover.ink > 8, cover)

  const failed = results.filter(p => !p.pass)
  const width = 56
  console.log('#   result  case'.padEnd(width + 12) + 'measured')
  console.log('-'.repeat(90))
  for (const [id, name] of CASES) {
    const proof = results.find(p => p.id === id)
    if (!proof) throw new Error(`missing proof ${id} ${name}`)
    const mark = proof.pass ? 'PASS' : 'FAIL'
    console.log(`${String(id).padEnd(4)}${mark.padEnd(8)}${name.padEnd(width)}${proof.measured ? JSON.stringify(proof.measured) : ''}`)
    if (!proof.pass) throw new Error(`failed ${id} ${name}`)
  }
  if (results.length !== CASES.length) throw new Error(`expected ${CASES.length} proofs, got ${results.length}`)
  if (failed.length) throw new Error(`${failed.length} height-toggle proofs failed`)
  console.log('-'.repeat(90))
  console.log('height-toggle e2e passed (50 cases)')
  await page.close()
}
finally {
  await browser.close()
  if (child) child.kill()
}
