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
    store.setSlides([0, 1, 2].map(index => ({ id: `search-${index}`, elements: [{ id: `text-${index}`, type: 'text', left: 100, top: 100, width: 700, height: 100, rotate: 0, fixedHeight: true, defaultFontName: 'Arial', defaultColor: '#000000', content: index === 2 ? '<p style="">No results here</p>' : index === 0 ? '<p style="">Needle Needle</p>' : '<p style="">Needle</p>' }] })))
    store.updateSlideIndex(2)
    window.__FIKA_MAIN__.getState().setSearchPanelState(true)
  })
  const before = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
  const input = page.getByPlaceholder('Enter text to find')
  await input.fill('Needle')
  const failures = []
  for (const [action, expectedSlide, expectedResult] of [['Enter', 0, 0], ['Next', 0, 1], ['Next', 1, 2], ['Next', 0, 0], ['Previous', 1, 2]]) {
    if (action === 'Enter') await input.press('Enter')
    else await page.locator(`[data-tooltip="${action}"]:visible`).click()
    await page.waitForTimeout(400)
    const actual = await page.evaluate(() => ({
      slide: window.__FIKA_SLIDES__.getState().slideIndex,
      active: [...(CSS.highlights.get('fika-search-active') || [])].map(range => ({ text: range.toString(), start: range.startOffset })),
    }))
    console.log({ action, actual, expectedSlide, expectedResult })
    if (action === 'Enter') {
      assert.equal(await page.locator('#editable-element-text-0 .ProseMirror').evaluate(el => getComputedStyle(el, '::highlight(fika-search-active)').backgroundColor), 'rgb(255, 150, 50)', 'The active range has a visible highlight style')
      await page.screenshot({ path: '/tmp/fika-find-highlight.png' })
    }
    try {
      assert.equal(actual.slide, expectedSlide, 'Navigation shows the slide containing the selected result')
      assert.deepEqual(actual.active, [{ text: 'Needle', start: expectedResult === 1 ? 7 : 0 }], 'The selected match is highlighted')
    } catch (error) { failures.push(error.message) }
  }
  await page.locator('[class*="search-header"] button').click()
  await page.waitForTimeout(100)
  assert.equal(await page.evaluate(() => CSS.highlights.has('fika-search-results') || CSS.highlights.has('fika-search-active')), false, 'Closing Find removes its highlights')
  assert.deepEqual(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides), before, 'Finding and highlighting text never edits the document')
  assert.deepEqual(failures, [])
  assert.deepEqual(errors, [])
  console.log('PASS initial search, next, wraparound and previous navigation')
} finally { await browser.close() }
