import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
try {
 for (const [original, replacement, firstExpected, finalExpected, countExpected] of [
   ['Price Price', 'Pricey', 'Pricey Price', 'Pricey Pricey', '1/2'],
   ['Pricece Price', 'Pri', 'Price Price', 'Price Pri', '1/1'],
   ['Price Price', 'Price Price', 'Price Price Price', 'Price Price Price Price', '1/4'],
 ]) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173/'}?locale=en`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  await page.evaluate(original => {
    const store = window.__FIKA_SLIDES__.getState()
    store.setSlides([{ id: 'repeat-search', elements: [{ id: 'text', type: 'text', left: 100, top: 100, width: 700, height: 100, rotate: 0, fixedHeight: true, defaultFontName: 'Arial', defaultColor: '#000000', content: `<p style="">${original}</p>` }] }])
    store.updateSlideIndex(0)
    window.__FIKA_MAIN__.getState().setSearchPanelState(true)
  }, original)
  await page.waitForTimeout(400)
  await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().initSnapshotDatabase())
  const before = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
  const input = page.getByPlaceholder('Enter text to find')
  await input.fill('Price')
  await input.press('Enter')
  await page.waitForTimeout(200)
  await page.locator('[class*="search-tabs"]').getByText('Replace', { exact: true }).click()
  await page.getByPlaceholder('Enter replacement text').fill(replacement)
  await page.getByRole('button', { name: 'Replace', exact: true }).click()
  await page.waitForTimeout(500)
  const first = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0].content)
  assert.equal(first, `<p style="">${firstExpected}</p>`)
  await page.getByRole('button', { name: 'Replace', exact: true }).click()
  await page.waitForTimeout(500)
  const after = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
  console.log({ after: after[0].elements[0].content })
  assert.equal(after[0].elements[0].content, `<p style="">${finalExpected}</p>`, 'A second replacement targets the next original occurrence')
  assert.equal(await page.locator('[class*="search-body"] [class*="count"]').textContent(), countExpected, 'The counter includes matches within replacement text')
  await page.locator('[class*="search-header"] button').click()
  assert.deepEqual(errors, [])
  console.log('PASS repeated replacement', { original, replacement })
  await page.close()
 }
} finally { await browser.close() }
