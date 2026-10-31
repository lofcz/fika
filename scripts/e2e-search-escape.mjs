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
    store.setSlides([{ id: 'escape-find', elements: [{ id: 'text', type: 'text', left: 100, top: 100, width: 500, height: 100, fixedHeight: true, rotate: 0, defaultFontName: 'Arial', defaultColor: '#000000', content: '<p style="">Needle</p>' }] }])
    store.updateSlideIndex(0)
  })
  const before = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
  for (const field of ['find', 'replace']) {
    await page.keyboard.press('Control+f')
    const input = page.getByPlaceholder('Enter text to find')
    await input.fill('Needle')
    await input.press('Enter')
    await page.waitForFunction(() => CSS.highlights.get('fika-search-results')?.size === 1)
    if (field === 'replace') {
      await page.locator('[class*="search-tabs"]').getByText('Replace', { exact: true }).click()
      await page.getByPlaceholder('Enter replacement text').fill('Unused')
    }
    await page.keyboard.press('Escape')
    await page.waitForTimeout(150)
    assert.equal(await input.isVisible(), false, `Escape closes Find from the ${field} input`)
    assert.equal(await page.evaluate(() => CSS.highlights.has('fika-search-results') || CSS.highlights.has('fika-search-active')), false, 'Closing Find clears its highlights')
    assert.deepEqual(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides), before, 'Escape leaves document content unchanged')
  }
  assert.deepEqual(errors, [])
  console.log('PASS Escape closes Find from both fields and clears highlights')
} finally { await browser.close() }
