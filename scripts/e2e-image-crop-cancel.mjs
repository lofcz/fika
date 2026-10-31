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
    const add = document.addEventListener.bind(document)
    const remove = document.removeEventListener.bind(document)
    const listeners = new Map(['pointermove', 'pointerup', 'pointercancel'].map(type => [type, new Set()]))
    document.addEventListener = (type, handler, options) => { listeners.get(type)?.add(handler); add(type, handler, options) }
    document.removeEventListener = (type, handler, options) => { listeners.get(type)?.delete(handler); remove(type, handler, options) }
    window.cropListenerCount = () => [...listeners.values()].reduce((count, handlers) => count + handlers.size, 0)
  })
  const failures = []
  for (const mode of ['idle', 'moved', 'dragging', 'resizing']) {
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
    if (mode !== 'idle') {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width / 2 - 10, box.y + box.height / 2 + 5, { steps: 3 })
      if (mode === 'moved') await page.mouse.up()
    }
    await page.waitForTimeout(50)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(100)
    const clipping = await page.evaluate(() => window.__FIKA_MAIN__.getState().clipingImageElementId)
    console.log(mode, { clipping })
    try { assert.equal(clipping, '', `${mode}: Escape exits crop mode`) }
    catch (error) { failures.push(error.message) }
    if (!clipping) {
      assert.equal(await page.evaluate(() => window.cropListenerCount()), 0, 'Cancel removes active pointer listeners before release')
    }
    if (mode === 'dragging' || mode === 'resizing') {
      await page.mouse.move(box.x + box.width / 2 - 20, box.y + box.height / 2 + 10)
      await page.mouse.up()
    }
    await page.waitForTimeout(400)
    assert.deepEqual(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides), before, 'Escape discards the preview')
    assert.equal(await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().snapshotCursor), 0, 'Cancel does not add history')

    await page.evaluate(() => window.__FIKA_MAIN__.getState().setClipingImageElementId(''))
  }
  assert.deepEqual(failures, [])
  assert.deepEqual(errors, [])
} finally { await browser.close() }
