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
  for (const reply of [false, true]) {
    for (const key of ['Shift+Enter', 'composition']) {
      await page.evaluate(() => {
        window.__FIKA_SLIDES__.getState().setSlides([{ id: 'notes-enter', elements: [], notes: [{ id: 'note', content: 'Original note', time: 1000, user: 'Author' }] }])
        window.__FIKA_SLIDES__.getState().updateSlideIndex(0)
        window.__FIKA_MAIN__.getState().setNotesPanelState(true)
      })
      const panel = page.locator('[class*="moveable-panel"][class*="notes-panel"]')
      await panel.waitFor()
      if (reply) await panel.locator('[class*="note-header"]').getByRole('button', { name: 'Reply', exact: true }).click()
      const input = panel.getByPlaceholder(reply ? 'Enter reply' : 'Enter a note (for current slide)')
      await input.fill('First')
      const before = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
      if (key === 'Shift+Enter') await input.press(key)
      else await input.evaluate(element => element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true })))
      const after = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
      console.log({ reply, key, unchanged: JSON.stringify(before) === JSON.stringify(after) })
      try {
        assert.deepEqual(after, before, `${key} must not submit the draft`)
        assert.equal(await input.inputValue(), key === 'Shift+Enter' ? 'First\n' : 'First')
        await page.keyboard.insertText('Second')
        await input.press('Enter')
        const submitted = await page.evaluate(reply => {
          const notes = window.__FIKA_SLIDES__.getState().slides[0].notes
          return reply ? notes[0].replies?.[0]?.content : notes[1]?.content
        }, reply)
        assert.equal(submitted, key === 'Shift+Enter' ? 'First\nSecond' : 'FirstSecond', 'Plain Enter submits the completed draft')
        if (key === 'Shift+Enter') {
          const lines = await panel.evaluate(element => {
            const content = [...element.querySelectorAll('[class*="content"]')].find(node => node.childNodes.length === 1 && node.textContent === 'First\nSecond')
            const range = document.createRange()
            range.setStart(content.firstChild, 0)
            range.setEnd(content.firstChild, 5)
            const first = range.getBoundingClientRect().y
            range.setStart(content.firstChild, 6)
            range.setEnd(content.firstChild, 12)
            return { first, second: range.getBoundingClientRect().y }
          })
          console.log({ reply, lines })
          assert.ok(lines.second > lines.first, 'Submitted notes preserve visible line breaks')
        }
      } catch (error) { failures.push(error.message) }
      await page.evaluate(() => window.__FIKA_MAIN__.getState().setNotesPanelState(false))
      await panel.waitFor({ state: 'detached' })
    }
  }
  assert.deepEqual(errors, [])
  assert.deepEqual(failures, [])
  console.log('PASS Shift+Enter and composition preserve note and reply drafts')
} finally { await browser.close() }
