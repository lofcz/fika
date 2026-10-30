import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { ensureDevServer } from './lib/dev-server.mjs'
const { url, child } = await ensureDevServer()
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  await page.goto(`${url}?locale=en`, { waitUntil: 'domcontentloaded' })
  await page.locator('.viewport-wrapper').first().waitFor({ state: 'visible' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  await page.evaluate(async () => {
    const s = window.__FIKA_SLIDES__.getState()
    s.setSlides([{ id: 'quick-undo', elements: [{ id: 'shape', type: 'shape', left: 100, top: 100, width: 200, height: 100, rotate: 0, viewBox: [200, 100], path: 'M0 0H200V100H0Z', fill: '#ff0000', fixedRatio: false }] }])
    s.updateSlideIndex(0)
    await window.__FIKA_SNAPSHOT__.getState().initSnapshotDatabase()
    window.__FIKA_MAIN__.setState({ activeElementIdList: ['shape'], handleElementId: 'shape', editorAreaFocus: true })
  })
  // Dispatch both shortcuts in the same event-loop turn so this specifically
  // exercises undo within the 300ms history debounce, regardless of host load.
  const moved = await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true }))
    const left = window.__FIKA_SLIDES__.getState().slides[0].elements[0].left
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'z', code: 'KeyZ', bubbles: true }))
    return left
  })
  assert.ok(moved > 100, 'The real arrow-key handler moved the selected shape')
  await page.waitForTimeout(600)
  assert.equal(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0].left), 100, 'Immediate undo restores the position before the pending snapshot')
  await page.keyboard.press('Control+y')
  await page.waitForFunction(left => window.__FIKA_SLIDES__.getState().slides[0].elements[0].left === left, moved)
  console.log('PASS immediate undo and redo preserve a pending keyboard edit')
  await page.waitForTimeout(150)
  await page.keyboard.press('Control+z')
  await page.waitForFunction(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0].left === 100)
  await page.evaluate(() => {
    window.__FIKA_MAIN__.setState({ activeElementIdList: ['shape'], handleElementId: 'shape', editorAreaFocus: true })
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft', bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowLeft', code: 'ArrowLeft', bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', code: 'KeyY', ctrlKey: true, bubbles: true }))
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'y', code: 'KeyY', bubbles: true }))
  })
  await page.waitForTimeout(600)
  assert.equal(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0].left), 99, 'Redo cannot replace a new pending edit with an obsolete branch')
  await page.keyboard.press('Control+z')
  await page.waitForFunction(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0].left === 100)
  await page.keyboard.press('Control+y')
  await page.waitForFunction(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0].left === 99)
  console.log('PASS pending edits replace obsolete redo branches and remain undoable')
} finally {
  await browser.close()
  child?.kill()
}
