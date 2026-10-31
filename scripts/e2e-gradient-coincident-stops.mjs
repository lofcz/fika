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
      const gradient = { type: 'linear', rotate: 0, colors: [
        { pos: 0, color: '#ff0000' }, { pos: 50, color: '#ff0000' },
        { pos: 50, color: '#0000ff' }, { pos: 100, color: '#0000ff' },
      ] }
      const slides = window.__FIKA_SLIDES__.getState()
      slides.setSlides([{ id: `equal-stops-${target}`, background: { type: 'gradient', gradient }, elements: [{
        id: 'shape', type: 'shape', left: 100, top: 100, width: 200, height: 100, rotate: 0,
        viewBox: [200, 100], path: 'M0 0H200V100H0Z', fill: '#ffffff', fixedRatio: false, gradient,
      }] }])
      slides.updateSlideIndex(0)
      window.__FIKA_MAIN__.getState().setActiveElementIdList(target === 'shape' ? ['shape'] : [])
    }, target)
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.evaluate(target => window.__FIKA_MAIN__.getState().setToolbarState(target === 'shape' ? 'elStyle' : 'slideDesign'), target)
    const bar = page.locator('[class*="gradient-bar"]:visible')
    const readColors = () => page.evaluate(target => {
      const slide = window.__FIKA_SLIDES__.getState().slides[0]
      return (target === 'shape' ? slide.elements[0].gradient : slide.background.gradient).colors
    }, target)
    const before = await readColors()
    await bar.locator('[class*="point"]').nth(2).click()
    const after = await readColors()
    console.log({ target, before, after })
    try { assert.deepEqual(after, before, 'Selecting coincident stops must preserve the hard color edge') }
    catch (error) { failures.push(`${target}: ${error.message}`) }
    const selected = await bar.locator('[class*="point"]').evaluateAll(nodes => nodes.findIndex(node => node.classList.contains('active')))
    const point = await bar.locator('[class*="point"]').nth(selected).boundingBox()
    const track = await bar.locator('div').first().boundingBox()
    await page.mouse.move(point.x + point.width / 2, point.y + point.height / 2)
    await page.mouse.down()
    await page.mouse.move(track.x + track.width * .75, point.y + point.height / 2, { steps: 4 })
    await page.mouse.up()
    const moved = await readColors()
    assert.ok(moved.every((stop, i) => !i || stop.pos >= moved[i - 1].pos), 'Dragging keeps stops sorted')
    try { assert.ok(moved.some(stop => stop.color === '#0000ff' && Math.abs(stop.pos - 75) <= 1), 'The selected stop remains draggable') }
    catch (error) { failures.push(`${target}: ${error.message}`) }
  }
  assert.deepEqual(failures, [])
  assert.deepEqual(errors, [])
} finally { await browser.close() }
