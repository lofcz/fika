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
    store.setSlides([{ id: 'literal-search', elements: [{ id: 'text', type: 'text', left: 100, top: 100, width: 700, height: 100, rotate: 0, defaultFontName: 'Arial', defaultColor: '#000000', content: '<p>Price [USD]. [EUR] cost (a+b)?</p>' }] }])
    store.updateSlideIndex(0)
    window.__FIKA_MAIN__.getState().setSearchPanelState(true)
  })
  const input = page.getByPlaceholder('Enter text to find')
  const count = page.locator('[class*="search-body"] [class*="count"]')
  const failures = []
  for (const [query, expected] of [['[', 2], ['.', 1], ['(a+b)?', 1]]) {
    await input.fill(query)
    await page.waitForTimeout(100)
    await input.press('Enter')
    await page.waitForTimeout(200)
    const actual = await count.textContent()
    console.log({ query, actual, errors })
    if (actual !== `1/${expected}`) failures.push(`${query}: expected 1/${expected}, got ${actual}`)
  }
  await page.locator('[class*="search-tabs"]').getByText('Replace', { exact: true }).click()
  await page.getByPlaceholder('Enter replacement text').fill('$&<b>')
  await page.getByRole('button', { name: 'Replace all', exact: true }).click()
  const replaced = await page.evaluate(() => {
    const node = document.createElement('div')
    node.innerHTML = window.__FIKA_SLIDES__.getState().slides[0].elements[0].content
    return { text: node.textContent, tags: node.querySelectorAll('b').length }
  })
  assert.deepEqual(replaced, { text: 'Price [USD]. [EUR] cost $&<b>', tags: 0 }, 'Replacement text remains literal')
  assert.deepEqual(errors, [], 'Literal punctuation does not throw regular-expression errors')
  assert.deepEqual(failures, [])
  console.log('PASS literal punctuation search')
} finally { await browser.close() }
