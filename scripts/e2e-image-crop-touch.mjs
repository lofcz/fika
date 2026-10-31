import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, hasTouch: true })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173/'}?locale=en`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  const cdp = await page.context().newCDPSession(page)
  const failures = []
  for (const ending of ['touchEnd', 'touchCancel']) {
    for (const mode of ['dragging', 'resizing']) {
      await page.evaluate(() => {
        const store = window.__FIKA_SLIDES__.getState()
        const src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><path d="M0 0H200L0 100Z" fill="red"/></svg>')
        store.setSlides([{ id: 'crop-cancel', elements: [{ id: 'image', type: 'image', left: 300, top: 200, width: 150, height: 70, rotate: 0, fixedRatio: true, src, clip: { shape: 'rect', range: [[25, 10], [100, 80]] } }] }])
        store.updateSlideIndex(0)
        window.__FIKA_MAIN__.getState().setActiveElementIdList(['image'])
      })
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      await page.evaluate(() => window.__FIKA_MAIN__.getState().setToolbarState('elStyle'))
      await page.waitForTimeout(400)
      await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().initSnapshotDatabase())
      const before = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
      await page.getByRole('button', { name: 'Crop image', exact: true }).click()
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      const box = await page.locator(mode === 'resizing' ? '#editable-element-image .clip-point.right' : '#editable-element-image .operate').boundingBox()
      const originalPreview = await page.locator('#editable-element-image .operate').boundingBox()
      const touch = (dx, dy) => ({ x: box.x + box.width / 2 + dx, y: box.y + box.height / 2 + dy, id: 1, radiusX: 2, radiusY: 2, force: 1 })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(0, 0)] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(-15, 5)] })
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      assert.notDeepEqual(await page.locator('#editable-element-image .operate').boundingBox(), originalPreview, 'Touch input paints a live crop preview')
      await cdp.send('Input.dispatchTouchEvent', { type: ending, touchPoints: [] })
      await page.waitForTimeout(50)
      if (ending === 'touchCancel') assert.deepEqual(await page.locator('#editable-element-image .operate').boundingBox(), originalPreview, 'Cancel restores the original crop preview')
      await page.evaluate(() => document.activeElement?.blur())
      await page.keyboard.press('Enter')
      await page.waitForFunction(() => !window.__FIKA_MAIN__.getState().clipingImageElementId)
      await page.waitForTimeout(400)
      const after = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
      console.log({ ending, mode, before: before[0].elements[0].clip, after: after[0].elements[0].clip })
      try {
        if (ending === 'touchCancel') assert.deepEqual(after, before, 'Canceled touch input preserves the document')
        else assert.notDeepEqual(after, before, 'A touch drag changes the crop')
        assert.equal(await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().snapshotCursor), ending === 'touchCancel' ? 0 : 1, 'Only completed touch edits add history')
      } catch (error) { failures.push(`${mode}: ${error.message}`) }
      await page.evaluate(() => window.__FIKA_MAIN__.getState().setClipingImageElementId(''))
    }
  }
  assert.deepEqual(failures, [])
  assert.deepEqual(errors, [])
} finally { await browser.close() }
