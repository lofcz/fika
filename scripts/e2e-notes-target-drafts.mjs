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
  for (const mode of ['slide', 'element']) {
    await page.evaluate(() => {
      const store = window.__FIKA_SLIDES__.getState()
      const src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="blue"/></svg>')
      store.setSlides([0, 1].map(index => ({ id: `target-${index}`, elements: [0, 1].map(n => ({ id: `image-${n}`, type: 'image', left: 100 + n * 250, top: 100, width: 200, height: 100, rotate: 0, fixedRatio: true, src })) })))
      store.updateSlideIndex(0)
      window.__FIKA_MAIN__.getState().setActiveElementIdList([])
      window.__FIKA_MAIN__.getState().setNotesPanelState(true)
    })
    const panel = page.locator('[class*="moveable-panel"][class*="notes-panel"]')
    const input = panel.locator('.send textarea')
    const selectTarget = async index => {
      await page.evaluate(({ mode, index }) => {
        if (mode === 'slide') window.__FIKA_SLIDES__.getState().updateSlideIndex(index)
        else window.__FIKA_MAIN__.getState().setActiveElementIdList([`image-${index}`])
      }, { mode, index })
      await page.waitForTimeout(100)
    }
    await selectTarget(0)
    await input.fill('Draft for A')
    await selectTarget(1)
    const second = await input.inputValue()
    await input.fill('Draft for B')
    await selectTarget(0)
    const first = await input.inputValue()
    console.log({ mode, second, first })
    try {
      assert.equal(second, '', 'The next target has its own empty draft')
      assert.equal(first, 'Draft for A', 'The original target retains its draft')
    } catch (error) { failures.push(error.message) }
    await panel.getByRole('button', { name: 'Add note', exact: true }).click()
    const note = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].notes[0])
    try {
      assert.equal(note.content, 'Draft for A')
      assert.equal(note.elId, mode === 'element' ? 'image-0' : undefined)
    } catch (error) { failures.push(error.message) }
    await selectTarget(1)
    try { assert.equal(await input.inputValue(), 'Draft for B', 'Sending a note preserves drafts for other targets') } catch (error) { failures.push(error.message) }
    await page.evaluate(() => window.__FIKA_MAIN__.getState().setNotesPanelState(false))
    await panel.waitFor({ state: 'detached' })
  }
  assert.deepEqual(errors, [])
  assert.deepEqual(failures, [])
  console.log('PASS new-note drafts stay attached to their slide or element')
} finally { await browser.close() }
