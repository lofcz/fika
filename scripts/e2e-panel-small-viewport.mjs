import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 500 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173/'}?locale=en`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  const failures = []
  for (const height of [500, 1000]) {
    await page.setViewportSize({ width: 1500, height })
    await page.evaluate(() => window.__FIKA_MAIN__.getState().setNotesPanelState(true))
    const panel = page.locator('[class*="moveable-panel"][class*="notes-panel"]')
    await panel.waitFor()
    const box = await panel.boundingBox()
    await page.mouse.move(box.x + 140, box.y + 15)
    await page.mouse.down()
    await page.mouse.move(box.x + 140, height - 20, { steps: 5 })
    await page.mouse.up()
    const after = await panel.boundingBox()
    console.log({ height, after })
    try {
      assert.ok(after.y >= 0, 'Dragging keeps the title bar reachable')
      assert.ok(after.y + Math.min(after.height, height) <= height, 'A fitting panel remains within the viewport')
    } catch (error) { failures.push(error.message) }
    await page.evaluate(() => window.__FIKA_MAIN__.getState().setNotesPanelState(false))
    await panel.waitFor({ state: 'detached' })
  }
  assert.deepEqual(failures, [])
  assert.deepEqual(errors, [])
} finally { await browser.close() }
