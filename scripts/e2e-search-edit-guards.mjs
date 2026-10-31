import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
try {
  const failures = []
  for (const mode of ['Replace', 'Replace all']) for (const guard of ['lock', 'frame', 'readOnly']) {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173/'}?locale=en`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
    await page.evaluate(() => {
      const store = window.__FIKA_SLIDES__.getState()
      store.setSlides([{ id: 'guard-search', elements: [{ id: 'text', type: 'text', left: 100, top: 100, width: 700, height: 100, fixedHeight: true, rotate: 0, defaultFontName: 'Arial', defaultColor: '#000000', content: '<p style="">Price</p>' }] }])
      store.updateSlideIndex(0)
      window.__FIKA_MAIN__.getState().setSearchPanelState(true)
    })
    await page.waitForTimeout(400)
    await page.getByPlaceholder('Enter text to find').fill('Price')
    await page.getByPlaceholder('Enter text to find').press('Enter')
    await page.locator('[class*="search-tabs"]').getByText('Replace', { exact: true }).click()
    await page.getByPlaceholder('Enter replacement text').fill('Cost')
    await page.evaluate(guard => {
      if (guard === 'readOnly') window.__FIKA_MAIN__.setState({ readOnly: true })
      else if (guard === 'lock') window.__FIKA_SLIDES__.getState().updateElement({ id: 'text', props: { lock: true } })
      else {
        const store = window.__FIKA_SLIDES__.getState()
        store.addElement({ id: 'frame', type: 'shape', frame: { clipContent: true }, lock: true, left: 0, top: 0, width: 1000, height: 500, rotate: 0, fixedRatio: false, viewBox: [100, 100], path: 'M0 0H100V100H0Z', fill: '#ffffff' })
        store.updateElement({ id: 'text', props: { parentFrameId: 'frame' } })
      }
    }, guard)
    await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().initSnapshotDatabase())
    const before = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
    const button = page.getByRole('button', { name: mode, exact: true })
    if (await button.isEnabled()) await button.click()
    await page.getByPlaceholder('Enter replacement text').press('Enter')
    await page.waitForTimeout(400)
    const after = await page.evaluate(() => ({ slides: window.__FIKA_SLIDES__.getState().slides, cursor: window.__FIKA_SNAPSHOT__.getState().snapshotCursor }))
    console.log({ mode, guard, content: after.slides[0].elements.find(el => el.id === 'text').content, cursor: after.cursor })
    try {
      assert.deepEqual(after.slides, before, `${mode} respects ${guard}`)
      assert.equal(after.cursor, 0, 'Rejected replacements create no history')
      assert.deepEqual(errors, [])
    } catch (error) { failures.push(error.message) }
    await page.evaluate(guard => {
      const store = window.__FIKA_SLIDES__.getState()
      if (guard === 'readOnly') window.__FIKA_MAIN__.setState({ readOnly: false })
      else store.updateElement({ id: guard === 'frame' ? 'frame' : 'text', props: { lock: false } })
      store.addElement({ ...store.slides[0].elements.find(el => el.id === 'text'), id: 'locked-other', top: 250, lock: true })
    }, guard)
    await page.waitForTimeout(100)
    await button.click()
    await page.waitForTimeout(400)
    const editable = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements)
    assert.equal(editable.find(el => el.id === 'text').content, '<p style="">Cost</p>', 'Replacement works after unlocking or leaving read-only mode')
    assert.equal(editable.find(el => el.id === 'locked-other').content, '<p style="">Price</p>', 'Bulk replacement skips locked neighbors')
    await page.close()
  }
  assert.deepEqual(failures, [])
} finally { await browser.close() }
