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
  for (const cropped of [false, true]) {
    for (const mode of ['click', 'return', 'resize-return']) {
      await page.evaluate(cropped => {
        const store = window.__FIKA_SLIDES__.getState()
        const src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><path d="M0 0H200L0 100Z" fill="red"/></svg>')
        store.setSlides([{ id: 'crop-cancel', elements: [{ id: 'image', type: 'image', left: 300, top: 200, width: 150, height: 70, rotate: 0, fixedRatio: true, src, ...(cropped ? { clip: { shape: 'rect', range: [[25, 10], [100, 80]] } } : {}) }] }])
        store.updateSlideIndex(0)
        window.__FIKA_MAIN__.getState().setActiveElementIdList(['image'])
      }, cropped)
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      await page.evaluate(() => window.__FIKA_MAIN__.getState().setToolbarState('elStyle'))
      await page.waitForTimeout(400)
      await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().initSnapshotDatabase())
      const before = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
      await page.getByRole('button', { name: 'Crop image', exact: true }).click()
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      const box = await page.locator(mode === 'resize-return' ? '#editable-element-image .clip-point.right' : '#editable-element-image .operate').boundingBox()
      const x = box.x + box.width / 2, y = box.y + box.height / 2
      await page.mouse.move(x, y)
      await page.mouse.down()
      if (mode !== 'click') {
        await page.mouse.move(x - 10, y + 5, { steps: 3 })
        await page.mouse.move(x, y, { steps: 3 })
      }
      await page.mouse.up()
      await page.waitForTimeout(50)
      await page.keyboard.press('Enter')
      await page.waitForFunction(() => !window.__FIKA_MAIN__.getState().clipingImageElementId)
      await page.waitForTimeout(400)
      const after = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
      const cursor = await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().snapshotCursor)
      console.log({ cropped, mode, cursor })
      try {
        assert.deepEqual(after, before, 'An unchanged crop preserves the original document')
        assert.equal(cursor, 0, 'An unchanged crop does not add history')
      } catch (error) { failures.push(`${mode}: ${error.message}`) }
      await page.evaluate(() => window.__FIKA_MAIN__.getState().setClipingImageElementId(''))
    }
  }
  assert.deepEqual(failures, [])
  assert.deepEqual(errors, [])
} finally { await browser.close() }
