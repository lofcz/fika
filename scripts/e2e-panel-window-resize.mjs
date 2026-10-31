import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173/'}?locale=en`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  const panel = page.locator('[class*="moveable-panel"][class*="notes-panel"]')
  const failures = []
  for (const initial of [false, true]) {
    await page.setViewportSize({ width: initial ? 500 : 1500, height: initial ? 500 : 1000 })
    await page.evaluate(() => window.__FIKA_MAIN__.getState().setNotesPanelState(true))
    await panel.waitFor()
    if (!initial) await page.setViewportSize({ width: 800, height: 500 })
    await page.waitForTimeout(200)
    const box = await panel.boundingBox()
    console.log({ initial, box })
    try {
      assert.ok(box.x >= 0 && box.x + box.width <= page.viewportSize().width, 'Panel title and close button remain horizontally reachable')
      assert.ok(box.y >= 0 && box.y + 30 <= page.viewportSize().height, 'Panel title remains vertically reachable')
      assert.equal(box.width, 300, 'Keep chosen panel dimensions')
      assert.equal(box.height, 560, 'Keep chosen panel dimensions')
    } catch (error) { failures.push(error.message) }
    await page.evaluate(() => window.__FIKA_MAIN__.getState().setNotesPanelState(false))
    await panel.waitFor({ state: 'detached' })
  }
  assert.deepEqual(failures, [])
  assert.deepEqual(errors, [])
  console.log('PASS panel placement survives small windows and viewport resizing')
} finally { await browser.close() }
