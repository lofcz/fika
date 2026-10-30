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
    const gradient = { type: 'linear', rotate: 0, colors: [
      { pos: 0, color: '#ff0000' }, { pos: 30, color: '#00ff00' },
      { pos: 60, color: '#0000ff' }, { pos: 100, color: '#ffff00' },
    ] }
    const slides = window.__FIKA_SLIDES__.getState()
    slides.setSlides([{ id: 'external-stops', elements: [{
      id: 'shape', type: 'shape', left: 100, top: 100, width: 200, height: 100, rotate: 0,
      viewBox: [200, 100], path: 'M0 0H200V100H0Z', fill: '#ffffff', fixedRatio: false, gradient,
    }] }])
    slides.updateSlideIndex(0)
    window.__FIKA_MAIN__.getState().setActiveElementIdList(['shape'])
  })
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await page.evaluate(() => window.__FIKA_MAIN__.getState().setToolbarState('elStyle'))
  const bar = page.locator('[class*="gradient-bar"]:visible')
  await bar.locator('[class*="point"]').nth(3).click()
  await page.evaluate(() => {
    window.__FIKA_SLIDES__.getState().updateElement({ id: 'shape', props: { gradient: {
      type: 'linear', rotate: 0, colors: [{ pos: 0, color: '#ff0000' }, { pos: 100, color: '#0000ff' }],
    } } })
  })
  await page.waitForTimeout(150)
  console.log({ errors, bars: await bar.count() })
  assert.deepEqual(errors, [], 'Replacing a selected gradient with fewer stops cannot crash the editor')
  assert.equal(await bar.count(), 1, 'Gradient controls remain available')
  assert.equal(await bar.locator('[class*="point"]').count(), 2)
  assert.equal(await bar.locator('[class*="point"]').evaluateAll(nodes => nodes.findIndex(el => el.classList.contains('active'))), 0, 'A removed selection returns to the first stop')
  await bar.locator('[class*="point"]').nth(1).click()
  assert.equal(await bar.locator('[class*="point"]').evaluateAll(nodes => nodes.findIndex(el => el.classList.contains('active'))), 1, 'The new stops remain selectable')
} finally { await browser.close() }
