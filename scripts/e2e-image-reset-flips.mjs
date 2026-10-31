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
  for (const mode of ['horizontal', 'vertical', 'both']) {
    await page.evaluate(() => {
      const store = window.__FIKA_SLIDES__.getState()
      const src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><path d="M0 0H200L0 100Z" fill="red"/></svg>')
      store.setSlides([{ id: 'reset-flips', elements: [{ id: 'image', type: 'image', left: 100, top: 100, width: 200, height: 100, rotate: 0, fixedRatio: true, src }] }])
      store.updateSlideIndex(0)
      window.__FIKA_MAIN__.getState().setActiveElementIdList(['image'])
    })
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.evaluate(() => window.__FIKA_MAIN__.getState().setToolbarState('elStyle'))
    await page.waitForTimeout(400)
    await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().initSnapshotDatabase())
    if (mode !== 'vertical') await page.getByRole('button', { name: 'Flip horizontally', exact: true }).click()
    if (mode !== 'horizontal') await page.getByRole('button', { name: 'Flip vertically', exact: true }).click()
    await page.waitForTimeout(400)
    const before = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0])
    assert.equal(!!before.flipH, mode !== 'vertical')
    assert.equal(!!before.flipV, mode !== 'horizontal')
    await page.getByRole('button', { name: 'Reset style', exact: true }).click()
    await page.waitForTimeout(400)
    const after = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0])
    console.log(mode, { flipH: after.flipH, flipV: after.flipV })
    try {
      assert.equal(!!after.flipH, false, 'Reset clears horizontal flip')
      assert.equal(!!after.flipV, false, 'Reset clears vertical flip')
      const { flipH, flipV, ...original } = before
      assert.deepEqual(after, original, 'Reset preserves the image source and geometry')
    } catch (error) { failures.push(`${mode}: ${error.message}`) }
    await page.evaluate(() => {
      document.activeElement?.blur()
      window.__FIKA_MAIN__.getState().setThumbnailsFocus(false)
      window.__FIKA_MAIN__.getState().setEditorareaFocus(true)
    })
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(200)
    if (!failures.length) assert.deepEqual(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0]), before, 'Undo restores both flip settings')
  }
  assert.deepEqual(failures, [])
  assert.deepEqual(errors, [])
} finally { await browser.close() }
