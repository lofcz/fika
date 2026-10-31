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
  for (const flip of ['none', 'horizontal', 'vertical', 'both']) {
    for (const operation of ['reset', 'square']) {
      for (const rotate of [0, 90, 37, -45]) {
        await page.evaluate(({ rotate, flip }) => {
          const store = window.__FIKA_SLIDES__.getState()
          const src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><path d="M0 0H200L0 100Z" fill="red"/></svg>')
          store.setSlides([{ id: 'crop-reset', elements: [{ id: 'image', type: 'image', left: 300, top: 200, width: 150, height: 70, rotate, flipH: flip === 'horizontal' || flip === 'both', flipV: flip === 'vertical' || flip === 'both', fixedRatio: true, src, clip: { shape: 'rect', range: [[25, 10], [100, 80]] } }] }])
          store.updateSlideIndex(0)
          window.__FIKA_MAIN__.getState().setActiveElementIdList(['image'])
        }, { rotate, flip })
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
        await page.evaluate(() => window.__FIKA_MAIN__.getState().setToolbarState('elStyle'))
        await page.waitForTimeout(400)
        await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().initSnapshotDatabase())
        const bitmap = page.locator('#editable-element-image canvas')
        const before = await bitmap.boundingBox()
        const saved = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0])
        if (operation === 'reset') await page.getByRole('button', { name: 'Reset style', exact: true }).click()
        else {
          await page.locator('[class*="image-style-panel"] [class*="popover-btn"]').click()
          await page.getByRole('button', { name: '1:1', exact: true }).click()
          await page.evaluate(() => window.__FIKA_MAIN__.getState().setClipingImageElementId(''))
        }
        await page.waitForTimeout(400)
        const after = await bitmap.boundingBox()
        const reset = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0])
        if (operation === 'reset') {
          assert.equal(reset.clip, undefined)
          assert.equal(!!reset.flipH, false)
          assert.equal(!!reset.flipV, false)
        } else {
          assert.equal(reset.flipH, saved.flipH)
          assert.equal(reset.flipV, saved.flipV)
        }
        assert.equal(reset.width, operation === 'reset' ? 200 : 100)
        assert.equal(reset.height, 100)
        console.log({ operation, rotate, flip, before, after })
        try {
          for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(after[key] - before[key]) < .1, `${flip} ${operation} ${rotate}deg: full bitmap ${key} must stay fixed when changing the crop`)
        } catch (error) { failures.push(error.message) }
        await page.evaluate(() => {
          document.activeElement?.blur()
          window.__FIKA_MAIN__.getState().setThumbnailsFocus(false)
          window.__FIKA_MAIN__.getState().setEditorareaFocus(true)
        })
        await page.keyboard.press('Control+z')
        await page.waitForFunction(() => window.__FIKA_SNAPSHOT__.getState().snapshotCursor === 0)
        assert.deepEqual(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0]), saved)
      }
    }
  }
  assert.deepEqual(failures, [])
  assert.deepEqual(errors, [])
} finally { await browser.close() }
