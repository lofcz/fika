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
  for (const edge of ['left-top', 'right-top', 'left-bottom', 'right-bottom']) {
    for (const direction of ['expand', 'shrink']) {
      await page.evaluate(() => {
        const store = window.__FIKA_SLIDES__.getState()
        const src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="red"/></svg>')
        store.setSlides([{ id: 'ratio-crop', elements: [{ id: 'image', type: 'image', left: 300, top: 200, width: 140, height: 70, rotate: 0, fixedRatio: true, src, clip: { shape: 'rect', range: [[20, 10], [90, 80]] } }] }])
        store.updateSlideIndex(0)
        window.__FIKA_MAIN__.getState().setActiveElementIdList(['image'])
      })
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      await page.evaluate(() => window.__FIKA_MAIN__.getState().setToolbarState('elStyle'))
      await page.getByRole('button', { name: 'Crop image', exact: true }).click()
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      const handle = await page.locator(`#editable-element-image .clip-point.${edge}`).boundingBox()
      const left = edge.startsWith('left'), top = edge.endsWith('top')
      const distance = direction === 'expand' ? 100 : -100
      await page.keyboard.down('Shift')
      await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
      await page.mouse.down()
      await page.mouse.move(handle.x + handle.width / 2 + (left ? -distance : distance), handle.y + handle.height / 2 + (top ? -distance : distance), { steps: 3 })
      await page.mouse.up()
      await page.keyboard.up('Shift')
      await page.waitForTimeout(50)
      await page.keyboard.press('Enter')
      await page.waitForFunction(() => !window.__FIKA_MAIN__.getState().clipingImageElementId)
      const after = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0])
      console.log({ edge, direction, width: after.width, height: after.height })
      try {
        assert.ok(Math.abs(after.width / after.height - 2) < 1e-6, 'Shift preserves the crop ratio at both size limits')
        assert.ok(Math.abs((left ? after.left + after.width : after.left) - (left ? 440 : 300)) < 1e-6, 'Opposite horizontal anchor stays fixed')
        assert.ok(Math.abs((top ? after.top + after.height : after.top) - (top ? 270 : 200)) < 1e-6, 'Opposite vertical anchor stays fixed')
        for (const value of after.clip.range.flat()) assert.ok(value >= -1e-6 && value <= 100 + 1e-6, 'Crop remains within the source')
        assert.ok(direction === 'expand' ? after.width > 140 : after.width < 140, 'The gesture changes the crop in the requested direction')
      } catch (error) { failures.push(`${edge}/${direction}: ${error.message}`) }
    }
  }
  assert.deepEqual(failures, [])
  assert.deepEqual(errors, [])
} finally { await browser.close() }
