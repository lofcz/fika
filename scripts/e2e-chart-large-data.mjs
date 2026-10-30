import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { ensureDevServer } from './lib/dev-server.mjs'
const { url, child } = await ensureDevServer()
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
  await page.goto(`${url}?locale=en`, { waitUntil: 'domcontentloaded' })
  await page.locator('.viewport-wrapper').first().waitFor({ state: 'visible' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  const expected = { labels: Array.from({ length: 35 }, (_, i) => `Category ${i + 1}`), legends: Array.from({ length: 8 }, (_, i) => `Series ${i + 1}`), series: Array.from({ length: 8 }, (_, c) => Array.from({ length: 35 }, (_, r) => c * 100 + r + 1)) }
  await page.evaluate(data => {
    const s = window.__FIKA_SLIDES__.getState()
    s.setSlides([{ id: 'chart-slide', elements: [{ id: 'large-chart', type: 'chart', left: 100, top: 100, width: 500, height: 300, rotate: 0, chartType: 'bar', themeColors: ['#4472c4'], data }] }])
    s.updateSlideIndex(0)
  }, expected)
  const point = await page.evaluate(() => {
    const r = [...document.querySelectorAll('.viewport-wrapper')].map(el => el.getBoundingClientRect()).sort((a, b) => b.width - a.width)[0]
    const scale = window.__FIKA_MAIN__.getState().canvasScale
    return { x: r.x + 200 * scale, y: r.y + 200 * scale }
  })
  await page.mouse.dblclick(point.x, point.y)
  await page.locator('#cell-1-1').waitFor({ state: 'visible' })
  assert.equal(await page.locator('#cell-35-8').inputValue(), '735', 'The final category and series are available for editing')
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  await page.locator('#cell-1-1').waitFor({ state: 'hidden' })
  const actual = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0].data)
  assert.deepEqual(actual, expected, 'Opening and confirming a chart must preserve categories and series beyond the initial grid size')
  console.log('PASS large chart data survives opening and confirming the editor')
  await page.mouse.dblclick(point.x, point.y)
  await page.locator('#cell-1-1').fill('9999')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.locator('#cell-1-1').waitFor({ state: 'hidden' })
  await page.mouse.dblclick(point.x, point.y)
  await page.locator('#cell-1-1').waitFor({ state: 'visible' })
  assert.equal(await page.locator('#cell-1-1').inputValue(), '1', 'Cancelling chart edits discards unsaved input when reopening the same chart')
  console.log('PASS cancelling and reopening chart data discards unsaved edits')
} finally {
  await browser.close()
  child?.kill()
}
