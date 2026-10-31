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
  for (const shortcut of ['Control+Shift+z', 'Meta+Shift+z', 'Control+y']) {
    await page.evaluate(() => {
      const store = window.__FIKA_SLIDES__.getState()
      const src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="red"/></svg>')
      store.setSlides([{ id: 'redo-keys', elements: [{ id: 'image', type: 'image', left: 100, top: 100, width: 200, height: 100, rotate: 0, fixedRatio: true, src }] }])
      store.updateSlideIndex(0)
      window.__FIKA_MAIN__.getState().setActiveElementIdList(['image'])
    })
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.evaluate(() => window.__FIKA_MAIN__.getState().setToolbarState('elStyle'))
    await page.waitForTimeout(400)
    await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().initSnapshotDatabase())
    await page.getByRole('button', { name: 'Flip horizontally', exact: true }).click()
    await page.waitForFunction(() => window.__FIKA_SNAPSHOT__.getState().snapshotCursor === 1)
    await page.getByRole('button', { name: 'Flip vertically', exact: true }).click()
    await page.waitForFunction(() => window.__FIKA_SNAPSHOT__.getState().snapshotCursor === 2)
    const expected = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
    await page.evaluate(() => document.activeElement?.blur())
    await page.keyboard.press(shortcut.startsWith('Meta') ? 'Meta+z' : 'Control+z')
    await page.waitForFunction(() => window.__FIKA_SNAPSHOT__.getState().snapshotCursor === 1)
    await page.waitForTimeout(150)
    await page.keyboard.press(shortcut)
    await page.waitForTimeout(200)
    const cursor = await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().snapshotCursor)
    console.log({ shortcut, cursor })
    try {
      assert.equal(cursor, 2, `${shortcut} redoes the undone edit`)
      assert.deepEqual(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides), expected, 'Redo restores the exact saved document')
    } catch (error) { failures.push(error.message) }
  }
  assert.deepEqual(failures, [])
  assert.deepEqual(errors, [])
} finally { await browser.close() }
