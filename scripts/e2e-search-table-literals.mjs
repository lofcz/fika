import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173/'}?locale=en`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  const failures = []
  for (const action of ['Replace', 'Replace all']) {
    await page.evaluate(() => {
      const store = window.__FIKA_SLIDES__.getState()
      store.setSlides([{ id: 'table-literals', elements: [{ id: 'table', type: 'table', left: 100, top: 100, width: 700, height: 160, rotate: 0, colWidths: [1], cellMinHeight: 80, outline: { width: 1, color: '#000000', style: 'solid' }, data: [[{ id: 'cell', rowspan: 1, colspan: 1, text: '<b> R&D &amp; Price Price' }]] }] }])
      store.updateSlideIndex(0)
      window.__FIKA_MAIN__.getState().setSearchPanelState(true)
    })
    await page.waitForTimeout(400)
    await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().initSnapshotDatabase())
    const before = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
    const input = page.getByPlaceholder('Enter text to find')
    for (const [query, total] of [['<b>', 1], ['&amp;', 1], ['Price', 2]]) {
      await input.fill(query)
      await page.waitForTimeout(100)
      await input.press('Enter')
      await page.waitForTimeout(200)
      const count = await page.locator('[class*="search-body"] [class*="count"]').textContent()
      const ranges = await page.evaluate(() => [...(CSS.highlights.get('fika-search-results') || [])].map(range => range.toString()))
      console.log({ action, query, count, ranges })
      try {
        assert.equal(count, `1/${total}`)
        assert.deepEqual(ranges, Array(total).fill(query))
      } catch (error) { failures.push(error.message) }
    }
    await page.locator('[class*="search-tabs"]').getByText('Replace', { exact: true }).click()
    await page.getByPlaceholder('Enter replacement text').fill(action === 'Replace' ? '$&<i>' : '&<i>')
    await page.getByRole('button', { name: action, exact: true }).click()
    await page.waitForTimeout(400)
    const after = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
    const expected = action === 'Replace' ? '<b> R&D &amp; $&<i> Price' : '<b> R&D &amp; &<i> &<i>'
    const visible = await page.locator('#editable-element-table .cell-text').textContent()
    console.log({ saved: after[0].elements[0].data[0][0].text, visible })
    try {
      assert.equal(after[0].elements[0].data[0][0].text, expected)
      assert.equal(visible.replaceAll('\u00a0', ' '), expected)
    } catch (error) { failures.push(error.message) }
    await page.locator('[class*="search-header"] button').click()
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(200)
    assert.deepEqual(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides), before)
    await page.keyboard.press('Control+Shift+z')
    await page.waitForTimeout(200)
    assert.deepEqual(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides), after)
  }
  assert.deepEqual(errors, [])
  assert.deepEqual(failures, [])
  console.log('PASS table search and replacement preserve literal text, with undo and redo')
} finally { await browser.close() }
