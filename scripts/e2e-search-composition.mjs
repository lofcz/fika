import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173/'}?locale=en`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  await page.evaluate(() => {
    const store = window.__FIKA_SLIDES__.getState()
    store.setSlides([{ id: 'composition-search', elements: [{ id: 'text', type: 'text', left: 100, top: 100, width: 600, height: 100, fixedHeight: true, rotate: 0, defaultFontName: 'Arial', defaultColor: '#000000', content: '<p>Price Price</p>' }] }])
    store.updateSlideIndex(0)
    window.__FIKA_MAIN__.getState().setSearchPanelState(true)
  })
  const input = page.getByPlaceholder('Enter text to find')
  const count = page.locator('[class*="search-body"] [class*="count"]')
  const composeEnter = locator => locator.evaluate(element => element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true })))
  const failures = []
  await input.fill('Price')
  await page.waitForTimeout(100)
  await composeEnter(input)
  await page.waitForTimeout(100)
  const composingCount = await count.textContent()
  console.log({ composingCount })
  try { assert.equal(composingCount, '0/0', 'Composition confirmation must not start Find') } catch (error) { failures.push(error.message) }
  await input.fill('')
  await input.fill('Price')
  await page.waitForTimeout(100)
  await input.press('Enter')
  await page.waitForTimeout(100)
  assert.equal(await count.textContent(), '1/2')
  await page.locator('[class*="search-tabs"]').getByText('Replace', { exact: true }).click()
  const replacement = page.getByPlaceholder('Enter replacement text')
  await replacement.fill('Cost')
  const before = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
  await composeEnter(replacement)
  await page.waitForTimeout(400)
  const after = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
  console.log({ unchanged: JSON.stringify(before) === JSON.stringify(after) })
  try { assert.deepEqual(after, before, 'Composition confirmation must not replace slide text') } catch (error) { failures.push(error.message) }
  if (JSON.stringify(before) === JSON.stringify(after)) {
    await replacement.press('Enter')
    await page.waitForTimeout(400)
    assert.match(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0].content), /Cost Price/)
  }
  assert.deepEqual(errors, [])
  assert.deepEqual(failures, [])
  console.log('PASS composing input does not run Find or Replace; plain Enter still works')
} finally { await browser.close() }
