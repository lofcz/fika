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
  for (const mode of ['document', 'focused']) {
    await page.evaluate(mode => {
      const store = window.__FIKA_SLIDES__.getState()
      store.setSlides([{ id: `remark-${mode}`, elements: [], remark: '<p>Original</p>' }])
      store.updateSlideIndex(0)
    }, mode)
    const editor = page.locator('.remark .ProseMirror')
    await editor.waitFor()
    await page.waitForTimeout(400)
    await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().initSnapshotDatabase())
    await editor.click()
    await page.keyboard.press('Control+a')
    await page.keyboard.insertText('Changed')
    await page.waitForTimeout(700)
    if (mode === 'document') await page.evaluate(() => document.activeElement?.blur())
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(700)
    const read = () => page.evaluate(() => {
      const root = document.createElement('div')
      root.innerHTML = window.__FIKA_SLIDES__.getState().slides[0].remark
      return { saved: root.textContent, visible: document.querySelector('.remark .ProseMirror').textContent }
    })
    const undone = await read()
    console.log({ mode, undone })
    try { assert.deepEqual(undone, { saved: 'Original', visible: 'Original' }) } catch (error) { failures.push(`${mode} undo: ${error.message}`) }
    await page.keyboard.press(mode === 'focused' ? 'Control+y' : 'Control+Shift+z')
    await page.waitForTimeout(700)
    const redone = await read()
    console.log({ mode, redone })
    try { assert.deepEqual(redone, { saved: 'Changed', visible: 'Changed' }) } catch (error) { failures.push(`${mode} redo: ${error.message}`) }
    await page.evaluate(() => document.activeElement?.blur())
  }
  assert.deepEqual(errors, [])
  assert.deepEqual(failures, [])
  console.log('PASS speaker-note undo and redo persist in and out of the editor')
} finally { await browser.close() }
