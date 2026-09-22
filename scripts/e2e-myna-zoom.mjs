import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const errors = []
page.on('pageerror', e => errors.push(e.message))
try {
  await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5178'}/?mode=myna&locale=en`, { waitUntil: 'networkidle' })
  await page.locator('[data-myna-zoom]').waitFor()
  assert.equal(await page.getByRole('button', { name: 'Fit selection', exact: true }).isDisabled(), true)
  await page.evaluate(() => {
    const state = window.__FIKA_SLIDES__.getState()
    const template = state.slides[state.slideIndex].elements.find(element => element.type === 'shape')
    const elements = [
      { ...template, id: 'fit-a', left: -220, top: 400, width: 160, height: 100, rotate: 45, groupId: 'fit-group' },
      { ...template, id: 'fit-b', left: 100, top: 550, width: 150, height: 140, rotate: -30, groupId: 'fit-group' },
    ]
    state.addElement(elements)
    const main = window.__FIKA_MAIN__.getState()
    main.setActiveElementIdList(elements.map(e => e.id)); main.setHandleElementId('')
  })
  await page.locator('[data-myna-inspector]').waitFor()
  const selection = page.getByRole('button', { name: 'Fit selection', exact: true })
  await selection.click()
  const measure = () => page.evaluate(() => {
    const main = window.__FIKA_MAIN__.getState(), s = window.__FIKA_SLIDES__.getState()
    const canvas = document.querySelector('.canvas').getBoundingClientRect()
    const viewport = document.querySelector('.canvas .viewport-wrapper').getBoundingClientRect()
    const corners = s.slides[s.slideIndex].elements.filter(e => main.activeElementIdList.includes(e.id)).flatMap(e => {
      const angle = e.rotate * Math.PI / 180, cx = e.left + e.width / 2, cy = e.top + e.height / 2
      return [[-e.width/2,-e.height/2],[e.width/2,-e.height/2],[e.width/2,e.height/2],[-e.width/2,e.height/2]].map(([x,y]) => ({ x: viewport.left + (cx + x*Math.cos(angle) - y*Math.sin(angle))*main.canvasScale, y: viewport.top + (cy + x*Math.sin(angle) + y*Math.cos(angle))*main.canvasScale }))
    })
    return { scale: main.canvasScale, left: viewport.left, top: viewport.top, bounds: { left: Math.min(...corners.map(p=>p.x)), right: Math.max(...corners.map(p=>p.x)), top: Math.min(...corners.map(p=>p.y)), bottom: Math.max(...corners.map(p=>p.y)) }, canvas: {left:canvas.left,right:canvas.right,top:canvas.top,bottom:canvas.bottom} }
  })
  await page.waitForFunction(() => window.__FIKA_MAIN__.getState().canvasDragged)
  let result = await measure()
  await mkdir('output/myna', { recursive: true })
  await page.screenshot({ path: 'output/myna/parity-zoom.png' })
  assert.ok(result.bounds.left >= result.canvas.left + 55, 'Rotated group left bound clears ruler and padding')
  assert.ok(result.bounds.top >= result.canvas.top + 55, 'Rotated group top bound clears ruler and padding')
  assert.ok(result.bounds.right <= result.canvas.right - 31, 'Rotated group right bound fits')
  assert.ok(result.bounds.bottom <= result.canvas.bottom - 31, 'Rotated group bottom bound fits')
  await selection.click()
  assert.deepEqual(await measure(), result, 'Repeated fit does not drift')
  await page.locator('[data-myna-zoom]').getByRole('combobox', { name: 'Zoom', exact: true }).selectOption('100')
  await page.waitForFunction(() => Math.abs(window.__FIKA_MAIN__.getState().canvasScale - 1) < .001)
  await page.getByRole('button', { name: 'Fit', exact: true }).click()
  await page.waitForFunction(() => !window.__FIKA_MAIN__.getState().canvasDragged)
  await selection.click()
  result = await measure()
  assert.ok(result.bounds.right <= result.canvas.right - 31)
  await page.setViewportSize({ width: 1000, height: 1000 })
  await selection.click()
  result = await measure()
  const overlayLeft = await page.locator('#myna-properties').evaluate(element => element.getBoundingClientRect().left)
  assert.ok(result.bounds.right <= overlayLeft - 31, 'Selection clears the overlay inspector')
  await page.setViewportSize({ width: 600, height: 1000 })
  await page.getByRole('button', { name: 'Design', exact: true }).click()
  await selection.click()
  result = await measure()
  const narrowOverlayLeft = await page.locator('#myna-properties').evaluate(element => element.getBoundingClientRect().left)
  assert.ok(result.bounds.right <= narrowOverlayLeft - 31, 'Selection clears the overlay inspector at600px')
  assert.deepEqual(errors, [])
  console.log('Myna zoom: rotated off-page group fits with ruler padding; stable repeated fit; exact zoom and page-fit recovery passed.')
} finally { await browser.close() }
