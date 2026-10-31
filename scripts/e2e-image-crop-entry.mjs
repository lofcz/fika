import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173/'}?locale=en`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const failures = []
  for (const flip of ['none', 'horizontal', 'vertical', 'both']) {
    for (const rotate of [0, 37]) {
      await page.evaluate(({ flip, rotate }) => {
        const store = window.__FIKA_SLIDES__.getState()
        const src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><path d="M0 0H200L0 100Z" fill="red"/></svg>')
        store.setSlides([{ id: 'crop-entry', elements: [{ id: 'image', type: 'image', left: 300, top: 200, width: 150, height: 70, rotate, flipH: flip === 'horizontal' || flip === 'both', flipV: flip === 'vertical' || flip === 'both', fixedRatio: true, src, clip: { shape: 'rect', range: [[25, 10], [100, 80]] } }] }])
        store.updateSlideIndex(0)
        window.__FIKA_MAIN__.getState().setActiveElementIdList(['image'])
      }, { flip, rotate })
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      await page.evaluate(() => window.__FIKA_MAIN__.getState().setToolbarState('elStyle'))
      const before = await page.locator('#editable-element-image canvas').boundingBox()
      const saved = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0])
      await page.getByRole('button', { name: 'Crop image', exact: true }).click()
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      const after = await page.locator('#editable-element-image canvas[class*="top-img"]').boundingBox()
      console.log({ flip, rotate, before, after })
      try {
        for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(after[key] - before[key]) < .1, `${flip}/${rotate}: entering crop mode preserves bitmap ${key}`)
      } catch (error) { failures.push(error.message) }
      await page.keyboard.press('Enter')
      await page.waitForFunction(() => !window.__FIKA_MAIN__.getState().clipingImageElementId)
      assert.equal(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides.length), 1, 'Enter finishes cropping without inserting a slide')
      assert.deepEqual(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0]), saved, 'Entering and exiting without a drag does not change the image')
      await page.getByRole('button', { name: 'Crop image', exact: true }).click()
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      const handle = page.locator('#editable-element-image [class*="operate"]')
      const box = await handle.boundingBox()
      const radians = rotate * Math.PI / 180
      const localX = flip === 'horizontal' || flip === 'both' ? 10 : -10
      const localY = flip === 'vertical' || flip === 'both' ? -5 : 5
      const dx = localX * Math.cos(radians) - localY * Math.sin(radians)
      const dy = localX * Math.sin(radians) + localY * Math.cos(radians)
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 3 })
      await page.mouse.up()
      await page.waitForTimeout(50)
      const preview = await handle.boundingBox()
      for (const key of ['x', 'y']) assert.ok(Math.abs(preview[key] - box[key] - (key === 'x' ? dx : dy)) < .1, `${flip}/${rotate}: crop follows pointer ${key}`)
      await page.keyboard.press('Enter')
      await page.waitForFunction(() => !window.__FIKA_MAIN__.getState().clipingImageElementId)
      const committed = await page.locator('#editable-element-image [data-live-box]').boundingBox()
      try {
        for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(committed[key] - preview[key]) < .1, `${flip}/${rotate}: committed crop matches preview ${key}`)
      } catch (error) { failures.push(error.message) }
      await page.getByRole('button', { name: 'Crop image', exact: true }).click()
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      const edge = await page.locator('#editable-element-image .clip-point.right').boundingBox()
      const shrink = flip === 'horizontal' || flip === 'both' ? 5 : -5
      await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2)
      await page.mouse.down()
      await page.mouse.move(edge.x + edge.width / 2 + shrink * Math.cos(radians), edge.y + edge.height / 2 + shrink * Math.sin(radians), { steps: 3 })
      await page.mouse.up()
      await page.waitForTimeout(50)
      const resized = await handle.boundingBox()
      assert.ok(resized.width < committed.width - 1, `${flip}/${rotate}: edge drag shrinks the crop`)
      await page.keyboard.press('Enter')
      await page.waitForFunction(() => !window.__FIKA_MAIN__.getState().clipingImageElementId)
      const resizedCommit = await page.locator('#editable-element-image [data-live-box]').boundingBox()
      const bitmapAfter = await page.locator('#editable-element-image canvas').boundingBox()
      for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(bitmapAfter[key] - before[key]) < .1, `${flip}/${rotate}: cropping keeps the full bitmap fixed`)
      try {
        for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(resizedCommit[key] - resized[key]) < .1, `${flip}/${rotate}: resized crop matches preview ${key}`)
      } catch (error) { failures.push(error.message) }


    }
  }
  assert.deepEqual(failures, [])
  assert.deepEqual(errors, [])
} finally { await browser.close() }
