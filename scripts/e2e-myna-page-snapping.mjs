import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const errors = []; page.on('pageerror', e => errors.push(e.message))
const state = () => page.evaluate(() => { const s = window.__FIKA_SLIDES__.getState(); return { slides: s.slides, scale: window.__FIKA_MAIN__.getState().canvasScale } })
async function drag(id, dx, dy, alt = false, finish = true) {
  const box = await page.locator(`[data-myna-page-handle="${id}"]`).boundingBox()
  const scale = (await state()).scale
  if (alt) await page.keyboard.down('Alt')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + dx * scale, box.y + box.height / 2 + dy * scale, { steps: 8 })
  if (finish) { await page.mouse.up(); if (alt) await page.keyboard.up('Alt') }
}
try {
  await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5178'}/?mode=myna&locale=en`, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__FIKA_SLIDES__?.getState().slides.length)
  await page.evaluate(() => { const s = window.__FIKA_SLIDES__.getState(); const first = s.slides[0]; s.setSlides([first, { ...structuredClone(first), id: 'snap-b' }, { ...structuredClone(first), id: 'snap-c' }].map((slide, i) => ({ ...slide, canvasPosition: { x: i * 1440, y: i === 1 ? 240 : 0 } }))) })
  await page.getByRole('button', { name: 'Fit all pages', exact: true }).click()
  await drag('snap-b', 0, -236, false, false)
  assert.equal((await state()).slides[1].canvasPosition.y, 0, 'Top edges snap despite near miss')
  assert.ok(await page.locator('[data-myna-page-snap][data-axis=y]').count() > 0, 'Visible edge guides while dragging')
  assert.ok(await page.locator('[data-myna-page-spacing]').count() > 0, 'Equal gaps are measured')
  await mkdir('output/myna', { recursive: true }); await page.screenshot({ path: 'output/myna/page-alignment-guides.png' })
  await page.mouse.up()
  assert.equal(await page.locator('[data-myna-page-snapping]').count(), 0, 'Guides disappear after release')
  await drag('snap-b', 50, 9, true)
  assert.ok(Math.abs((await state()).slides[1].canvasPosition.y - 9) < .05, 'Alt bypasses smart snap')
  await page.getByRole('button', { name: 'View', exact: true }).click()
  await page.getByLabel('Snap pages to each other', { exact: true }).uncheck()
  await page.getByLabel('Snap pages and labels to grid', { exact: true }).check()
  await page.getByLabel('Show layout grid', { exact: true }).check()
  await page.getByLabel('Grid spacing', { exact: true }).fill('40')
  await page.keyboard.press('Enter'); await page.keyboard.press('Escape')
  assert.equal(await page.locator('[data-myna-workspace-grid]').count(), 1, 'Grid spans the workspace')
  await drag('snap-b', 37, 46, false, false)
  const snapped = (await state()).slides[1].canvasPosition
  assert.equal(snapped.x % 40, 0); assert.equal(snapped.y % 40, 0)
  assert.ok(await page.locator('[data-myna-page-snap]').count() > 0, 'Grid snapping has visual feedback')
  await page.mouse.up()
  await drag('snap-b', 51, 7, true)
  assert.ok(Math.abs((await state()).slides[1].canvasPosition.y - snapped.y - 7) < .05, 'Alt bypasses grid snap')
  // Snap to a ruler guide belonging to a stationary page, then cancel the drag.
  await page.evaluate(() => {
    const s = window.__FIKA_SLIDES__.getState()
    s.updateSlide({ canvasPosition: { x: 1400, y: 0 } }, 'snap-b')
    s.updateSlide({ guides: [{ id: 'workspace-test-guide', axis: 'x', position: 1500 }] }, s.slides[0].id)
  })
  await page.getByRole('button', { name: 'View', exact: true }).click()
  await page.getByLabel('Snap pages and labels to grid', { exact: true }).uncheck()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Fit all pages', exact: true }).click()
  await drag('snap-b', 96, 0, false, false)
  assert.equal((await state()).slides[1].canvasPosition.x, 1500, 'Page snaps to stationary ruler guide')
  assert.ok(await page.locator('[data-myna-page-snap][data-axis=x]').count())
  await page.keyboard.press('Escape'); await page.mouse.up()
  assert.equal((await state()).slides[1].canvasPosition.x, 1400, 'Escape restores original page position')
  assert.equal(await page.locator('[data-myna-page-snapping]').count(), 0)
  assert.deepEqual(errors, [])
  console.log('PASS page snapping: visible edge/center guides, equal spacing, grid quantization, world grid, Alt bypass and guide cleanup.')
} finally { await browser.close() }
