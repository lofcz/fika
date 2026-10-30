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
      const gradient = i => ({ type: 'linear', rotate: i * 45, colors: [{ pos: 0, color: i ? '#00ff00' : '#ff0000' }, { pos: 100, color: '#0000ff' }] })
      const slides = window.__FIKA_SLIDES__.getState()
      slides.setSlides([0, 1].map(i => ({ id: `stops-${i}`, background: { type: 'gradient', gradient: gradient(i) }, elements: [0, 1].map(j => ({
        id: `shape-${i}-${j}`, type: 'shape', left: 100 + j * 300, top: 100, width: 200, height: 100, rotate: 0,
        viewBox: [200, 100], path: 'M0 0H200V100H0Z', fill: '#ffffff', fixedRatio: false, gradient: gradient(j),
      })) })))
      slides.updateSlideIndex(0)
      const main = window.__FIKA_MAIN__.getState()
      main.setActiveElementIdList(target === 'shape' ? ['shape-0-0'] : [])
      main.setEditorareaFocus(true)
    }, target)
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.evaluate(target => window.__FIKA_MAIN__.getState().setToolbarState(target === 'shape' ? 'elStyle' : 'slideDesign'), target)
    const bar = page.locator('[class*="gradient-bar"]:visible')
    await bar.scrollIntoViewIfNeeded()
    const box = await bar.boundingBox()
    assert.ok(box)
    const point = await bar.locator('[class*="point"]').first().boundingBox()
    assert.ok(point)
    const before = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
    await page.mouse.move(point.x + point.width / 2, point.y + point.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * .3, point.y + point.height / 2, { steps: 4 })
    await page.keyboard.press(target === 'shape' ? 'Tab' : 'PageDown')
    if (target === 'shape') assert.deepEqual(await page.evaluate(() => window.__FIKA_MAIN__.getState().activeElementIdList), ['shape-0-1'])
    else assert.equal(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slideIndex), 1)
    await page.mouse.move(box.x + box.width * .6, point.y + point.height / 2, { steps: 4 })
    await page.mouse.up()
    const after = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
    console.log(target, { original: after[0].elements[0].gradient.colors, next: target === 'shape' ? after[0].elements[1].gradient.colors : after[1].background.gradient.colors })
    try { assert.deepEqual(after, before, `${target}: navigation abandons the color-stop drag`) }
    catch (error) { failures.push(error.message) }
    const nextPoint = await bar.locator('[class*="point"]').first().boundingBox()
    await page.mouse.move(nextPoint.x + nextPoint.width / 2, nextPoint.y + nextPoint.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * .4, nextPoint.y + nextPoint.height / 2, { steps: 4 })
    await page.mouse.up()
    const colors = await page.evaluate(target => {
      const slides = window.__FIKA_SLIDES__.getState().slides
      return target === 'shape' ? slides[0].elements[1].gradient.colors : slides[1].background.gradient.colors
    }, target)
    assert.equal(colors[0].pos, 40, 'A fresh drag still updates the selected gradient')
  }
  assert.deepEqual(failures, [])
  assert.deepEqual(errors, [])
} finally { await browser.close() }
