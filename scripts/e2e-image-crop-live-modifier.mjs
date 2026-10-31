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
  for (const modifier of ['Shift', 'Control']) {
    for (const action of ['press', 'release']) {
      const edge = 'right-bottom'
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
      if (action === 'release') await page.keyboard.down(modifier)
      await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
      await page.mouse.down()
      if (action === 'press') await page.keyboard.down(modifier)
      else await page.keyboard.up(modifier)
      await page.mouse.move(handle.x + handle.width / 2 + 5, handle.y + handle.height / 2 + 12, { steps: 3 })
      await page.mouse.up()
      await page.keyboard.up(modifier)
      await page.waitForTimeout(50)
      await page.keyboard.press('Enter')
      await page.waitForFunction(() => !window.__FIKA_MAIN__.getState().clipingImageElementId)
      const after = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0])
      const locked = Math.abs(after.width / after.height - 2) < 1e-6
      console.log({ modifier, action, width: after.width, height: after.height, locked })
      try { assert.equal(locked, action === 'press', 'The crop follows the current modifier state') }
      catch (error) { failures.push(`${modifier}/${action}: ${error.message}`) }

    }
  }
  assert.deepEqual(failures, [])
  assert.deepEqual(errors, [])
} finally { await browser.close() }
