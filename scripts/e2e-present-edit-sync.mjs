/**
 * Real-browser: presentation mode must paint the same authored text,
 * contrast polarity, and slide surfaces as the live editor.
 *
 *   node scripts/e2e-present-edit-sync.mjs
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
  [3, 'Typing a subtitle keeps the text on the live box'],
  [4, 'Deselect shows the Design tab'],
  [5, 'Design panel lists preset themes'],
  [6, 'Applying Dusk selects the Dusk theme card'],
  [7, 'Dusk edit title is light ink, not black'],
  [8, 'Dusk edit subtitle is light ink, not black'],
  [9, 'Dusk edit title and subtitle share light polarity'],
  [10, 'Dusk edit slide surface is not flat white'],
  [11, 'Present control is on the header'],
  [12, 'Entering present mounts the screen overlay'],
  [13, 'Present Dusk title text matches the editor'],
  [14, 'Present Dusk subtitle text matches the editor'],
  [15, 'Present Dusk title is light ink, not black'],
  [16, 'Present Dusk subtitle is light ink, not black'],
  [17, 'Present Dusk title polarity matches the editor'],
  [18, 'Present Dusk subtitle polarity matches the editor'],
  [19, 'Present Dusk title luminance stays close to the editor'],
  [20, 'Present Dusk slide surface is not flat white'],
  [21, 'Present mode hides editor operate chrome'],
  [22, 'Escape exits presentation mode'],
  [23, 'After exit, Dusk title is still light in the editor'],
  [24, 'Clearing Dusk restores the default light theme'],
  [25, 'Default edit title is dark ink'],
  [26, 'Default present title is dark ink'],
  [27, 'Default present title polarity matches the editor'],
  [28, 'Default present title text still matches'],
  [29, 'Escape exits the default-theme presentation'],
  [30, 'Applying Ink selects the Ink theme card'],
  [31, 'Ink edit title is light ink'],
  [32, 'Ink present title is light ink, not black'],
  [33, 'Ink present title polarity matches the editor'],
  [34, 'Ink present title luminance stays close to the editor'],
  [35, 'Escape exits Ink presentation'],
  [36, 'Add slide creates a content slide'],
  [37, 'Content body types into the live box'],
  [38, 'Re-applying Dusk keeps the content body light in the editor'],
  [39, 'Present from the content slide shows the body text'],
  [40, 'Present content body is light ink, not black'],
  [41, 'Present content body polarity matches the editor'],
  [42, 'ArrowLeft in present returns to the cover'],
  [43, 'Cover title is still light after present navigation'],
  [44, 'Cover title text survives present navigation'],
  [45, 'Escape returns to the editor on the cover'],
  [46, 'Empty content slide shows editor placeholders before present'],
  [47, 'Empty present slide does not paint Click-to-add prompts'],
  [48, 'Re-entering present on Dusk cover keeps light title ink'],
  [49, 'Re-entered present title still matches editor text'],
  [50, 'Re-entered present title polarity still matches the editor'],
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

async function clickBox(page, i) {
  const box = page.locator('[class*=viewport-wrapper] [data-live-box]').nth(i)
  const r = await box.boundingBox()
  if (!r) throw new Error(`live box ${i} has no bounding box`)
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2)
  await sleep(120)
}

async function typeInto(page, i, text) {
  await clickBox(page, i)
  await page.keyboard.type(text, { delay: 12 })
  await sleep(150)
}

async function deselect(page) {
  const vp = page.locator('[class*=viewport-wrapper]')
  const box = await vp.boundingBox()
  if (box) await page.mouse.click(box.x + 16, box.y + box.height - 16)
  await sleep(150)
}

async function openDesign(page) {
  await deselect(page)
  const tab = page.getByText('Design', { exact: true }).first()
  await tab.click({ timeout: 8000 })
  await page.locator('[data-theme-id]').first().waitFor({ timeout: 8000 })
  await sleep(120)
}

async function applyTheme(page, id) {
  await openDesign(page)
  const card = page.locator(`[data-theme-id="${id}"]`)
  await card.click({ timeout: 8000 })
  await sleep(400)
  return card.getAttribute('class')
}

async function enterPresent(page) {
  const btn = page.locator('[data-editor-tool=present]')
  await btn.hover()
  await sleep(200)
  await btn.click()
  await page.locator('[data-fika-screen]').waitFor({ state: 'visible', timeout: 15000 })
  await sleep(250)
}

async function exitPresent(page) {
  await page.keyboard.press('Escape')
  await page.locator('[data-fika-screen]').waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {})
  await sleep(200)
}

const snapshotScript = (scope) => {
  const parseRgb = (color) => {
    const m = String(color || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
    if (!m) return { r: 0, g: 0, b: 0, lum: 0, light: false, raw: String(color || '') }
    const r = +m[1]
    const g = +m[2]
    const b = +m[3]
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    return { r, g, b, lum, light: lum >= 150, raw: color }
  }
  const boxInk = (box) => {
    if (!box) return null
    const host = box.querySelector('.ProseMirror, [class*=ProseMirror]') || box
    const painted = host.querySelector('span, p, li, h1, h2, h3') || host
    return {
      text: (box.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
      ink: parseRgb(getComputedStyle(painted).color),
      hostInk: parseRgb(getComputedStyle(box).color),
      placeholder: /show-placeholder/.test(box.className) || /Click to add/i.test(box.textContent || ''),
    }
  }
  const root = scope === 'screen'
    ? document.querySelector('[data-fika-screen] [data-screen-current]') || document.querySelector('[data-fika-screen]')
    : document.querySelector('[class*=viewport-wrapper]')
  const boxes = [...(root?.querySelectorAll('[data-live-box]') || [])].map(boxInk)
  const bgEl = root?.querySelector('[class*=background]') || root
  const bg = bgEl ? getComputedStyle(bgEl) : null
  const bgColor = bg ? parseRgb(bg.backgroundColor) : null
  return {
    boxes,
    title: boxes[0] || null,
    subtitle: boxes[1] || null,
    body: boxes[1] || boxes[0] || null,
    texts: boxes.map(b => b?.text || ''),
    prompt: boxes.some(b => b?.placeholder),
    bgImage: bg?.backgroundImage || '',
    bgColor,
    operate: !!root?.querySelector('[id^=operate-element-]'),
    screen: !!document.querySelector('[data-fika-screen]'),
  }
}

async function snapEdit(page) {
  return page.evaluate(snapshotScript, 'edit')
}

async function snapScreen(page) {
  return page.evaluate(snapshotScript, 'screen')
}

function polarityMatch(a, b) {
  if (!a?.ink || !b?.ink) return false
  return a.ink.light === b.ink.light
}

function lumClose(a, b, delta = 55) {
  if (!a?.ink || !b?.ink) return false
  return Math.abs(a.ink.lum - b.ink.lum) <= delta
}

function isLight(box) {
  return !!box?.ink?.light && box.ink.lum >= 150
}

function isDark(box) {
  return !!box && !box.ink.light && box.ink.lum <= 110
}

function notBlack(box) {
  return !!box && box.ink.lum >= 150
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
  page.on('dialog', dialog => dialog.dismiss().catch(() => {}))
  await page.goto(DEV_URL, { waitUntil: 'networkidle' })
  await page.getByText('Add slide').waitFor({ timeout: 90000 })
  await stripScan(page)

  rec(1, 'Cover title box is on the canvas', await page.locator('[class*=viewport-wrapper] [data-live-box]').count() >= 1)

  await typeInto(page, 0, 'Jak se mas')
  let edit = await snapEdit(page)
  rec(2, 'Typing a title keeps the text on the live box', /Jak se mas/.test(edit.title?.text || ''), edit.title)

  await typeInto(page, 1, 'PresentSub')
  edit = await snapEdit(page)
  rec(3, 'Typing a subtitle keeps the text on the live box', /PresentSub/.test(edit.subtitle?.text || ''), edit.subtitle)

  await openDesign(page)
  rec(4, 'Deselect shows the Design tab', await page.getByText('Design', { exact: true }).count() > 0)
  rec(5, 'Design panel lists preset themes', await page.locator('[data-theme-id]').count() >= 6)

  await applyTheme(page, 'dusk')
  const duskSelected = await page.locator('[data-theme-id=dusk]').getAttribute('class')
  rec(6, 'Applying Dusk selects the Dusk theme card', /selected/.test(duskSelected || ''), { duskSelected })
  const duskEdit = await snapEdit(page)
  rec(7, 'Dusk edit title is light ink, not black', isLight(duskEdit.title), duskEdit.title?.ink)
  rec(8, 'Dusk edit subtitle is light ink, not black', isLight(duskEdit.subtitle), duskEdit.subtitle?.ink)
  rec(9, 'Dusk edit title and subtitle share light polarity', polarityMatch(duskEdit.title, duskEdit.subtitle), {
    title: duskEdit.title?.ink,
    subtitle: duskEdit.subtitle?.ink,
  })
  rec(10, 'Dusk edit slide surface is not flat white', /gradient|rgb\(/.test(duskEdit.bgImage) || (duskEdit.bgColor && duskEdit.bgColor.lum < 230), {
    bgImage: duskEdit.bgImage.slice(0, 80),
    bgColor: duskEdit.bgColor,
  })

  rec(11, 'Present control is on the header', await page.locator('[data-editor-tool=present]').count() === 1)
  await enterPresent(page)
  rec(12, 'Entering present mounts the screen overlay', await page.locator('[data-fika-screen]').count() === 1)
  const duskScreen = await snapScreen(page)
  rec(13, 'Present Dusk title text matches the editor', /Jak se mas/.test(duskScreen.title?.text || ''), duskScreen.title)
  rec(14, 'Present Dusk subtitle text matches the editor', /PresentSub/.test(duskScreen.subtitle?.text || ''), duskScreen.subtitle)
  rec(15, 'Present Dusk title is light ink, not black', notBlack(duskScreen.title), duskScreen.title?.ink)
  rec(16, 'Present Dusk subtitle is light ink, not black', notBlack(duskScreen.subtitle), duskScreen.subtitle?.ink)
  rec(17, 'Present Dusk title polarity matches the editor', polarityMatch(duskEdit.title, duskScreen.title), {
    edit: duskEdit.title?.ink,
    screen: duskScreen.title?.ink,
  })
  rec(18, 'Present Dusk subtitle polarity matches the editor', polarityMatch(duskEdit.subtitle, duskScreen.subtitle), {
    edit: duskEdit.subtitle?.ink,
    screen: duskScreen.subtitle?.ink,
  })
  rec(19, 'Present Dusk title luminance stays close to the editor', lumClose(duskEdit.title, duskScreen.title), {
    edit: duskEdit.title?.ink?.lum,
    screen: duskScreen.title?.ink?.lum,
  })
  rec(20, 'Present Dusk slide surface is not flat white', /gradient|rgb\(/.test(duskScreen.bgImage) || (duskScreen.bgColor && duskScreen.bgColor.lum < 230), {
    bgImage: duskScreen.bgImage.slice(0, 80),
    bgColor: duskScreen.bgColor,
  })
  rec(21, 'Present mode hides editor operate chrome', duskScreen.operate === false, { operate: duskScreen.operate })

  await exitPresent(page)
  rec(22, 'Escape exits presentation mode', await page.locator('[data-fika-screen]').count() === 0)
  edit = await snapEdit(page)
  rec(23, 'After exit, Dusk title is still light in the editor', isLight(edit.title) && /Jak se mas/.test(edit.title?.text || ''), edit.title?.ink)

  await openDesign(page)
  await page.locator('[data-theme-id=dusk]').click()
  await sleep(400)
  const duskCleared = await page.locator('[data-theme-id=dusk]').getAttribute('class')
  rec(24, 'Clearing Dusk restores the default light theme', !/selected/.test(duskCleared || ''), { duskCleared })
  const paperEdit = await snapEdit(page)
  rec(25, 'Default edit title is dark ink', isDark(paperEdit.title), paperEdit.title?.ink)
  await enterPresent(page)
  const paperScreen = await snapScreen(page)
  rec(26, 'Default present title is dark ink', isDark(paperScreen.title), paperScreen.title?.ink)
  rec(27, 'Default present title polarity matches the editor', polarityMatch(paperEdit.title, paperScreen.title), {
    edit: paperEdit.title?.ink,
    screen: paperScreen.title?.ink,
  })
  rec(28, 'Default present title text still matches', /Jak se mas/.test(paperScreen.title?.text || ''), paperScreen.title)
  await exitPresent(page)
  rec(29, 'Escape exits the default-theme presentation', await page.locator('[data-fika-screen]').count() === 0)

  await applyTheme(page, 'ink')
  const inkSelected = await page.locator('[data-theme-id=ink]').getAttribute('class')
  rec(30, 'Applying Ink selects the Ink theme card', /selected/.test(inkSelected || ''), { inkSelected })
  const inkEdit = await snapEdit(page)
  rec(31, 'Ink edit title is light ink', isLight(inkEdit.title), inkEdit.title?.ink)
  await enterPresent(page)
  const inkScreen = await snapScreen(page)
  rec(32, 'Ink present title is light ink, not black', notBlack(inkScreen.title), inkScreen.title?.ink)
  rec(33, 'Ink present title polarity matches the editor', polarityMatch(inkEdit.title, inkScreen.title), {
    edit: inkEdit.title?.ink,
    screen: inkScreen.title?.ink,
  })
  rec(34, 'Ink present title luminance stays close to the editor', lumClose(inkEdit.title, inkScreen.title), {
    edit: inkEdit.title?.ink?.lum,
    screen: inkScreen.title?.ink?.lum,
  })
  await exitPresent(page)
  rec(35, 'Escape exits Ink presentation', await page.locator('[data-fika-screen]').count() === 0)

  await page.getByText('Add slide', { exact: false }).first().click()
  await sleep(250)
  rec(36, 'Add slide creates a content slide', await page.locator('[class*=thumbnail-slide]').count() >= 2)
  await typeInto(page, 1, 'PresentBody')
  edit = await snapEdit(page)
  rec(37, 'Content body types into the live box', /PresentBody/.test(edit.body?.text || edit.texts.join(' ')), edit.texts)

  await applyTheme(page, 'dusk')
  const bodyEdit = await snapEdit(page)
  rec(38, 'Re-applying Dusk keeps the content body light in the editor', isLight(bodyEdit.body) && /PresentBody/.test(bodyEdit.texts.join(' ')), bodyEdit.body?.ink)
  await enterPresent(page)
  const bodyScreen = await snapScreen(page)
  rec(39, 'Present from the content slide shows the body text', /PresentBody/.test(bodyScreen.texts.join(' ')), bodyScreen.texts)
  rec(40, 'Present content body is light ink, not black', bodyScreen.boxes.some(b => /PresentBody/.test(b?.text || '') && notBlack(b)), bodyScreen.boxes.map(b => ({ text: b?.text, ink: b?.ink })))
  const bodyEditBox = bodyEdit.boxes.find(b => /PresentBody/.test(b?.text || ''))
  const bodyScreenBox = bodyScreen.boxes.find(b => /PresentBody/.test(b?.text || ''))
  rec(41, 'Present content body polarity matches the editor', polarityMatch(bodyEditBox, bodyScreenBox), {
    edit: bodyEditBox?.ink,
    screen: bodyScreenBox?.ink,
  })

  await page.keyboard.press('ArrowLeft')
  await sleep(350)
  const coverScreen = await snapScreen(page)
  rec(42, 'ArrowLeft in present returns to the cover', /Jak se mas/.test(coverScreen.title?.text || coverScreen.texts.join(' ')), coverScreen.texts)
  rec(43, 'Cover title is still light after present navigation', notBlack(coverScreen.title || coverScreen.boxes.find(b => /Jak se mas/.test(b?.text || ''))), coverScreen.title?.ink)
  rec(44, 'Cover title text survives present navigation', /Jak se mas/.test(coverScreen.texts.join(' ')), coverScreen.texts)
  await exitPresent(page)
  rec(45, 'Escape returns to the editor on the cover', await page.locator('[data-fika-screen]').count() === 0 && /Jak se mas|PresentBody/.test((await snapEdit(page)).texts.join(' ')))

  await page.getByText('Add slide', { exact: false }).first().click()
  await sleep(250)
  await deselect(page)
  const emptyEdit = await snapEdit(page)
  rec(46, 'Empty content slide shows editor placeholders before present', emptyEdit.prompt === true, { editPrompt: emptyEdit.prompt, texts: emptyEdit.texts })
  await enterPresent(page)
  const emptyScreen = await snapScreen(page)
  rec(47, 'Empty present slide does not paint Click-to-add prompts', emptyScreen.prompt === false && !/Click to add/i.test(emptyScreen.texts.join(' ')), emptyScreen.texts)
  await exitPresent(page)

  const coverThumb = page.locator('[class*=thumbnail-slide]').first()
  const coverBox = await coverThumb.boundingBox()
  if (coverBox) await page.mouse.click(coverBox.x + coverBox.width / 2, coverBox.y + 18)
  await sleep(200)
  const duskAgain = await snapEdit(page)
  await enterPresent(page)
  const duskAgainScreen = await snapScreen(page)
  rec(48, 'Re-entering present on Dusk cover keeps light title ink', notBlack(duskAgainScreen.title), duskAgainScreen.title?.ink)
  rec(49, 'Re-entered present title still matches editor text', /Jak se mas/.test(duskAgainScreen.title?.text || '') && /Jak se mas/.test(duskAgain.title?.text || ''), {
    edit: duskAgain.title?.text,
    screen: duskAgainScreen.title?.text,
  })
  rec(50, 'Re-entered present title polarity still matches the editor', polarityMatch(duskAgain.title, duskAgainScreen.title), {
    edit: duskAgain.title?.ink,
    screen: duskAgainScreen.title?.ink,
  })
  await exitPresent(page)

  const failed = results.filter(p => !p.pass)
  const width = 62
  console.log('#   result  case'.padEnd(width + 12) + 'measured')
  console.log('-'.repeat(110))
  for (const [id, name] of CASES) {
    const proof = results.find(p => p.id === id)
    if (!proof) throw new Error(`missing proof ${id} ${name}`)
    const mark = proof.pass ? 'PASS' : 'FAIL'
    console.log(`${String(id).padEnd(4)}${mark.padEnd(8)}${name.padEnd(width)}${proof.measured ? JSON.stringify(proof.measured) : ''}`)
  }
  if (results.length !== CASES.length) throw new Error(`expected ${CASES.length} proofs, got ${results.length}`)
  if (failed.length) throw new Error(`${failed.length} present-edit-sync proofs failed: ${failed.map(p => p.id).join(', ')}`)
  console.log('-'.repeat(110))
  console.log('present-edit-sync e2e passed (50 cases)')
  await page.close()
}
finally {
  await browser.close()
  if (child) child.kill()
}
