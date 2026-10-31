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
    const src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="blue"/></svg>')
    store.setSlides([{ id: 'modal-composition', elements: [{ id: 'image', type: 'image', left: 100, top: 100, width: 200, height: 100, rotate: 0, fixedRatio: true, src }] }])
    store.updateSlideIndex(0)
  })
  const failures = []
  for (const guard of ['readOnly', 'locked']) {
    await page.evaluate(() => {
      window.__FIKA_MAIN__.setState({ readOnly: false })
      window.__FIKA_SLIDES__.getState().updateElement({ id: 'image', props: { lock: false } })
      window.__FIKA_MAIN__.getState().setActiveElementIdList([])
    })
    const image = await page.locator('#editable-element-image canvas').boundingBox()
    await page.mouse.click(image.x + image.width / 2, image.y + image.height / 2, { button: 'right' })
    await page.getByText('Set link', { exact: true }).click()
    const input = page.locator('.link-dialog input')
    await input.waitFor()
    await input.fill('https://example.com/draft')
    await page.evaluate(guard => {
      if (guard === 'readOnly') window.__FIKA_MAIN__.setState({ readOnly: true })
      else window.__FIKA_SLIDES__.getState().updateElement({ id: 'image', props: { lock: true } })
    }, guard)
    const before = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
    await input.press('Enter')
    await page.waitForTimeout(400)
    const after = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
    console.log({ guard, unchanged: JSON.stringify(before) === JSON.stringify(after) })
    try {
      assert.deepEqual(after, before, 'A blocked hyperlink edit must not change the presentation')
      assert.equal(await input.inputValue(), 'https://example.com/draft', 'Keep the draft until editing is permitted')
      assert.equal(await page.locator('.link-dialog').getByRole('button', { name: 'Confirm', exact: true }).isDisabled(), true)
    } catch (error) { failures.push(error.message) }
    await page.evaluate(() => {
      window.__FIKA_MAIN__.setState({ readOnly: false })
      window.__FIKA_SLIDES__.getState().updateElement({ id: 'image', props: { lock: false } })
    })
    if (await input.isVisible()) {
      await input.press('Enter')
      await page.waitForTimeout(400)
      assert.equal(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0].link?.target), 'https://example.com/draft')
    }
    await page.evaluate(() => window.__FIKA_SLIDES__.getState().removeElementProps({ id: 'image', propName: 'link' }))
  }
  assert.deepEqual(errors, [])
  assert.deepEqual(failures, [])
  console.log('PASS hyperlink edits honor read-only mode and element locks')
} finally { await browser.close() }
