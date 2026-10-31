import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173/'}?locale=en`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  for (const action of ['Replace', 'Replace all']) {
    await page.evaluate(() => {
      const store = window.__FIKA_SLIDES__.getState()
      const content = '<p>rain</p><p>bow</p><p>rain<br>bow</p><p>rain<strong>bow</strong></p>'
      store.setSlides([{ id: 'text-boundaries', elements: [
        { id: 'text', type: 'text', left: 100, top: 50, width: 600, height: 100, rotate: 0, defaultFontName: 'Arial', defaultColor: '#000000', content },
        { id: 'shape', type: 'shape', left: 100, top: 180, width: 500, height: 100, rotate: 0, fixedRatio: false, viewBox: [500, 100], path: 'M0 0 H500 V100 H0 Z', fill: '#ffffff', text: { content, defaultFontName: 'Arial', defaultColor: '#000000', align: 'top' } },
      ] }])
      store.updateSlideIndex(0)
      window.__FIKA_MAIN__.getState().setSearchPanelState(true)
    })
    const input = page.getByPlaceholder('Enter text to find')
    const count = page.locator('[class*="search-body"] [class*="count"]')
    const failures = []
    for (const [query, expected] of [['rain', 6], ['bow', 6], ['rainbow', 2]]) {
      await input.fill(query)
      await page.waitForTimeout(100)
      await input.press('Enter')
      await page.waitForTimeout(200)
      const actual = await count.textContent()
      console.log({ query, actual, errors })
      const highlights = await page.evaluate(() => [...(CSS.highlights.get('fika-search-results') || [])].map(range => range.toString()))
      assert.equal(highlights.length, expected, 'Visible highlights agree with result count')
      assert.ok(highlights.every(text => text === query), 'Every highlight covers the matching visible text')
      if (actual !== `${expected ? 1 : 0}/${expected}`) failures.push(`${query}: expected ${expected ? 1 : 0}/${expected}, got ${actual}`)
    }
    await page.locator('[class*="search-tabs"]').getByText('Replace', { exact: true }).click()
    await page.getByPlaceholder('Enter replacement text').fill('spectrum')
    await page.getByRole('button', { name: action, exact: true }).click()
    const contents = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements.map(el => {
      const node = document.createElement('div')
      node.innerHTML = el.type === 'text' ? el.content : el.text.content
      return [...node.querySelectorAll('p')].map(p => p.innerHTML)
    }))
    assert.deepEqual(contents, Array.from({ length: 2 }, (_, index) => ['rain', 'bow', 'rain<br>bow', action === 'Replace all' || index === 0 ? 'spectrum<strong></strong>' : 'rain<strong>bow</strong>']))
    assert.deepEqual(errors, [], 'No browser errors')
    assert.deepEqual(failures, [])
    await page.evaluate(() => window.__FIKA_MAIN__.getState().setSearchPanelState(false))
    await input.waitFor({ state: 'detached' })
  }
  console.log('PASS search respects paragraph and line breaks while matching formatted words')
} finally { await browser.close() }
