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
  for (const button of ['right', 'middle', 'left']) {
    await page.evaluate(() => window.__FIKA_MAIN__.getState().setNotesPanelState(true))
    const panel = page.locator('[class*="moveable-panel"][class*="notes-panel"]')
    const handle = panel.locator('[class*="resizer"]')
    await handle.waitFor()
    const before = await panel.boundingBox()
    const box = await handle.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down({ button })
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40, { steps: 5 })
    await page.mouse.up({ button })
    const after = await panel.boundingBox()
    console.log({ button, before, after })
    try {
      assert.equal(after.width, before.width + (button === 'left' ? 60 : 0), `${button} drag width`)
      assert.equal(after.height, before.height + (button === 'left' ? 40 : 0), `${button} drag height`)
    } catch (error) { failures.push(error.message) }
    await page.evaluate(() => window.__FIKA_MAIN__.getState().setNotesPanelState(false))
    await panel.waitFor({ state: 'detached' })
  }
  assert.deepEqual(failures, [])
  assert.deepEqual(errors, [])
  console.log('PASS panel resizing uses only the primary mouse button')
} finally { await browser.close() }
