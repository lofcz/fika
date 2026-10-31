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
  for (const target of ['shape', 'background']) {
    await page.evaluate(target => {
      const gradient = { type: 'linear', rotate: 0, colors: [] }
      const slides = window.__FIKA_SLIDES__.getState()
      slides.setSlides([{ id: `empty-${target}`, background: { type: 'gradient', gradient }, elements: [{
        id: 'shape', type: 'shape', left: 100, top: 100, width: 200, height: 100, rotate: 0,
        viewBox: [200, 100], path: 'M0 0H200V100H0Z', fill: '#ffffff', fixedRatio: false, gradient,
      }] }])
      slides.updateSlideIndex(0)
      window.__FIKA_MAIN__.getState().setActiveElementIdList(target === 'shape' ? ['shape'] : [])
    }, target)
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.evaluate(target => window.__FIKA_MAIN__.getState().setToolbarState(target === 'shape' ? 'elStyle' : 'slideDesign'), target)
    const bar = page.locator('[class*="gradient-bar"]:visible').locator('div').first()
    const r = await bar.boundingBox()
    await bar.click({ position: { x: r.width * .25, y: r.height / 2 } })
    await page.locator('[class*="gradient-bar"]:visible [class*="point"]').first().waitFor()
    await bar.click({ position: { x: r.width * .75, y: r.height / 2 } })
    const colors = await page.evaluate(target => {
      const slide = window.__FIKA_SLIDES__.getState().slides[0]
      return (target === 'shape' ? slide.elements[0].gradient : slide.background.gradient).colors
    }, target)
    console.log({ target, colors, errors })
    try {
      assert.equal(colors.length, 2, 'An empty gradient can be repaired by adding stops')
      assert.ok(Math.abs(colors[0].pos - 25) <= 1 && Math.abs(colors[1].pos - 75) <= 1, 'New stops follow the clicked positions')
      assert.ok(colors.every(stop => typeof stop.color === 'string' && stop.color.length > 0))
    } catch (error) { failures.push(`${target}: ${error.message}`) }
  }
  assert.deepEqual(failures, [])
  assert.deepEqual(errors, [])
} finally { await browser.close() }
