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
  for (const destinationAngle of [45, 0]) {
    await page.evaluate(destinationAngle => {
      const slides = window.__FIKA_SLIDES__.getState()
      slides.setSlides([0, 1].map(i => ({
        id: `background-${i}`, elements: [],
        background: { type: 'gradient', gradient: { type: 'linear', rotate: i ? destinationAngle : 0,
          colors: [{ pos: 0, color: '#ff0000' }, { pos: 100, color: '#0000ff' }],
        } },
      })))
      slides.updateSlideIndex(0)
      const main = window.__FIKA_MAIN__.getState()
      main.setActiveElementIdList([])
      main.setEditorareaFocus(true)
      main.setToolbarState('slideDesign')
    }, destinationAngle)
    const slider = page.locator('[data-style-slider="background-gradient-angle"]')
    await slider.scrollIntoViewIfNeeded()
    const box = await slider.boundingBox()
    assert.ok(box)
    const before = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
    await page.mouse.move(box.x + box.width * .9, box.y + box.height / 2)
    await page.mouse.down()
    await page.keyboard.press('PageDown')
    assert.equal(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slideIndex), 1)
    const navigatedPaint = await page.locator('[data-live-background]').evaluate(el => el.style.backgroundImage)
    console.log({ destinationAngle, navigatedPaint })
    try { assert.ok(navigatedPaint.startsWith(`linear-gradient(${destinationAngle + 90}deg,`), 'Navigation restores the destination background preview') }
    catch (error) { failures.push(error.message) }
    await page.mouse.move(box.x + box.width * .3, box.y + box.height / 2, { steps: 4 })
    await page.mouse.up()
    const after = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
    console.log({ before: before.map(s => s.background.gradient.rotate), after: after.map(s => s.background.gradient.rotate) })
    try { assert.deepEqual(after, before, 'Navigating to another slide cancels an unfinished background edit') }
    catch (error) { failures.push(error.message) }
    await page.mouse.click(box.x + box.width * .8, box.y + box.height / 2)
    const edited = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
    assert.equal(edited[1].background.gradient.rotate, 285, 'A fresh edit changes the current slide')
    assert.deepEqual(edited[0], before[0], 'The original slide remains unchanged')
  }
  assert.deepEqual(failures, [])
  assert.deepEqual(errors, [])
  console.log('PASS background slider navigation and fresh edits')
} finally {
  await browser.close()
}
