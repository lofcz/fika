import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  await page.goto(process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  const reset = async () => {
    await page.evaluate(() => {
      const store = window.__FIKA_SLIDES__.getState()
      store.setSlides([{ id: 'floor-slide', elements: [{
        id: 'floor-table', type: 'table', left: 100, top: 150, width: 400, height: 160, rotate: 0,
        outline: { width: 1, color: '#333333', style: 'solid' }, colWidths: [.5, .5], cellMinHeight: 80,
        data: [
          [{ id: 'a', colspan: 1, rowspan: 1, text: 'First line\nSecond line' }, { id: 'b', colspan: 1, rowspan: 1, text: 'B' }],
          [{ id: 'c', colspan: 1, rowspan: 1, text: 'Bottom line' }, { id: 'd', colspan: 1, rowspan: 1, text: 'D' }],
        ],
      }] }])
      store.updateSlideIndex(0)
      window.__FIKA_MAIN__.getState().setActiveElementIdList(['floor-table'])
    })
    await page.waitForTimeout(500)
  }
  const measure = () => page.evaluate(() => {
    const root = document.getElementById('editable-element-floor-table')
    const live = root.querySelector('[data-live-box]')
    const wrap = root.querySelector('[data-live-table]')
    return {
      element: window.__FIKA_SLIDES__.getState().slides[0].elements[0],
      scale: window.__FIKA_MAIN__.getState().canvasScale,
      live: live.getBoundingClientRect().height,
      wrapper: wrap.getBoundingClientRect().height,
      rows: [...wrap.querySelector('table').rows].map(row => row.getBoundingClientRect().height),
    }
  })
  const fits = (value, stage) => {
    const floor = Math.max(...value.rows) * value.rows.length
    assert.ok(value.wrapper >= floor - 1, `${stage}: rows remain visible (${value.wrapper} < ${floor})`)
    assert.ok(Math.abs(value.live - value.wrapper) < 1, `${stage}: interaction area matches visible table`)
  }
  for (const [direction, dx, dy] of [['bottom', 0, -120], ['top', 0, 120], ['right', -200, 0]]) {
    await reset()
    const before = await measure()
    const handle = await page.locator(`#operate-element-floor-table [data-resize-handle=${direction}]`).boundingBox()
    const x = handle.x + handle.width / 2, y = handle.y + handle.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + dx, y + dy, { steps: 10 })
    await page.waitForTimeout(150)
    const during = await measure()
    fits(during, `${direction} drag`)
    assert.equal(during.element.height, before.element.height, 'Live resize does not commit on pointer move')
    await page.mouse.up()
    await page.waitForTimeout(400)
    const after = await measure()
    fits(after, `${direction} release`)
    assert.ok(Math.abs(after.live / after.scale - after.element.height) < 1, 'Saved geometry matches the released table')
    if (direction === 'top') assert.ok(Math.abs(after.element.top + after.element.height - before.element.top - before.element.height) < 1, 'Top resize preserves the bottom edge at the content floor')
    if (direction === 'right') assert.ok(after.element.width < before.element.width - 150, 'Width remains resizable while respecting row content')
  }
  console.log('PASS table content floor: bottom/top shrink, fixed opposite edge, width reflow, visible uniform rows, deferred commit, and released interaction geometry.')
} finally { await browser.close() }
