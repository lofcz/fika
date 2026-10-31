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
        { pos: 0, color: '#ff0000' }, { pos: 100, color: '#0000ff' },
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
    await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().initSnapshotDatabase())
    const bar = page.locator('[class*="gradient-bar"]:visible')
    const readColors = () => page.evaluate(target => {
      const slide = window.__FIKA_SLIDES__.getState().slides[0]
      return (target === 'shape' ? slide.elements[0].gradient : slide.background.gradient).colors
    }, target)
    const before = await readColors()
    const track = await bar.locator('div').first().boundingBox()
    await bar.locator('div').first().click({ position: { x: track.width / 2, y: track.height / 2 } })
    await page.waitForFunction(() => window.__FIKA_SNAPSHOT__.getState().snapshotCursor === 1)
    const added = await readColors()
    const point = await bar.locator('[class*="point"]').nth(1).boundingBox()
    await page.mouse.move(point.x + point.width / 2, point.y + point.height / 2)
    await page.mouse.down()
    await page.mouse.move(track.x + track.width * .6, point.y + point.height / 2, { steps: 4 })
    await page.evaluate(() => {
      document.activeElement?.blur()
      window.__FIKA_MAIN__.getState().setThumbnailsFocus(false)
      window.__FIKA_MAIN__.getState().setEditorareaFocus(true)
    })
    await page.keyboard.press('Control+z')
    await page.waitForFunction(() => window.__FIKA_SNAPSHOT__.getState().snapshotCursor === 0)
    assert.deepEqual(await readColors(), before, 'Undo removes the added stop')
    await page.mouse.move(track.x + track.width * .7, point.y + point.height / 2, { steps: 4 })
    await page.mouse.up()
    await page.waitForTimeout(350)
    const after = await readColors()
    console.log({ target, before, after })
    try { assert.deepEqual(after, before, 'Releasing a drag after Undo must not restore the undone stop') }
    catch (error) { failures.push(`${target}: ${error.message}`) }
    assert.equal(await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().snapshotCursor), 0, 'Canceled drag does not add history')
    await page.evaluate(() => {
      document.activeElement?.blur()
      window.__FIKA_MAIN__.getState().setThumbnailsFocus(false)
      window.__FIKA_MAIN__.getState().setEditorareaFocus(true)
    })
    await page.keyboard.press('Control+y')
    await page.waitForFunction(() => window.__FIKA_SNAPSHOT__.getState().snapshotCursor === 1)
    assert.deepEqual(await readColors(), added, 'Redo restores the original added stop')
  }
  assert.deepEqual(failures, [])
  assert.deepEqual(errors, [])
} finally { await browser.close() }
