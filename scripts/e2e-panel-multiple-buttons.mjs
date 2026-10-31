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
  for (const mode of ['move', 'resize']) {
    for (const button of ['right', 'middle']) {
      await page.evaluate(() => window.__FIKA_MAIN__.getState().setNotesPanelState(true))
      const panel = page.locator('[class*="moveable-panel"][class*="notes-panel"]')
      await panel.waitFor()
      const before = await panel.boundingBox()
      const handle = mode === 'resize' ? await panel.locator('[class*="resizer"]').boundingBox() : null
      const x = handle ? handle.x + handle.width / 2 : before.x + 150
      const y = handle ? handle.y + handle.height / 2 : before.y + 12
      await page.mouse.move(x, y)
      await page.mouse.down({ button: 'left' })
      await page.mouse.move(x + 20, y + 20, { steps: 3 })
      await page.mouse.down({ button })
      await page.mouse.up({ button })
      await page.mouse.move(x + 60, y + 40, { steps: 5 })
      await page.mouse.up({ button: 'left' })
      const after = await panel.boundingBox()
      console.log({ mode, button, before, after })
      try {
        assert.equal(after[mode === 'resize' ? 'width' : 'x'], before[mode === 'resize' ? 'width' : 'x'] + 60)
        assert.equal(after[mode === 'resize' ? 'height' : 'y'], before[mode === 'resize' ? 'height' : 'y'] + 40)
        assert.equal(await page.evaluate(() => document.onmousemove), null)
      } catch (error) { failures.push(`${mode}/${button}: ${error.message}`) }
      await page.evaluate(() => window.__FIKA_MAIN__.getState().setNotesPanelState(false))
      await panel.waitFor({ state: 'detached' })
    }
  }
  assert.deepEqual(failures, [])
  assert.deepEqual(errors, [])
  console.log('PASS secondary mouse releases preserve active panel drags')
} finally { await browser.close() }
