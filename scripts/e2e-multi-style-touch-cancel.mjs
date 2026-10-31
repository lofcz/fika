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
  for (const label of ['Border width:', 'Border radius:']) {
    await page.evaluate(() => {
      const slides = window.__FIKA_SLIDES__.getState()
      slides.setSlides([{ id: 'multi-style', elements: ['first', 'second', 'third'].map((id, i) => ({
        id, type: 'shape', left: 100 + i * 250, top: 100, width: 180, height: 100,
        rotate: 0, viewBox: [180, 100], path: 'M 0 0 H 180 V 100 H 0 Z', fill: '#123456', fixedRatio: false,
        ...(i === 1 ? {} : { outline: { width: 2 + i, radius: .1 * i, color: '#123456', style: 'solid' } }),
      })) }])
      slides.updateSlideIndex(0)
      window.__FIKA_MAIN__.getState().setActiveElementIdList(['first', 'second', 'third'])
      window.__FIKA_MAIN__.getState().setEditorareaFocus(true)
    })
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.evaluate(() => window.__FIKA_MAIN__.getState().setToolbarState('multiStyle'))
    await page.waitForTimeout(400)
    await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().initSnapshotDatabase())
    const slider = page.locator('.field').filter({ has: page.getByText(label, { exact: true }) }).locator('div').first()
    await slider.scrollIntoViewIfNeeded()
    const r = await slider.boundingBox()
    const before = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements)
    const touch = fraction => ({ x: r.x + r.width * fraction, y: r.y + r.height / 2, id: 1, radiusX: 2, radiusY: 2, force: 1 })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(.9)] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(.3)] })
    await page.waitForTimeout(100)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
    await page.waitForTimeout(150)
    assert.equal(await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().snapshotCursor), 0)
    const after = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements)
    console.log(label, { before, after })
    try { assert.deepEqual(after, before, `${label}: cancellation restores every original border and geometry`) }
    catch (error) { failures.push(error.message) }
    await page.mouse.click(r.x + r.width * .8, r.y + r.height / 2)
    const outlines = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements.map(el => el.outline))
    for (const outline of outlines) assert.equal(label === 'Border width:' ? outline.width : outline.radius, label === 'Border width:' ? 16 : .8)
  }
  assert.deepEqual(failures, [])
  assert.deepEqual(errors, [])
} finally { await browser.close() }
