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
    store.setSlides([0, 1, 2].map(index => ({
      id: `shape-slide-${index}`,
      elements: [{ id: index === 0 ? 'first-shape' : 'shared-shape', type: 'shape', left: 100, top: 100, width: 500, height: 200, rotate: 0, fixedRatio: false, viewBox: [500, 200], path: 'M0 0 H500 V200 H0 Z', fill: '#ffffff',
        text: { content: '<p style="">Price <strong>Price</strong></p>', defaultFontName: 'Arial', defaultColor: ['#111111', '#224466', '#336699'][index], align: ['top', 'middle', 'bottom'][index], fixedHeight: true } }],
    })))
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
  await page.getByRole('button', { name: 'Replace all', exact: true }).click()
  await page.waitForTimeout(500)
  const after = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
  console.log(after.map(slide => ({ id: slide.id, text: slide.elements[0].text })))
  assert.ok(after.every(slide => slide.elements[0].text.content === '<p style="">Cost <strong>Cost</strong></p>'), 'All shape matches are replaced across slides, including repeated element IDs')
  for (let index = 0; index < after.length; index++) {
    assert.deepEqual({ ...after[index].elements[0].text, content: '' }, { ...before[index].elements[0].text, content: '' }, 'Each shape retains its own text settings')
  }
  assert.equal(await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().snapshotCursor), 1, 'Replace all creates one undo entry')
  await page.locator('[class*="search-header"] button').click()
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(200)
  assert.deepEqual(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides), before, 'Undo restores the exact original document')
  await page.keyboard.press('Control+Shift+z')
  await page.waitForTimeout(200)
  assert.deepEqual(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides), after, 'Redo restores the replacement')
  assert.deepEqual(errors, [])
  console.log('PASS replacement history')
} finally { await browser.close() }
