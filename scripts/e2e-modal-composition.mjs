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
  for (const composingRelease of [true, false]) {
    const image = await page.locator('#editable-element-image canvas').boundingBox()
    await page.mouse.click(image.x + image.width / 2, image.y + image.height / 2, { button: 'right' })
    await page.getByText('Set link', { exact: true }).click()
    const input = page.locator('.link-dialog input')
    await input.waitFor()
    await input.fill('https://example.com/draft')
    await input.evaluate((element, composingRelease) => {
      element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true, cancelable: true }))
      element.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', isComposing: composingRelease, bubbles: true, cancelable: true }))
    }, composingRelease)
    await page.waitForTimeout(400)
    const open = await input.isVisible()
    console.log({ composingRelease, open })
    if (!open) { failures.push('Composition cancellation closed the dialog'); continue }
    assert.equal(await input.inputValue(), 'https://example.com/draft')
    await input.press('Escape')
    await page.waitForTimeout(400)
    assert.equal(await input.isVisible(), false, 'Normal Escape still closes the dialog')
  }
  assert.equal(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0].link), undefined)
  assert.deepEqual(errors, [])
  assert.deepEqual(failures, [])
  console.log('PASS composition cancellation preserves dialog drafts')
} finally { await browser.close() }
