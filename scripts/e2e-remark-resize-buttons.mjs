import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173/'}?locale=en`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  const panel = page.locator('.remark')
  const handle = panel.locator('[class*="resize-handler"]')
  const failures = []
  for (const [button, secondary] of [['right', null], ['middle', null], ['left', 'right'], ['left', 'middle'], ['left', null]]) {
    const before = await panel.boundingBox()
    const box = await handle.boundingBox()
    const x = box.x + box.width / 2
    const y = box.y + box.height - 1
    await page.mouse.move(x, y)
    await page.mouse.down({ button })
    await page.mouse.move(x, y - 20, { steps: 3 })
    if (secondary) {
      await page.mouse.down({ button: secondary })
      await page.mouse.up({ button: secondary })
    }
    await page.mouse.move(x, y - 60, { steps: 5 })
    await page.mouse.up({ button })
    if (button === 'left') await page.waitForFunction(expected => document.querySelector('.remark')?.getBoundingClientRect().height === expected, before.height + 60)
    const after = await panel.boundingBox()
    console.log({ button, secondary, before: before.height, after: after.height })
    try { assert.equal(after.height, before.height + (button === 'left' ? 60 : 0)) } catch (error) { failures.push(error.message) }
  }
  assert.deepEqual(errors, [])
  assert.deepEqual(failures, [])
  console.log('PASS speaker-note resizing only starts and stops with the primary button')
} finally { await browser.close() }
