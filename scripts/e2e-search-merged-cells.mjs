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
      const data = [['Price', 'Secret'], ['Price', 'Price'], ['Price', 'Other']].map((row, r) => row.map((text, c) => ({ id: `cell-${r}-${c}`, rowspan: r === 0 && c === 0 ? 2 : 1, colspan: r === 0 && c === 0 ? 2 : 1, text })))
      store.setSlides([{ id: 'merged-search', elements: [{ id: 'table', type: 'table', left: 100, top: 100, width: 700, height: 240, rotate: 0, colWidths: [.5, .5], cellMinHeight: 80, outline: { width: 1, color: '#000000', style: 'solid' }, data }] }])
      store.updateSlideIndex(0)
      window.__FIKA_MAIN__.getState().setSearchPanelState(true)
    })
    await page.waitForTimeout(400)
    await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().initSnapshotDatabase())
    const before = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
    const input = page.getByPlaceholder('Enter text to find')
    const failures = []
    for (const [query, total] of [['Secret', 0], ['Price', 2]]) {
      await input.fill(query)
      await page.waitForTimeout(100)
      await input.press('Enter')
      await page.waitForTimeout(200)
      const count = await page.locator('[class*="search-body"] [class*="count"]').textContent()
      const highlights = await page.evaluate(() => [...(CSS.highlights.get('fika-search-results') || [])].map(range => ({ text: range.toString(), visible: range.getBoundingClientRect().width > 0 })))
      console.log({ query, count, highlights })
      try {
        assert.equal(count, `${total ? 1 : 0}/${total}`)
        assert.equal(highlights.length, total)
        assert.ok(highlights.every(range => range.visible))
      } catch (error) { failures.push(error.message) }
    }
    await input.press('Enter')
    await page.waitForTimeout(200)
    const activeCell = await page.evaluate(() => [...(CSS.highlights.get('fika-search-active') || [])].map(range => range.startContainer.parentElement.closest('[data-cell-index]')?.getAttribute('data-cell-index')))
    assert.deepEqual(activeCell, ['2_0'], 'Next skips every cell covered by the merge')
    await page.locator('[class*="search-tabs"]').getByText('Replace', { exact: true }).click()
    await page.getByPlaceholder('Enter replacement text').fill('Cost')
    await page.getByRole('button', { name: action, exact: true }).click()
    await page.waitForTimeout(400)
    const after = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
    console.log(after[0].elements[0].data.map(row => row.map(cell => cell.text)))
    try {
      assert.deepEqual(after[0].elements[0].data.map(row => row.map(cell => cell.text)), [[action === 'Replace' ? 'Price' : 'Cost', 'Secret'], ['Price', 'Price'], ['Cost', 'Other']], 'Only visible cells are changed')
    } catch (error) { failures.push(error.message) }
    await page.locator('[class*="search-header"] button').click()
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(200)
    assert.deepEqual(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides), before)
    await page.keyboard.press('Control+Shift+z')
    await page.waitForTimeout(200)
    assert.deepEqual(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides), after)
    assert.deepEqual(errors, [])
    assert.deepEqual(failures, [])
  }
  console.log('PASS search skips covered cells and replacement preserves their text')
} finally { await browser.close() }
