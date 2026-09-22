import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const errors = []
page.on('pageerror', error => errors.push(error.message))
const base = process.env.FIKA_TEST_URL || 'http://127.0.0.1:5178'
const gallery = page.locator('[data-myna-elements]')
const elements = () => page.evaluate(() => { const s = window.__FIKA_SLIDES__.getState(); return s.slides[s.slideIndex].elements })
async function insert(locator, type) {
  const before = (await elements()).length
  await locator.click()
  await page.waitForFunction(count => { const s = window.__FIKA_SLIDES__.getState(); return s.slides[s.slideIndex].elements.length === count + 1 }, before)
  assert.equal((await elements()).at(-1).type, type)
}
try {
  await page.goto(`${base}/?mode=myna&locale=en`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Elements', exact: true }).click()
  await gallery.waitFor()
  for (const width of [240, 300, 440]) {
    await page.locator('#myna-library').evaluate((element, width) => element.style.setProperty('--drawer-width', `${width}px`), width)
    const overflow = await gallery.evaluate(element => {
      const root = element.getBoundingClientRect()
      return [...element.querySelectorAll('button,input,summary,svg')].filter(child => {
        const rect = child.getBoundingClientRect()
        return rect.width > 0 && (rect.right > root.right + 1 || rect.left < root.left - 1)
      }).map(child => ({ tag: child.tagName, text: child.textContent, width: child.getBoundingClientRect().width }))
    })
    assert.deepEqual(overflow, [], `Tiles overflow at ${width}px`)
    const scroll = await page.locator('#myna-library').evaluate(element => [...element.querySelectorAll('div,fieldset')].filter(child => child.scrollWidth > child.clientWidth + 1 && child.clientWidth > 0).map(child => ({ class: child.className, scroll: child.scrollWidth, width: child.clientWidth })))
    assert.deepEqual(scroll, [], `Drawer horizontal scrolling at ${width}px`)
  }
  const circle = gallery.locator('[data-myna-frames=frames] button').filter({ hasText: 'Circle' })
  const preview = await circle.locator('svg').evaluate(svg => ({ width: svg.getBoundingClientRect().width, height: svg.getBoundingClientRect().height, circles: svg.querySelectorAll('circle').length }))
  assert.ok(Math.abs(preview.width - preview.height) < 1 && preview.circles > 0, 'Circle preview stays circular')
  await gallery.getByRole('searchbox').fill('QR')
  assert.equal(await gallery.locator('[data-myna-frames]').count(), 0)
  await gallery.getByRole('button', { name: 'QR code', exact: true }).click()
  await gallery.locator('[data-myna-qr]').waitFor()
  assert.equal(await gallery.locator('details').count(), 0, 'QR editor is not an accordion')
  await gallery.getByRole('button', { name: 'All elements', exact: true }).click()
  await gallery.getByRole('searchbox').fill('')
  await gallery.getByRole('button', { name: 'Shape', exact: true }).click()
  await insert(gallery.locator('[data-shape-item]').first(), 'shape')
  await gallery.getByRole('button', { name: 'Lines & arrows', exact: true }).click()
  await insert(gallery.locator('[data-line-item]').first(), 'line')
  await gallery.getByRole('button', { name: 'Charts', exact: true }).click()
  for (const type of ['bar', 'column', 'line', 'area', 'scatter', 'pie', 'ring', 'radar']) {
    await insert(gallery.locator(`[data-chart-type="${type}"]`), 'chart')
    assert.equal((await elements()).at(-1).chartType, type)
  }
  await gallery.getByRole('searchbox', { name: 'Search', exact: true }).fill('radar')
  assert.equal(await gallery.locator('[data-chart-type]').count(), 1)
  await gallery.getByRole('searchbox').fill('not-present-anywhere')
  assert.equal(await gallery.locator('[data-chart-type]').count(), 0)
  await gallery.getByText('No matches found', { exact: true }).waitFor()
  await gallery.getByRole('searchbox').fill('')
  await gallery.getByRole('button', { name: 'Table', exact: true }).click()
  await insert(gallery.locator('[data-table-cell="4x5"]'), 'table')
  const table = (await elements()).at(-1)
  assert.equal(table.data.length, 4)
  assert.equal(table.data[0].length, 5)
  await gallery.locator('[data-table-cell="2x2"]').focus()
  await page.keyboard.press('Enter')
  assert.equal((await elements()).at(-1).data.length, 2)
  assert.equal((await elements()).at(-1).data[0].length, 2)
  await gallery.getByRole('button', { name: 'Draw', exact: true }).click()
  for (const type of ['scribble', 'polygon']) {
    await gallery.locator(`[data-myna-drawing="${type}"]`).click()
    assert.equal(await page.evaluate(() => window.__FIKA_MAIN__.getState().creatingCustomShape), type)
    await page.evaluate(() => window.__FIKA_MAIN__.getState().setCreatingCustomShapeState(null))
  }
  await page.evaluate(() => window.__FIKA_MAIN__.getState().setReadOnly(true))
  for (const button of await gallery.locator('[data-myna-drawing]').all()) assert.equal(await button.isDisabled(), true)
  assert.deepEqual(errors, [])
  console.log('Myna elements: responsive 240/300/440px gallery, filters/search, shapes, lines, all eight charts, table, drawing and read-only passed.')
} finally { await browser.close() }
