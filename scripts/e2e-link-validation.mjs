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
  for (const [url, valid] of [
    ['https://example.com/wiki/Function_(mathematics)', true],
    ['https://example.com/příliš?q=žluťoučký', true],
    ['http://localhost:5173/slides', true],
    ['not a url', false],
    ['javascript:alert(1)', false],
    ['https://example.com:bad', false],
  ]) {
    const image = await page.locator('#editable-element-image canvas').boundingBox()
    await page.mouse.click(image.x + image.width / 2, image.y + image.height / 2, { button: 'right' })
    await page.getByText('Set link', { exact: true }).click()
    const input = page.locator('.link-dialog input')
    await input.waitFor()
    await input.fill(url)
    await input.press('Enter')
    await page.waitForTimeout(400)
    const target = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0].link?.target)
    const open = await input.isVisible()
    console.log({ url, valid, target, open })
    try {
      if (valid) {
        assert.equal(target, url, 'A valid HTTP(S) URL is stored exactly')
        assert.equal(open, false)
      } else {
        assert.equal(target, undefined, 'Invalid or unsupported URLs are rejected')
        assert.equal(open, true)
        assert.equal(await input.inputValue(), url, 'Rejected input remains available to correct')
      }
    } catch (error) { failures.push(error.message) }
    if (open) {
      await input.press('Escape')
      await page.waitForTimeout(400)
    }
    await page.evaluate(() => window.__FIKA_SLIDES__.getState().removeElementProps({ id: 'image', propName: 'link' }))
  }
  assert.deepEqual(errors, [])
  assert.deepEqual(failures, [])
  console.log('PASS hyperlink validation accepts valid URLs and retains rejected drafts')
} finally { await browser.close() }
