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
    store.setSlides([{ id: 'same-search', elements: [{ id: 'text', type: 'text', left: 100, top: 100, width: 700, height: 100, fixedHeight: true, rotate: 0, defaultFontName: 'Arial', defaultColor: '#000000', content: '<p style="">Pri<strong>ce</strong> PRICE</p>' }] }])
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
  await page.getByPlaceholder('Enter replacement text').fill('Price')
  await page.getByRole('button', { name: mode, exact: true }).click()
  await page.waitForTimeout(500)
  const after = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
  console.log({ mode, content: after[0].elements[0].content })
  assert.deepEqual(after, before, 'Replacing text with itself preserves formatting exactly')
  assert.equal(await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().snapshotCursor), 0, 'Unchanged replacement adds no history')
  await page.locator('[data-tooltip="Ignore case"]:visible').click()
  await input.press('Enter')
  await page.waitForTimeout(100)
  if (mode === 'Replace') await page.locator('[data-tooltip="Next"]:visible').click()
  await page.getByRole('button', { name: mode, exact: true }).click()
  await page.waitForTimeout(400)
  assert.equal(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0].content), '<p style="">Pri<strong>ce</strong> Price</p>', 'Case-only changes still apply and leave already-matching formatting intact')
  assert.equal(await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().snapshotCursor), 1)
  assert.deepEqual(errors, [])
  console.log('PASS unchanged replacement preserves formatting and history', mode)
  await page.close()
 }
} finally { await browser.close() }
