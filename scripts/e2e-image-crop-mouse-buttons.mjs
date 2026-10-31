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
  for (const button of ['right', 'middle']) {
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
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down({ button })
      await page.mouse.move(box.x + box.width / 2 - 10, box.y + box.height / 2 + 5, { steps: 3 })
      await page.mouse.up({ button })
      await page.waitForTimeout(50)
      await page.keyboard.press('Enter')
      await page.waitForFunction(() => !window.__FIKA_MAIN__.getState().clipingImageElementId)
      const menuMask = page.locator('[class*="contextmenu-mask"]')
      if (await menuMask.isVisible()) await menuMask.click({ position: { x: 1, y: 1 } })
      await page.waitForTimeout(400)
      const after = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
      console.log({ button, mode, before: before[0].elements[0].clip, after: after[0].elements[0].clip })
      try {
        assert.deepEqual(after, before, `${button}/${mode}: secondary buttons do not change crops`)
        assert.equal(await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().snapshotCursor), 0, 'Ignored gestures do not add history')
      } catch (error) { failures.push(error.message) }
      await page.getByRole('button', { name: 'Crop image', exact: true }).click()
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      const fresh = await page.locator(mode === 'resizing' ? '#editable-element-image .clip-point.right' : '#editable-element-image .operate').boundingBox()
      await page.mouse.move(fresh.x + fresh.width / 2, fresh.y + fresh.height / 2)
      await page.mouse.down()
      await page.mouse.move(fresh.x + fresh.width / 2 - 10, fresh.y + fresh.height / 2 + 5, { steps: 3 })
      await page.mouse.up()
      await page.waitForTimeout(50)
      await page.keyboard.press('Enter')
      await page.waitForFunction(() => !window.__FIKA_MAIN__.getState().clipingImageElementId)
      await page.waitForTimeout(400)
      assert.notDeepEqual(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides), before, 'A fresh primary-button drag still edits the crop')

    }
  }
  assert.deepEqual(failures, [])
  assert.deepEqual(errors, [])
} finally { await browser.close() }
