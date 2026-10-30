import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173'}/?mode=myna&locale=en`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  await page.evaluate(async () => {
    const shape = (id, left, top, extra = {}) => ({ id, type: 'shape', left, top, width: 100, height: 80, rotate: 0, fill: '#234567', viewBox: [100, 100], path: 'M0 0H100V100H0Z', fixedRatio: false, ...extra })
    const store = window.__FIKA_SLIDES__.getState()
    store.setSlides([{ id: 'frame-test', elements: [
      shape('outer', 100, 100, { frame: { clipContent: true } }),
      shape('inner', 120, 120, { frame: { clipContent: true }, parentFrameId: 'outer' }),
      shape('child', 130, 130, { parentFrameId: 'inner' }), shape('outside', 400, 100),
    ] }])
    store.updateSlideIndex(0)
    const main = window.__FIKA_MAIN__.getState()
    main.setActiveElementIdList(['outer']); main.setEditorareaFocus(true)
    document.activeElement?.blur()
    await window.__FIKA_SNAPSHOT__.getState().initSnapshotDatabase()
  })
  const elements = () => page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements)
  const selection = () => page.evaluate(() => window.__FIKA_MAIN__.getState().activeElementIdList)
  const original = await elements()
  await page.keyboard.press('ArrowRight')
  assert.deepEqual((await elements()).map(el => el.left), [101, 121, 131, 400], 'Frame nudge carries all descendants exactly once')
  await page.keyboard.press('Control+z')
  await page.waitForFunction(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0].left === 100)
  assert.deepEqual(await elements(), original, 'Undo restores the whole frame subtree')
  await page.getByRole('button', { name: 'Layers', exact: true }).click()
  for (const restriction of ['locked', 'hidden']) {
    await page.evaluate(restriction => {
      window.__FIKA_SLIDES__.getState().updateElement({ id: 'outer', props: { lock: restriction === 'locked' } })
      const main = window.__FIKA_MAIN__.getState()
      main.setHiddenElementIdList(restriction === 'hidden' ? ['outer'] : [])
      main.setActiveElementIdList([]); main.setEditorareaFocus(true)
      document.activeElement?.blur()
    }, restriction)
    assert.equal(await page.locator('[data-frame-element-id="child"]').isDisabled(), true, 'Hierarchy also blocks descendant selection')
    await page.keyboard.press('Tab')
    assert.deepEqual(await selection(), ['outside'], `${restriction} frames exclude descendants from Tab`)
    await page.keyboard.press('Shift+Tab')
    assert.deepEqual(await selection(), ['outside'], `${restriction} frames exclude descendants from reverse Tab`)
    await page.keyboard.press('Control+a')
    assert.deepEqual(await selection(), ['outside'], `${restriction} frames exclude descendants from Select All`)
    const before = await elements()
    await page.keyboard.press('ArrowRight')
    assert.deepEqual((await elements()).slice(0, 3), before.slice(0, 3), `${restriction} descendants cannot be nudged via keyboard selection`)
  }
  console.log('PASS frame keyboard behavior: nested movement and undo, inherited lock/visibility for forward/reverse Tab and Select All, and hierarchy parity.')
} finally { await browser.close() }
