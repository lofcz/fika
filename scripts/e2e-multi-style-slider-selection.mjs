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
  for (const label of ['Border width:', 'Border radius:']) {
    await page.evaluate(() => {
      const slides = window.__FIKA_SLIDES__.getState()
      slides.setSlides([{ id: 'multi-style', elements: ['first', 'second', 'third'].map((id, i) => ({
        id, type: 'shape', left: 100 + i * 250, top: 100, width: 180, height: 100,
        rotate: 0, viewBox: [180, 100], path: 'M0 0H180V100H0Z', fill: '#123456', fixedRatio: false,
        outline: { width: 2, radius: 0, color: '#123456', style: 'solid' },
      })) }])
      slides.updateSlideIndex(0)
      window.__FIKA_MAIN__.getState().setActiveElementIdList(['first', 'second'])
      window.__FIKA_MAIN__.getState().setEditorareaFocus(true)
    })
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.evaluate(() => window.__FIKA_MAIN__.getState().setToolbarState('multiStyle'))
    const slider = page.locator('.field').filter({ has: page.getByText(label, { exact: true }) }).locator('div').first()
    await slider.scrollIntoViewIfNeeded()
    const r = await slider.boundingBox()
    const originals = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements.slice(0, 2))
    const before = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[2])
    await page.mouse.move(r.x + r.width * .9, r.y + r.height / 2)
    await page.mouse.down()
    await page.evaluate(() => {
      window.__FIKA_MAIN__.getState().setThumbnailsFocus(false)
      window.__FIKA_MAIN__.getState().setEditorareaFocus(true)
    })
    await page.keyboard.press('Control+a')
    assert.deepEqual(await page.evaluate(() => window.__FIKA_MAIN__.getState().activeElementIdList), ['first', 'second', 'third'])
    await page.mouse.move(r.x + r.width * .3, r.y + r.height / 2, { steps: 4 })
    await page.mouse.up()
    await page.waitForTimeout(150)
    const after = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[2])
    assert.deepEqual(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements.slice(0, 2)), originals, 'Abandoned previews restore the original selection')
    console.log(label, { before: before.outline, after: after.outline })
    try { assert.deepEqual(after, before, `${label}: abandoned drag must not change a newly selected element`) }
    catch (error) { failures.push(error.message) }
    await page.mouse.click(r.x + r.width * .8, r.y + r.height / 2)
    const outlines = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements.map(el => el.outline))
    for (const outline of outlines) assert.equal(label === 'Border width:' ? outline.width : outline.radius, label === 'Border width:' ? 16 : .8)
  }
  assert.deepEqual(failures, [])
  assert.deepEqual(errors, [])
} finally { await browser.close() }
