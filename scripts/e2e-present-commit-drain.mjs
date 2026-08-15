/**
 * Real-browser: starting presentation must drain the commit queue.
 * Type into a focused box, click Present without blurring first, exit —
 * the uncommitted text must still be there.
 *
 *   node scripts/e2e-present-commit-drain.mjs
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
  [2, 'Typing a title keeps the caret in the live box'],
  [3, 'Focused title is still uncommitted in the local canvas list'],
  [4, 'Present control is on the header'],
  [5, 'Clicking Present while focused mounts the screen overlay'],
  [6, 'Present shows the focused uncommitted title'],
  [7, 'Escape exits presentation mode'],
  [8, 'Title text survives present after a focused Present click'],
  [9, 'Store still has the title after exit'],
  [10, 'Title placeholder does not return after exit'],
  [11, 'Typing a subtitle keeps the subtitle focused'],
  [12, 'Present while the subtitle is focused shows the subtitle'],
  [13, 'Subtitle survives exit after a focused Present click'],
  [14, 'Title still present after the subtitle present cycle'],
  [15, 'Rapid type then immediate Present still shows the new words'],
  [16, 'Rapid-present text survives exit'],
  [17, 'Emoji typed while focused appears in presentation'],
  [18, 'Emoji survives exit'],
  [19, 'Add slide creates a content slide'],
  [20, 'Content body types into the live box while focused'],
  [21, 'Present from the focused body shows the body text'],
  [22, 'Body text survives exit'],
  [23, 'Re-entering present from the cover still shows the title'],
  [24, 'Second present/exit cycle keeps the title in the editor'],
  [25, 'F5 from a focused title starts presentation with the text'],
  [26, 'Title survives an F5 present/exit cycle'],
  [27, 'Shift+F5 from a focused subtitle starts presentation with the subtitle'],
  [28, 'Subtitle survives a Shift+F5 present/exit cycle'],
  [29, 'Thumbnail still paints the authored title after drain'],
  [30, 'Drawn text box text survives a focused Present click'],
  [31, 'Table cell draft is drained into presentation'],
  [32, 'Table cell text survives exit'],
  [33, 'Cell fill can be changed while the cell stays edited'],
  [34, 'Typed cell text stays in the live editor after a fill change'],
  [35, 'Present while the filled cell is still edited shows the text'],
  [36, 'Filled cell text survives exit in the store'],
  [37, 'Re-editing the same filled cell keeps the text'],
  [38, 'Store still has the filled cell text after re-edit'],
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
  await sleep(80)
}

async function typeFocused(page, i, text) {
  await clickBox(page, i)
  await page.keyboard.press('End')
  await page.keyboard.type(text, { delay: 8 })
}

async function enterPresent(page) {
  const btn = page.locator('[data-editor-tool=present]')
  await btn.click()
  await page.locator('[data-fika-screen]:not([data-fika-screen-shell]) [data-live-box]').first().waitFor({
    state: 'attached',
    timeout: 20000,
  })
  await sleep(200)
}

async function exitPresent(page) {
  await page.keyboard.press('Escape')
  const screen = page.locator('[data-fika-screen]')
  const gone = await screen.first().waitFor({ state: 'detached', timeout: 2500 }).then(() => true).catch(() => false)
  if (!gone) {
    await page.evaluate(() => window.__FIKA_SCREEN__?.getState().setScreening(false))
    await screen.first().waitFor({ state: 'detached', timeout: 8000 }).catch(() => {})
  }
  await sleep(200)
}

const snapshotScript = (scope) => {
  const root = scope === 'screen'
    ? document.querySelector('[data-fika-screen]:not([data-fika-screen-shell]) [data-screen-current]')
      || document.querySelector('[data-fika-screen]:not([data-fika-screen-shell])')
    : document.querySelector('[class*=viewport-wrapper]')
  const boxes = [...(root?.querySelectorAll('[data-live-box]') || [])].map(box => ({
    text: (box.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    placeholder: /show-placeholder/.test(box.className) || /Click to add/i.test(box.textContent || ''),
    focused: !!box.querySelector('.ProseMirror-focused, [class*=ProseMirror-focused]'),
  }))
  const slide = window.__FIKA_SLIDES__?.getState?.().slides?.[window.__FIKA_SLIDES__?.getState?.().slideIndex || 0]
  const storeTexts = (slide?.elements || []).map(el => {
    const html = el.type === 'text' ? el.content : el.type === 'shape' ? el.text?.content : el.type === 'table'
      ? (el.data || []).flat().map(cell => cell?.text || '').join(' ')
      : ''
    return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  })
  return {
    boxes,
    texts: boxes.map(b => b.text),
    focused: boxes.some(b => b.focused),
    prompt: boxes.some(b => b.placeholder),
    storeTexts,
    storeJoined: storeTexts.join(' | '),
    editingId: window.__FIKA_MAIN__?.getState?.().editingElementId || '',
    screen: !!document.querySelector('[data-fika-screen]'),
  }
}

async function snapEdit(page) {
  return page.evaluate(snapshotScript, 'edit')
}

async function snapScreen(page) {
  return page.evaluate(snapshotScript, 'screen')
}

async function clickCanvasAt(page, locator, ox = 12, oy = 10) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('canvas target has no box')
  await page.mouse.click(box.x + ox, box.y + oy)
}

async function dblclickCanvasAt(page, locator, ox = 24, oy = 18) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('canvas target has no box')
  await page.mouse.dblclick(box.x + ox, box.y + oy)
}

async function clickTool(page, name) {
  const el = name === 'insert-text'
    ? page.locator('[data-canvas-tool=insert-text] [class*=group-btn-main]').first()
    : page.locator(`[data-canvas-tool=${name}]`).first()
  await el.waitFor({ state: 'attached', timeout: 8000 })
  await el.click({ timeout: 8000, force: true })
  await sleep(160)
}

async function drawOnOverlay(page, dx = 220, dy = 120) {
  const overlay = page.locator('[data-create-selection]')
  await overlay.waitFor({ state: 'visible', timeout: 8000 })
  const box = await overlay.boundingBox()
  if (!box) throw new Error('create overlay has no box')
  const x = box.x + box.width * 0.2
  const y = box.y + box.height * 0.55
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 8 })
  await page.mouse.up()
  await sleep(200)
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

  await typeFocused(page, 0, 'KeepTitle')
  let edit = await snapEdit(page)
  rec(2, 'Typing a title keeps the caret in the live box', edit.focused && /KeepTitle/.test(edit.texts.join(' ')), edit)
  rec(3, 'Focused title is still uncommitted in the local canvas list', edit.focused === true && !!edit.editingId, {
    focused: edit.focused,
    editingId: edit.editingId,
  })

  rec(4, 'Present control is on the header', await page.locator('[data-editor-tool=present]').count() === 1)
  await enterPresent(page)
  rec(5, 'Clicking Present while focused mounts the screen overlay', await page.locator('[data-fika-screen]').count() === 1)
  let screen = await snapScreen(page)
  rec(6, 'Present shows the focused uncommitted title', /KeepTitle/.test(screen.texts.join(' ')), screen.texts)

  await exitPresent(page)
  rec(7, 'Escape exits presentation mode', await page.locator('[data-fika-screen]').count() === 0)
  edit = await snapEdit(page)
  rec(8, 'Title text survives present after a focused Present click', /KeepTitle/.test(edit.texts.join(' ')), edit.texts)
  rec(9, 'Store still has the title after exit', /KeepTitle/.test(edit.storeJoined), { store: edit.storeJoined })
  rec(10, 'Title placeholder does not return after exit', !edit.boxes[0]?.placeholder && /KeepTitle/.test(edit.boxes[0]?.text || ''), {
    placeholder: edit.boxes[0]?.placeholder,
    text: edit.boxes[0]?.text,
  })

  await typeFocused(page, 1, 'KeepSub')
  edit = await snapEdit(page)
  rec(11, 'Typing a subtitle keeps the subtitle focused', edit.focused && /KeepSub/.test(edit.texts.join(' ')), edit.texts)
  await enterPresent(page)
  screen = await snapScreen(page)
  rec(12, 'Present while the subtitle is focused shows the subtitle', /KeepSub/.test(screen.texts.join(' ')), screen.texts)
  await exitPresent(page)
  edit = await snapEdit(page)
  rec(13, 'Subtitle survives exit after a focused Present click', /KeepSub/.test(edit.texts.join(' ')), edit.texts)
  rec(14, 'Title still present after the subtitle present cycle', /KeepTitle/.test(edit.texts.join(' ')), edit.texts)

  await typeFocused(page, 0, ' Rapid')
  await enterPresent(page)
  screen = await snapScreen(page)
  rec(15, 'Rapid type then immediate Present still shows the new words', /KeepTitle/.test(screen.texts.join(' ')) && /Rapid/.test(screen.texts.join(' ')), screen.texts)
  await exitPresent(page)
  edit = await snapEdit(page)
  rec(16, 'Rapid-present text survives exit', /KeepTitle/.test(edit.texts.join(' ')) && /Rapid/.test(edit.texts.join(' ')) && /Rapid/.test(edit.storeJoined), {
    texts: edit.texts,
    store: edit.storeJoined,
  })

  await typeFocused(page, 0, ' 😄')
  await enterPresent(page)
  screen = await snapScreen(page)
  rec(17, 'Emoji typed while focused appears in presentation', /😄/.test(screen.texts.join(' ')), screen.texts)
  await exitPresent(page)
  edit = await snapEdit(page)
  rec(18, 'Emoji survives exit', /😄/.test(edit.texts.join(' ')) && /😄/.test(edit.storeJoined), edit.texts)

  await page.getByText('Add slide', { exact: false }).first().click()
  await sleep(200)
  rec(19, 'Add slide creates a content slide', await page.locator('[class*=thumbnail-slide]').count() >= 2)
  await typeFocused(page, 1, 'KeepBody')
  edit = await snapEdit(page)
  rec(20, 'Content body types into the live box while focused', /KeepBody/.test(edit.texts.join(' ')), edit.texts)
  await enterPresent(page)
  screen = await snapScreen(page)
  rec(21, 'Present from the focused body shows the body text', /KeepBody/.test(screen.texts.join(' ')), screen.texts)
  await exitPresent(page)
  edit = await snapEdit(page)
  rec(22, 'Body text survives exit', /KeepBody/.test(edit.texts.join(' ')) && /KeepBody/.test(edit.storeJoined), {
    texts: edit.texts,
    store: edit.storeJoined,
  })

  const coverThumb = page.locator('[class*=thumbnail-slide]').first()
  const coverBox = await coverThumb.boundingBox()
  if (coverBox) await page.mouse.click(coverBox.x + coverBox.width / 2, coverBox.y + 18)
  await sleep(160)
  await enterPresent(page)
  screen = await snapScreen(page)
  rec(23, 'Re-entering present from the cover still shows the title', /KeepTitle/.test(screen.texts.join(' ')) && /Rapid/.test(screen.texts.join(' ')), screen.texts)
  await exitPresent(page)
  edit = await snapEdit(page)
  rec(24, 'Second present/exit cycle keeps the title in the editor', /KeepTitle/.test(edit.texts.join(' ')) && /Rapid/.test(edit.texts.join(' ')), edit.texts)

  await typeFocused(page, 0, '')
  await page.keyboard.press('F5')
  await page.locator('[data-fika-screen]:not([data-fika-screen-shell]) [data-live-box]').first().waitFor({
    state: 'attached',
    timeout: 20000,
  }).catch(() => {})
  await sleep(200)
  screen = await snapScreen(page)
  rec(25, 'F5 from a focused title starts presentation with the text', screen.screen && /KeepTitle/.test(screen.texts.join(' ')) && /Rapid/.test(screen.texts.join(' ')), screen.texts)
  await exitPresent(page)
  edit = await snapEdit(page)
  rec(26, 'Title survives an F5 present/exit cycle', /KeepTitle/.test(edit.texts.join(' ')) && /Rapid/.test(edit.texts.join(' ')), edit.texts)

  await typeFocused(page, 1, '')
  await page.keyboard.down('Shift')
  await page.keyboard.press('F5')
  await page.keyboard.up('Shift')
  await page.locator('[data-fika-screen]:not([data-fika-screen-shell]) [data-live-box]').first().waitFor({
    state: 'attached',
    timeout: 20000,
  }).catch(() => {})
  await sleep(200)
  screen = await snapScreen(page)
  rec(27, 'Shift+F5 from a focused subtitle starts presentation with the subtitle', screen.screen && /KeepSub/.test(screen.texts.join(' ')), screen.texts)
  await exitPresent(page)
  edit = await snapEdit(page)
  rec(28, 'Subtitle survives a Shift+F5 present/exit cycle', /KeepSub/.test(edit.texts.join(' ')), edit.texts)

  await page.locator('[class*=thumbnail-slide]').first().click()
  await sleep(160)
  edit = await snapEdit(page)
  rec(29, 'Thumbnail still paints the authored title after drain', /KeepTitle/.test(edit.texts.join(' ')) && /Rapid/.test(edit.texts.join(' ')), edit.texts)

  await clickTool(page, 'insert-text')
  await drawOnOverlay(page, 240, 90)
  await page.keyboard.type('DrawnKeep', { delay: 8 })
  await enterPresent(page)
  screen = await snapScreen(page)
  await exitPresent(page)
  edit = await snapEdit(page)
  rec(30, 'Drawn text box text survives a focused Present click', /DrawnKeep/.test(screen.texts.join(' ')) && /DrawnKeep/.test(edit.texts.join(' ')) && /DrawnKeep/.test(edit.storeJoined), {
    present: screen.texts,
    texts: edit.texts,
    store: edit.storeJoined,
  })

  await clickTool(page, 'insert-table')
  const cell33 = page.locator('[data-table-cell="3x3"]')
  await cell33.waitFor({ state: 'visible', timeout: 8000 })
  await cell33.click()
  await sleep(250)
  const tableCell = page.locator('[id^=editable-element-][data-element-type=table] .cell-text, [id^=editable-element-][data-element-type=table] [class*=cell]').first()
  const cellBox = await tableCell.boundingBox()
  if (cellBox) await page.mouse.click(cellBox.x + 12, cellBox.y + 10)
  await sleep(80)
  await page.keyboard.type('CellKeep', { delay: 8 })
  await enterPresent(page)
  const presentTable = await page.locator('[data-fika-screen]').innerText()
  rec(31, 'Table cell draft is drained into presentation', /CellKeep/.test(presentTable), presentTable.slice(0, 80))
  await exitPresent(page)
  const tableAfter = await page.locator('[data-element-type=table]').innerText().catch(() => '')
  rec(32, 'Table cell text survives exit', /CellKeep/.test(tableAfter), tableAfter.slice(0, 80))

  await page.getByText('Add slide', { exact: false }).first().click()
  await sleep(200)
  await clickTool(page, 'insert-table')
  const fillCell33 = page.locator('[data-table-cell="3x3"]')
  await fillCell33.waitFor({ state: 'visible', timeout: 8000 })
  await fillCell33.click()
  await sleep(250)
  const fillTable = page.locator('[id^=editable-element-][data-element-type=table]').last()
  await fillTable.waitFor({ state: 'attached', timeout: 8000 })
  await dblclickCanvasAt(page, fillTable)
  await sleep(160)
  const firstFillCell = fillTable.locator('[data-cell-index="0_0"]').first()
  await clickCanvasAt(page, firstFillCell)
  await sleep(80)
  const fillSwatch = page.locator('[data-swatches=table-cell-fill] button').nth(1)
  await fillSwatch.waitFor({ state: 'visible', timeout: 8000 })
  await fillSwatch.click()
  await sleep(120)
  const filled = await firstFillCell.getAttribute('data-cell-fill')
  rec(33, 'Cell fill can be changed while the cell stays edited', !!filled, { fill: filled })
  await page.keyboard.type('FillKeep', { delay: 8 })
  edit = await snapEdit(page)
  rec(34, 'Typed cell text stays in the live editor after a fill change', /FillKeep/.test(edit.texts.join(' ')) || /FillKeep/.test(edit.storeJoined), {
    texts: edit.texts,
    store: edit.storeJoined,
    editingId: edit.editingId,
  })
  await enterPresent(page)
  const presentFilled = await page.locator('[data-fika-screen]').innerText()
  rec(35, 'Present while the filled cell is still edited shows the text', /FillKeep/.test(presentFilled), presentFilled.slice(0, 80))
  await exitPresent(page)
  edit = await snapEdit(page)
  rec(36, 'Filled cell text survives exit in the store', /FillKeep/.test(edit.storeJoined), { store: edit.storeJoined })
  const afterTable = page.locator('[id^=editable-element-][data-element-type=table]').last()
  await dblclickCanvasAt(page, afterTable)
  await sleep(160)
  const reeditCell = afterTable.locator('[data-cell-index="0_0"]').first()
  await clickCanvasAt(page, reeditCell)
  await sleep(120)
  const liveCell = await reeditCell.innerText()
  edit = await snapEdit(page)
  rec(37, 'Re-editing the same filled cell keeps the text', /FillKeep/.test(liveCell) || /FillKeep/.test(edit.texts.join(' ')), {
    cell: liveCell,
    texts: edit.texts,
  })
  rec(38, 'Store still has the filled cell text after re-edit', /FillKeep/.test(edit.storeJoined), { store: edit.storeJoined })

  const failed = results.filter(p => !p.pass)
  const width = 70
  console.log('#   result  case'.padEnd(width + 12) + 'measured')
  console.log('-'.repeat(120))
  for (const [id, name] of CASES) {
    const proof = results.find(p => p.id === id)
    if (!proof) throw new Error(`missing proof ${id} ${name}`)
    const mark = proof.pass ? 'PASS' : 'FAIL'
    console.log(`${String(id).padEnd(4)}${mark.padEnd(8)}${name.padEnd(width)}${proof.measured ? JSON.stringify(proof.measured) : ''}`)
  }
  if (results.length !== CASES.length) throw new Error(`expected ${CASES.length} proofs, got ${results.length}`)
  if (failed.length) throw new Error(`${failed.length} present-commit-drain proofs failed: ${failed.map(p => p.id).join(', ')}`)
  console.log('-'.repeat(120))
  console.log('present-commit-drain e2e passed (38 cases)')
  await page.close()
}
finally {
  await browser.close()
  if (child) child.kill()
}
