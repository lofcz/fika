import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
try {
 for (const mode of ['Replace', 'Replace all']) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173/'}?locale=en`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  await page.evaluate(() => {
    const store = window.__FIKA_SLIDES__.getState()
    store.setSlides([{ id: 'fit-search', background: { type: 'solid', color: '#111111' }, elements: [{ id: 'text', type: 'text', left: 100, top: 100, width: 240, height: 70, rotate: 0, fixedHeight: true, defaultFontName: 'Arial', defaultColor: '#000000', content: '<p style=""><span style="font-size:66px;color:#000000">Price Price Price Price</span><span data-color-explicit="true" style="color:#18181b"> Black</span></p>' }] }])
    store.updateSlideIndex(0)
    window.__FIKA_MAIN__.getState().setSearchPanelState(true)
  })
  await page.waitForTimeout(400)
  await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().initSnapshotDatabase())
  const before = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
  const input = page.getByPlaceholder('Enter text to find')
  await input.fill('Price')
  await input.press('Enter')
  await page.waitForTimeout(200)
  await page.locator('[class*="search-tabs"]').getByText('Replace', { exact: true }).click()
  await page.getByPlaceholder('Enter replacement text').fill('Cost')
  await page.getByRole('button', { name: mode, exact: true }).click()
  await page.waitForTimeout(500)
  const after = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
  assert.ok(after[0].elements[0].content.includes('Cost'), 'Selected match is replaced')
  console.log({ before: before[0].elements[0].content, after: after[0].elements[0].content })
  assert.equal(after[0].elements[0].content, mode === 'Replace' ? before[0].elements[0].content.replace('Price', 'Cost') : before[0].elements[0].content.replaceAll('Price', 'Cost'), 'Replacing a word preserves authored font sizes, automatic ink and explicit colors exactly')
  assert.equal(await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().snapshotCursor), 1, 'Replace creates one undo entry')
  await page.locator('[class*="search-header"] button').click()
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(200)
  assert.deepEqual(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides), before, 'Undo restores the exact original document')
  await page.keyboard.press('Control+Shift+z')
  await page.waitForTimeout(200)
  assert.deepEqual(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides), after, 'Redo restores the replacement')
  assert.deepEqual(errors, [])
  console.log(`PASS ${mode} preserves authored colors, font sizes, and undo history`)
  await page.close()
 }
} finally { await browser.close() }
