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
  for (const crossSlide of [false, true]) {
    await page.evaluate(() => {
      const store = window.__FIKA_SLIDES__.getState()
      store.setSlides([0, 1].map(index => ({ id: `draft-slide-${index}`, elements: [], notes: [0, 1].map(n => ({ id: `note-${n}`, content: `Note ${index}/${n}`, time: 1000, user: 'Author' })) })))
      store.updateSlideIndex(0)
      window.__FIKA_MAIN__.getState().setNotesPanelState(true)
    })
    const panel = page.locator('[class*="moveable-panel"][class*="notes-panel"]')
    const input = panel.getByPlaceholder('Enter reply')
    const openReply = async (second) => {
      if (crossSlide) {
        await page.evaluate(index => window.__FIKA_SLIDES__.getState().updateSlideIndex(index), second ? 1 : 0)
        await page.waitForTimeout(100)
      }
      await panel.locator('.note').nth(second && !crossSlide ? 1 : 0).locator('.note-header').getByRole('button', { name: 'Reply', exact: true }).click()
    }
    await openReply(false)
    await input.fill('Draft for A')
    await openReply(true)
    const second = await input.inputValue()
    await input.fill('Draft for B')
    await openReply(false)
    const first = await input.inputValue()
    console.log({ crossSlide, second, first })
    try {
      assert.equal(second, '', 'A different thread starts with its own empty draft')
      assert.equal(first, 'Draft for A', 'Returning to a thread restores its own draft')
    } catch (error) { failures.push(error.message) }
    await panel.locator('.reply-btns').getByRole('button', { name: 'Reply', exact: true }).click()
    const submitted = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].notes[0].replies?.[0]?.content)
    try { assert.equal(submitted, 'Draft for A') } catch (error) { failures.push(error.message) }
    await openReply(true)
    try { assert.equal(await input.inputValue(), 'Draft for B', 'Sending one reply retains other drafts') } catch (error) { failures.push(error.message) }
    await page.evaluate(() => window.__FIKA_MAIN__.getState().setNotesPanelState(false))
    await panel.waitFor({ state: 'detached' })
  }
  assert.deepEqual(errors, [])
  assert.deepEqual(failures, [])
  console.log('PASS reply drafts are isolated by slide and thread')
} finally { await browser.close() }
