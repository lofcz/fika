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
    const content = '<p>R&amp;D &#169;</p>'
    store.setSlides([{ id: 'entity-search', elements: [
      { id: 'text', type: 'text', left: 100, top: 50, width: 600, height: 100, rotate: 0, defaultFontName: 'Arial', defaultColor: '#000000', content },
      { id: 'shape', type: 'shape', left: 100, top: 180, width: 500, height: 100, rotate: 0, fixedRatio: false, viewBox: [500, 100], path: 'M0 0 H500 V100 H0 Z', fill: '#ffffff', text: { content, defaultFontName: 'Arial', defaultColor: '#000000', align: 'top' } },
      { id: 'table', type: 'table', left: 100, top: 320, width: 400, height: 100, rotate: 0, colWidths: [1], cellMinHeight: 80, outline: { width: 1, color: '#000000', style: 'solid' }, data: [[{ id: 'cell', rowspan: 1, colspan: 1, text: content }]] },
    ] }])
    store.updateSlideIndex(0)
    window.__FIKA_MAIN__.getState().setSearchPanelState(true)
  })
  const input = page.getByPlaceholder('Enter text to find')
  const count = page.locator('[class*="search-body"] [class*="count"]')
  const failures = []
  for (const [query, expected] of [['R&D', 3], ['amp;', 0], ['©', 3]]) {
    await input.fill(query)
    await page.waitForTimeout(100)
    await input.press('Enter')
    await page.waitForTimeout(200)
    const actual = await count.textContent()
    console.log({ query, actual, errors })
    if (actual !== `${expected ? 1 : 0}/${expected}`) failures.push(`${query}: expected ${expected ? 1 : 0}/${expected}, got ${actual}`)
  }
  await page.locator('[class*="search-tabs"]').getByText('Replace', { exact: true }).click()
  await page.getByPlaceholder('Enter replacement text').fill('Copyright')
  await page.getByRole('button', { name: 'Replace all', exact: true }).click()
  const contents = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements.map(el => {
    const node = document.createElement('div')
    node.innerHTML = el.type === 'text' ? el.content : el.type === 'shape' ? el.text.content : el.data[0][0].text
    return node.textContent
  }))
  assert.deepEqual(contents, ['R&D Copyright', 'R&D Copyright', 'R&D Copyright'])
  assert.deepEqual(errors, [], 'Literal punctuation does not throw regular-expression errors')
  assert.deepEqual(failures, [])
  console.log('PASS search matches decoded visible text in text boxes, shapes and tables')
} finally { await browser.close() }
