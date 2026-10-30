import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  await page.goto(process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  const state = () => page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements)
  const bounds = elements => ({
    left: Math.min(...elements.map(el => el.left)), top: Math.min(...elements.map(el => el.top)),
    right: Math.max(...elements.map(el => el.left + el.width)), bottom: Math.max(...elements.map(el => el.top + el.height)),
  })
  for (const [direction, dx, dy, shift, tiny] of [
    ['right-bottom', -600, -500], ['left-top', 600, 500],
    ['left-bottom', 600, -500], ['right-top', -600, 500],
    ['right', -600, 0], ['left', 600, 0], ['bottom', 0, -500], ['top', 0, 500],
    ['right-bottom', -600, -500, false, true],
    ['right-bottom', -600, -500, true], ['left-top', 600, 500, true],
  ]) {
    await page.evaluate(tiny => {
      const shape = (id, left, top, width, height) => ({ id, type: 'shape', left, top, width, height, rotate: 0, fill: '#234567', viewBox: [100, 100], path: 'M0 0H100V100H0Z', fixedRatio: false })
      const store = window.__FIKA_SLIDES__.getState()
      store.setSlides([{ id: 'group-min-slide', elements: [shape('one', 100, 100, tiny ? 10 : 100, tiny ? 8 : 80), shape('two', 250, 200, tiny ? 20 : 200, tiny ? 12 : 120), shape('untouched', 600, 350, 100, 100)] }])
      store.updateSlideIndex(0)
      window.__FIKA_MAIN__.getState().setActiveElementIdList(['one', 'two'])
    }, tiny)
    const before = await state(), oldBounds = bounds(before.slice(0, 2))
    if (shift) await page.keyboard.down('Shift')
    const handle = await page.locator(`.multi-select-operate [data-resize-handle="${direction}"]`).boundingBox()
    const x = handle.x + handle.width / 2, y = handle.y + handle.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + dx, y + dy, { steps: 12 })
    assert.deepEqual(await state(), before, 'Group resize remains transient until release')
    const liveBox = await page.locator('.multi-select-operate').boundingBox()
    assert.ok(liveBox.width > 10 && liveBox.height > 10, 'Selection remains usable during the drag')
    await page.mouse.up()
    if (shift) await page.keyboard.up('Shift')
    const after = await state(), newBounds = bounds(after.slice(0, 2))
    assert.ok(after.every((el, i) => el.width >= Math.min(20, before[i].width) - 1e-6 && el.height >= Math.min(20, before[i].height) - 1e-6), `${direction}: members cannot collapse`)
    if (tiny) assert.deepEqual(after, before, 'Already-small imported shapes do not grow at the minimum')
    assert.deepEqual(after[2], before[2], 'Unselected shapes stay unchanged')
    assert.ok(Math.abs(after[1].width / after[0].width - 2) < 1e-6, 'Relative widths are preserved')
    assert.ok(Math.abs(after[1].height / after[0].height - 1.5) < 1e-6, 'Relative heights are preserved')
    for (const edge of [direction.includes('left') ? 'right' : 'left', direction.includes('top') ? 'bottom' : 'top']) {
      assert.ok(Math.abs(oldBounds[edge] - newBounds[edge]) < 1e-6, `${direction}: opposite ${edge} edge stays anchored`)
    }
    if (shift) assert.ok(Math.abs(after[0].width / after[0].height - before[0].width / before[0].height) < 1e-6, 'Shift preserves aspect ratio at the minimum size')
  }
  console.log('PASS group resize minimum: all corners and edges, live selection bounds, deferred commit, relative sizes, fixed opposite edges, Shift aspect ratio, and unselected objects.')
} finally { await browser.close() }
