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
    } else if (action === 'reply') {
      await panel.locator('[class*="note-header"]').getByText('Reply', { exact: true }).click()
      await panel.getByPlaceholder('Enter reply').fill('Added reply')
    }
    const target = action === 'add' ? panel.getByRole('button', { name: 'Add note', exact: true })
      : action === 'reply' ? panel.locator('[class*="reply-btns"]').getByRole('button', { name: 'Reply', exact: true })
      : action === 'delete' ? panel.locator('[class*="note-header"]').getByText('Delete', { exact: true })
      : action === 'delete reply' ? panel.locator('[class*="reply-header"]').getByText('Delete', { exact: true })
      : panel.locator('[data-tooltip="Clear notes on this slide"]')
    await page.evaluate(() => window.__FIKA_MAIN__.setState({ readOnly: true }))
    await page.waitForTimeout(100)
    await target.evaluate(element => element.click())
    if (action === 'add' || action === 'reply') {
      const draft = panel.getByPlaceholder(action === 'add' ? 'Enter a note (for current slide)' : 'Enter reply')
      if (await draft.count()) await draft.evaluate(element => element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    }
    await page.waitForTimeout(400)
    const after = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
    const cursor = await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().snapshotCursor)
    console.log({ action, cursor, unchanged: JSON.stringify(before) === JSON.stringify(after) })
    try {
      assert.deepEqual(after, before, `${action} is blocked in read-only mode`)
      assert.equal(cursor, 0)
      assert.equal(await target.evaluate(element => element.disabled), true)
      if (action === 'add' || action === 'reply') {
        const input = panel.getByPlaceholder(action === 'add' ? 'Enter a note (for current slide)' : 'Enter reply')
        assert.equal(await input.inputValue(), action === 'add' ? 'Added note' : 'Added reply', 'Keep the draft')
        assert.equal(await input.isDisabled(), true)
      }
    } catch (error) { failures.push(error.message) }
    await page.evaluate(() => window.__FIKA_MAIN__.setState({ readOnly: false }))
    if (JSON.stringify(before) === JSON.stringify(after)) {
      await target.click()
      await page.waitForTimeout(400)
      assert.notDeepEqual(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides), before, 'Editing works after leaving read-only mode')
      assert.equal(await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().snapshotCursor), 1)
    }
    await page.evaluate(() => window.__FIKA_MAIN__.getState().setNotesPanelState(false))
    await panel.waitFor({ state: 'detached' })
  }
  assert.deepEqual(errors, [])
  assert.deepEqual(failures, [])
  console.log('PASS notes respect read-only changes and retain open drafts')
} finally { await browser.close() }
