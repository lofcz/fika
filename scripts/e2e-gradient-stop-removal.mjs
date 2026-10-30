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
    for (const [selected, removed, expected] of [[2, 3, 2], [2, 0, 1], [3, 0, 2], [2, 2, 1], [0, 0, 0]]) {
      await page.evaluate(target => {
        const gradient = { type: 'linear', rotate: 0, colors: [
          { pos: 0, color: '#ff0000' }, { pos: 30, color: '#00ff00' },
          { pos: 60, color: '#0000ff' }, { pos: 100, color: '#ffff00' },
        ] }
        const slides = window.__FIKA_SLIDES__.getState()
        slides.setSlides([{ id: 'remove-stop', background: { type: 'gradient', gradient }, elements: [{
          id: 'shape', type: 'shape', left: 100, top: 100, width: 200, height: 100, rotate: 0,
          viewBox: [200, 100], path: 'M0 0H200V100H0Z', fill: '#ffffff', fixedRatio: false, gradient,
        }] }])
        slides.updateSlideIndex(0)
        window.__FIKA_MAIN__.getState().setActiveElementIdList(target === 'shape' ? ['shape'] : [])
      }, target)
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      await page.evaluate(target => window.__FIKA_MAIN__.getState().setToolbarState(target === 'shape' ? 'elStyle' : 'slideDesign'), target)
      const bar = page.locator('[class*="gradient-bar"]:visible')
      const points = bar.locator('[class*="point"]')
      await points.nth(selected).click()
      const selectedColor = await points.nth(selected).evaluate(el => el.style.backgroundColor)
      await points.nth(removed).click({ button: 'right' })
      await points.nth(3).waitFor({ state: 'detached' })
      assert.equal(await points.count(), 3, 'Exactly one stop is removed')
      const active = await points.evaluateAll(nodes => nodes.findIndex(node => node.classList.contains('active')))
      const expectedIndex = expected
      console.log({ target, selected, removed, active, expectedIndex })
      try {
        assert.equal(active, expectedIndex, 'Deleting another stop preserves the selected stop')
        if (selected !== removed) assert.equal(await points.nth(active).evaluate(el => el.style.backgroundColor), selectedColor)
      } catch (error) { failures.push(error.message) }
    }
  }
  assert.deepEqual(failures, [])
  assert.deepEqual(errors, [])
} finally { await browser.close() }
