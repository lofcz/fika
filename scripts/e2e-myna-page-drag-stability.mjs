import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173'}/?mode=myna&locale=en`)
  await page.locator('[data-myna-page-handle]').first().waitFor()
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: 'Add page', exact: true }).click()
  await page.getByRole('button', { name: 'Fit all pages', exact: true }).click()
  await page.waitForTimeout(400)
  const ids = await page.evaluate(() => {
    const s = window.__FIKA_SLIDES__.getState()
    return { moving: s.slides[s.slideIndex].id, stationary: s.slides.find(p => p.id !== s.slides[s.slideIndex].id).id }
  })
  const handle = page.locator(`[data-myna-page-handle="${ids.moving}"]`)
  for (const bypassSnap of [false, true]) {
    const start = await handle.boundingBox()
    await page.evaluate(({ stationary, moving }) => {
      window.__dragFrames = []
      const fixed = document.querySelector(`[data-myna-page-handle="${stationary}"]`)
      const active = document.querySelector(`[data-myna-page-handle="${moving}"]`).parentElement
      const sample = () => {
        const a = fixed.getBoundingClientRect(), b = active.getBoundingClientRect()
        window.__dragFrames.push({ x: a.x, y: a.y, movingX: b.x, movingY: b.y })
        window.__dragFrame = requestAnimationFrame(sample)
      }
      sample()
    }, ids)
    if (bypassSnap) await page.keyboard.down('Alt')
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
    await page.mouse.down()
    for (let i = 1; i <= 24; i++) {
      await page.mouse.move(start.x + start.width / 2 + i * 4, start.y + start.height / 2 - i * 3)
      await page.waitForTimeout(17)
    }
    await page.mouse.up()
    if (bypassSnap) await page.keyboard.up('Alt')
    await page.waitForTimeout(100)
    const samples = await page.evaluate(() => { cancelAnimationFrame(window.__dragFrame); return window.__dragFrames })
    const drift = Math.max(...samples.map(s => Math.hypot(s.x - samples[0].x, s.y - samples[0].y)))
    assert.ok(drift < .5, `Stationary pages must not shake during ${bypassSnap ? 'free' : 'snapped'} dragging: drift ${drift}px`)
    const end = await handle.boundingBox()
    assert.ok(Math.abs(end.x - start.x - 96) < (bypassSnap ? 1 : 10), 'page follows horizontal pointer motion')
    assert.ok(Math.abs(end.y - start.y + 72) < (bypassSnap ? 1 : 10), 'page follows vertical pointer motion')
  }
  assert.deepEqual(errors, [])
  console.log('PASS new page drag: stationary canvas remains stable on every frame, with and without snapping')
} finally { await browser.close() }
