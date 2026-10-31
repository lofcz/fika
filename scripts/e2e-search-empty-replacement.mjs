import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
try {
 for (const kind of ['text', 'shape']) for (const mode of ['Replace', 'Replace all']) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173/'}?locale=en`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  await page.evaluate(kind => {
    const store = window.__FIKA_SLIDES__.getState()
    const base = { id: 'text', left: 100, top: 100, width: 700, height: 100, rotate: 0 }
    const text = { fixedHeight: true, defaultFontName: 'Arial', defaultColor: '#000000', content: '<p style="">Price</p>' }
    const element = kind === 'text' ? { ...base, type: 'text', ...text } : { ...base, type: 'shape', fixedRatio: false, viewBox: [700, 100], path: 'M0 0 H700 V100 H0 Z', fill: '#ffffff', text: { ...text, align: 'top' } }
    store.setSlides([{ id: 'empty-search', elements: [element] }])
    store.updateSlideIndex(0)
    window.__FIKA_MAIN__.getState().setSearchPanelState(true)
  }, kind)
  await page.waitForTimeout(400)
  await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().initSnapshotDatabase())
  const before = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
  const input = page.getByPlaceholder('Enter text to find')
  await input.fill('Price')
  await input.press('Enter')
  await page.waitForTimeout(200)
  await page.locator('[class*="search-tabs"]').getByText('Replace', { exact: true }).click()
  await page.getByPlaceholder('Enter replacement text').fill('')
  await page.getByRole('button', { name: mode, exact: true }).click()
  await page.waitForTimeout(500)
  const after = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
  const saved = kind === 'text' ? after[0].elements[0].content : after[0].elements[0].text.content
  const visible = await page.locator('#editable-element-text .ProseMirror').textContent()
  console.log({ kind, mode, saved, visible })
  assert.equal(saved, '<p style=""></p>', 'Empty replacement clears the saved text')
  assert.equal(visible, '', 'The canvas clears when the last word is removed')
  assert.equal(await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().snapshotCursor), 1, 'Replace creates one undo entry')
  await page.locator('[class*="search-header"] button').click()
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(200)
  assert.deepEqual(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides), before, 'Undo restores the exact original document')
  await page.keyboard.press('Control+Shift+z')
  await page.waitForTimeout(200)
  assert.deepEqual(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides), after, 'Redo restores the replacement')
  assert.equal(await page.locator('#editable-element-text .ProseMirror').textContent(), '', 'Redo clears the canvas again')
  assert.deepEqual(errors, [])
  console.log('PASS empty replacement clears saved and visible text with Undo and Redo', { kind, mode })
  await page.close()
 }
} finally { await browser.close() }
