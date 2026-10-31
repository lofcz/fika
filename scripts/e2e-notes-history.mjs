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
  for (const action of ['add', 'reply', 'delete', 'delete reply', 'clear']) {
    await page.evaluate(() => {
      const store = window.__FIKA_SLIDES__.getState()
      store.setSlides([{ id: 'notes-history', elements: [], notes: [{ id: 'note', content: 'Original note', time: 1000, user: 'Author', replies: [{ id: 'reply', content: 'Original reply', time: 1000, user: 'Reader' }] }] }])
      store.updateSlideIndex(0)
      window.__FIKA_MAIN__.getState().setNotesPanelState(true)
    })
    const panel = page.locator('[class*="moveable-panel"][class*="notes-panel"]')
    await panel.waitFor()
    await page.waitForTimeout(400)
    await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().initSnapshotDatabase())
    const before = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
    if (action === 'add') {
      await panel.getByPlaceholder('Enter a note (for current slide)').fill('Added note')
      await panel.getByRole('button', { name: 'Add note', exact: true }).click()
    } else if (action === 'reply') {
      await panel.locator('[class*="note-header"]').getByText('Reply', { exact: true }).click()
      await panel.getByPlaceholder('Enter reply').fill('Added reply')
      await panel.getByRole('button', { name: 'Reply', exact: true }).click()
    } else if (action === 'delete') {
      await panel.locator('[class*="note-header"]').getByText('Delete', { exact: true }).click()
    } else if (action === 'delete reply') {
      await panel.locator('[class*="reply-header"]').getByText('Delete', { exact: true }).click()
    } else await panel.locator('[data-tooltip="Clear notes on this slide"]').click()
    await page.waitForTimeout(400)
    const after = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
    const cursor = await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().snapshotCursor)
    console.log({ action, cursor })
    assert.notDeepEqual(after, before, 'The operation actually changes notes')
    await page.evaluate(() => document.activeElement?.blur())
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(200)
    try {
      assert.equal(cursor, 1, `${action} creates one history entry`)
      assert.deepEqual(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides), before, `${action} can be undone`)
      await page.keyboard.press('Control+Shift+z')
      await page.waitForTimeout(200)
      assert.deepEqual(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides), after, `${action} can be redone`)
    } catch (error) { failures.push(error.message) }
    await page.evaluate(() => window.__FIKA_MAIN__.getState().setNotesPanelState(false))
    await panel.waitFor({ state: 'detached' })
  }
  assert.deepEqual(errors, [])
  assert.deepEqual(failures, [])
  console.log('PASS all note and reply operations support undo and redo')
} finally { await browser.close() }
