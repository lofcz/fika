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
  for (const key of ['Enter', 'Space', 'Tab', 'Shift+Tab', 'ArrowRight', 'Delete', 'Backspace']) {
    await page.evaluate(() => {
      const store = window.__FIKA_SLIDES__.getState()
      const src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="red"/></svg>')
      store.setSlides([{ id: 'keyboard-focus', elements: ['image', 'other'].map((id, i) => ({ id, type: 'image', left: 100 + i * 250, top: 100, width: 200, height: 100, rotate: 0, fixedRatio: true, src })) }])
      store.updateSlideIndex(0)
      const main = window.__FIKA_MAIN__.getState()
      main.setActiveElementIdList(['image'])
      main.setThumbnailsFocus(false)
      main.setEditorareaFocus(true)
    })
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.evaluate(() => window.__FIKA_MAIN__.getState().setToolbarState('elStyle'))
    const button = page.getByRole('button', { name: 'Flip horizontally', exact: true })
    await button.focus()
    const before = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
    await page.keyboard.press(key)
    await page.waitForTimeout(100)
    const after = await page.evaluate(() => ({ slides: window.__FIKA_SLIDES__.getState().slides, selected: window.__FIKA_MAIN__.getState().activeElementIdList, focused: document.activeElement?.textContent?.trim() }))
    console.log({ key, selected: after.selected, focused: after.focused })
    try {
      if (key === 'Enter' || key === 'Space') assert.equal(after.slides[0].elements[0].flipH, true, `${key} activates the focused button`)
      else assert.deepEqual(after.slides, before, `${key} does not edit the slide while a toolbar button has focus`)
      assert.deepEqual(after.selected, ['image'], `${key} retains the canvas selection`)
      if (key.endsWith('Tab')) assert.notEqual(after.focused, 'Flip horizontally', 'Tab advances native control focus')
    } catch (error) { failures.push(error.message) }
  }
  await page.waitForTimeout(400)
  await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().initSnapshotDatabase())
  await page.getByRole('button', { name: 'Flip horizontally', exact: true }).focus()
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__.getState().snapshotCursor === 1)
  assert.equal(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0].flipH), true)
  await page.keyboard.press('Control+z')
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__.getState().snapshotCursor === 0)
  assert.equal(await page.evaluate(() => !!window.__FIKA_SLIDES__.getState().slides[0].elements[0].flipH), false, 'Undo remains available from a focused button')
  await page.waitForTimeout(150)
  await page.keyboard.press('Control+y')
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__.getState().snapshotCursor === 1)
  assert.equal(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0].flipH), true, 'Redo remains available after toolbar Undo')
  for (const flag of ['readOnly', 'disableHotkeys']) {
    await page.evaluate(flag => window.__FIKA_MAIN__.setState({ [flag]: true }), flag)
    await page.waitForTimeout(150)
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(150)
    assert.equal(await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().snapshotCursor), 1, `${flag} blocks global Undo`)
    await page.evaluate(flag => window.__FIKA_MAIN__.setState({ [flag]: false }), flag)
  }
  assert.deepEqual(failures, [])
  assert.deepEqual(errors, [])
} finally { await browser.close() }
