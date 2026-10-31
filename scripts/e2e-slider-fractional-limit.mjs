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
  for (const width of [20.8, 20.2, 20]) {
    await page.evaluate(width => {
      const slides = window.__FIKA_SLIDES__.getState()
      slides.setSlides([{ id: `border-${width}`, elements: [{
        id: 'shape', type: 'shape', left: 100, top: 100, width: 200, height: 100,
        rotate: 0, viewBox: [200, 100], path: 'M0 0H200V100H0Z', fill: '#123456', fixedRatio: false,
        outline: { width, color: '#123456', style: 'solid' },
      }] }])
      slides.updateSlideIndex(0)
      window.__FIKA_MAIN__.getState().setActiveElementIdList(['shape'])
    }, width)
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.evaluate(() => window.__FIKA_MAIN__.getState().setToolbarState('elStyle'))
    const slider = page.locator('.field:visible').filter({ has: page.getByText('Border width:', { exact: true }) }).locator('div').first()
    const r = await slider.boundingBox()
    await page.mouse.move(r.x + r.width * .8, r.y + r.height / 2)
    await page.mouse.down()
    await page.mouse.move(r.x + r.width + 20, r.y + r.height / 2)
    await page.mouse.up()
    const actual = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0].outline.width)
    console.log({ maximum: width, actual })
    try { assert.equal(actual, width, 'Dragging to the right endpoint must reach the exact maximum') }
    catch (error) { failures.push(error.message) }
    await page.mouse.move(r.x + r.width * .5, r.y + r.height / 2)
    await page.mouse.down()
    await page.mouse.move(r.x - 20, r.y + r.height / 2)
    await page.mouse.up()
    assert.equal(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0].outline.width), 0)
  }
  assert.deepEqual(failures, [])
  assert.deepEqual(errors, [])
} finally { await browser.close() }
