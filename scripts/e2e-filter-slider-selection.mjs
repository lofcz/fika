import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const cases = [
  ['Blur', 'blur', '8px'],
  ['Brightness', 'brightness', '160%'],
  ['Contrast', 'contrast', '160%'],
  ['Grayscale', 'grayscale', '80%'],
  ['Saturation', 'saturate', '160%'],
  ['Hue', 'hue-rotate', '290deg'],
  ['Sepia', 'sepia', '80%'],
  ['Invert', 'invert', '80%'],
  ['Opacity', 'opacity', '80%'],
]
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173/'}?locale=en`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  const failures = []
  for (const [label, key, expected] of cases) {
    await page.evaluate(() => {
      const slides = window.__FIKA_SLIDES__.getState()
      const src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="red"/></svg>')
      slides.setSlides([{ id: 'filter-selection', elements: ['first', 'second'].map((id, i) => ({
        id, type: 'image', left: 100 + 300 * i, top: 100, width: 200, height: 100,
        rotate: 0, fixedRatio: true, src, filters: { brightness: '100%', blur: '1px' },
      })) }])
      slides.updateSlideIndex(0)
      const main = window.__FIKA_MAIN__.getState()
      main.setActiveElementIdList(['first'])
      main.setEditorareaFocus(true)
    })
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.evaluate(() => window.__FIKA_MAIN__.getState().setToolbarState('elStyle'))
    const slider = page.locator('[class*="filter-item"]').filter({ has: page.getByText(label, { exact: true }) }).locator('[class*="filter-slider"]')
    await slider.scrollIntoViewIfNeeded()
    const box = await slider.boundingBox()
    assert.ok(box)
    const before = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements)
    await page.mouse.move(box.x + box.width * .9, box.y + box.height / 2)
    await page.mouse.down()
    await page.keyboard.press('Tab')
    assert.deepEqual(await page.evaluate(() => window.__FIKA_MAIN__.getState().activeElementIdList), ['second'])
    await page.mouse.move(box.x + box.width * .3, box.y + box.height / 2, { steps: 4 })
    await page.mouse.up()
    const after = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements)
    console.log(label, { before: before[1].filters, after: after[1].filters })
    try { assert.deepEqual(after, before, `${label}: switching selection abandons the drag`) }
    catch (error) { failures.push(error.message) }
    await page.mouse.click(box.x + box.width * .8, box.y + box.height / 2)
    const edited = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements)
    assert.equal(edited[1].filters[key], expected, `${label}: a fresh edit changes the selected image`)
    assert.deepEqual(edited[0], before[0], `${label}: the original image remains unchanged`)
  }
  assert.deepEqual(failures, [])
  assert.deepEqual(errors, [])
  console.log('PASS all nine image filter sliders cancel abandoned drags and accept fresh edits')
} finally {
  await browser.close()
}
