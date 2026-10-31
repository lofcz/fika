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
  for (const [width, height, edge] of [[20, 100, 'left'], [20, 100, 'right'], [100, 20, 'top'], [100, 20, 'bottom'], [100, 100, 'right']]) {
    await page.evaluate(({ width, height }) => {
      const store = window.__FIKA_SLIDES__.getState()
      const src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="red"/></svg>')
      store.setSlides([{ id: 'crop-small', elements: [{ id: 'image', type: 'image', left: 300, top: 200, width, height, rotate: 0, fixedRatio: true, src }] }])
      store.updateSlideIndex(0)
      window.__FIKA_MAIN__.getState().setActiveElementIdList(['image'])
    }, { width, height })
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.evaluate(() => window.__FIKA_MAIN__.getState().setToolbarState('elStyle'))
    await page.getByRole('button', { name: 'Crop image', exact: true }).click()
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const handle = await page.locator(`#editable-element-image .clip-point.${edge}`).boundingBox()
    const x = handle.x + handle.width / 2, y = handle.y + handle.height / 2
    const dx = edge === 'left' ? 5 : edge === 'right' ? -5 : 0
    const dy = edge === 'top' ? 5 : edge === 'bottom' ? -5 : 0
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + dx, y + dy, { steps: 3 })
    await page.mouse.up()
    await page.waitForTimeout(50)
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => !window.__FIKA_MAIN__.getState().clipingImageElementId)
    const after = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0])
    console.log({ width, height, edge, after: { width: after.width, height: after.height, range: after.clip.range } })
    try {
      assert.ok(after.width <= width + 1e-6 && after.height <= height + 1e-6, 'An inward crop drag never enlarges the image')
      for (const value of after.clip.range.flat()) assert.ok(value >= -1e-6 && value <= 100 + 1e-6, 'Crop stays within the source bitmap')
      if (width === 100 && height === 100) assert.ok(after.width < width, 'Larger images still crop inward')
    } catch (error) { failures.push(`${width}x${height}/${edge}: ${error.message}`) }
  }
  assert.deepEqual(failures, [])
  assert.deepEqual(errors, [])
} finally { await browser.close() }
