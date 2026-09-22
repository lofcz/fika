import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
const errors = []
page.on('pageerror', error => errors.push(error.message))
try {
  await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5178'}/?mode=myna&locale=en`)
  await page.locator('[data-myna-workspace]').waitFor()
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotLength > 0)
  await page.getByRole('button', { name: 'Close library', exact: true }).click()
  const reset = async () => {
    await page.evaluate(() => {
      const slides = window.__FIKA_SLIDES__.getState()
      slides.updateSlide({ elements: [{ id: 'snap-target', type: 'shape', left: 200, top: 300, width: 100, height: 100, rotate: 0, fixedRatio: false, fill: '#222222', viewBox: [100,100], path: 'M0 0H100V100H0Z' }], guides: [{ id: 'vertical', axis: 'x', position: 420 }] })
      window.__FIKA_MAIN__.getState().setActiveElementIdList(['snap-target'])
    })
    await page.waitForTimeout(350)
  }
  const drag = async (targetLeft, grid = false) => {
    const rect = await page.locator('.viewport-wrapper').boundingBox()
    const state = await page.evaluate(() => ({ scale: window.__FIKA_MAIN__.getState().canvasScale, left: window.__FIKA_SLIDES__.getState().slides[0].elements[0].left }))
    await page.mouse.move(rect.x + (state.left + 50) * state.scale, rect.y + 350 * state.scale)
    await page.mouse.down()
    if (grid) await page.keyboard.down('Alt')
    await page.mouse.move(rect.x + (targetLeft + 50) * state.scale, rect.y + 350 * state.scale, { steps: 12 })
    await page.mouse.up()
    await page.waitForFunction(() => !window.__FIKA_MAIN__.getState().isGesturing)
    return page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0].left)
  }
  await reset()
  assert.ok(Math.abs(await drag(416) - 420) < .1, 'guide snaps the moved shape edge')
  await page.getByRole('button', { name: 'View', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Snap to guides', exact: true }).uncheck()
  await page.keyboard.press('Escape')
  await reset()
  const freeLeft = await drag(416)
  assert.ok(Math.abs(freeLeft - 416) < 2, `disabled guide snapping allows free placement: ${freeLeft}`)
  await reset()
  const gridLeft = await drag(416, true)
  await page.keyboard.up('Alt')
  assert.ok(Math.abs(gridLeft - 420) < .1, 'Alt snaps to the configured grid')
  assert.deepEqual(errors, [])
  console.log('Myna guide snapping: real canvas drag snaps to saved guides and respects View preference.')
} finally { await browser.close() }
