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
  for (const target of ['shape', 'background']) {
    await page.evaluate(target => {
      const gradient = { type: 'linear', rotate: 0, colors: [{ pos: 0, color: '#ff0000' }, { pos: 100, color: '#0000ff' }] }
      const slides = window.__FIKA_SLIDES__.getState()
      slides.setSlides([{ id: 'gradient-cancel', background: { type: 'gradient', gradient }, elements: [{
        id: 'shape', type: 'shape', left: 100, top: 100, width: 200, height: 100, rotate: 0,
        viewBox: [200, 100], path: 'M0 0H200V100H0Z', fill: '#ffffff', fixedRatio: false, gradient,
      }] }])
      slides.updateSlideIndex(0)
      window.__FIKA_MAIN__.getState().setActiveElementIdList(target === 'shape' ? ['shape'] : [])
    }, target)
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.evaluate(target => window.__FIKA_MAIN__.getState().setToolbarState(target === 'shape' ? 'elStyle' : 'slideDesign'), target)
    const slider = page.locator(`[data-style-slider="${target === 'shape' ? '' : 'background-'}gradient-angle"]`)
    await slider.scrollIntoViewIfNeeded()
    const box = await slider.boundingBox()
    assert.ok(box)
    const readPaint = () => page.evaluate(target => target === 'shape'
      ? document.getElementById('editable-gradient-shape').getAttribute('gradientTransform')
      : document.querySelector('[data-live-background]').style.backgroundImage, target)
    const before = await readPaint()
    const touch = fraction => ({ x: box.x + box.width * fraction, y: box.y + box.height / 2, id: 1, radiusX: 2, radiusY: 2, force: 1 })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(.9)] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(.3)] })
    await page.waitForTimeout(100)
    assert.notEqual(await readPaint(), before, 'The drag paints a live preview')
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
    await page.waitForTimeout(100)
    const after = await readPaint()
    const stored = await page.evaluate(target => {
      const slide = window.__FIKA_SLIDES__.getState().slides[0]
      return target === 'shape' ? slide.elements[0].gradient.rotate : slide.background.gradient.rotate
    }, target)
    console.log(target, { before, after, stored })
    try { assert.equal(after, before, `${target}: canceled touch restores the saved gradient`) }
    catch (error) { failures.push(error.message) }
    assert.equal(stored, 0, 'Cancellation does not commit the preview')
    await page.mouse.click(box.x + box.width * .8, box.y + box.height / 2)
    assert.equal(await page.evaluate(target => {
      const slide = window.__FIKA_SLIDES__.getState().slides[0]
      return target === 'shape' ? slide.elements[0].gradient.rotate : slide.background.gradient.rotate
    }, target), 285, 'A new gesture still commits')
  }
  assert.deepEqual(failures, [])
  assert.deepEqual(errors, [])
} finally {
  await browser.close()
}
