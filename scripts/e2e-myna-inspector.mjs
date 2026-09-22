import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const errors = []
page.on('pageerror', error => errors.push(error.message))
const base = process.env.FIKA_TEST_URL || 'http://127.0.0.1:5178'
const inspector = page.locator('[data-myna-inspector]')
const select = async type => {
  await page.evaluate(type => {
    const state = window.__FIKA_SLIDES__.getState()
    const element = state.slides[state.slideIndex].elements.find(element => element.type === type)
    if (!element) throw new Error(`No ${type} fixture`)
    const main = window.__FIKA_MAIN__.getState()
    main.setActiveElementIdList([element.id]); main.setHandleElementId(element.id)
  }, type)
  await page.waitForFunction(type => document.querySelector('[data-myna-inspector]')?.getAttribute('data-selection-kind') === type, type)
}
try {
  await page.goto(`${base}/?mode=myna&locale=en`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Properties', exact: true }).click()
  await inspector.waitFor()
  assert.equal(await inspector.getAttribute('data-selection-kind'), 'page')
  await select('text')
  await inspector.getByText('Typography and effects', { exact: true }).waitFor()
  await mkdir('output/myna', { recursive: true })
  await page.screenshot({ path: 'output/myna/parity-inspector.png' })
  for (const width of [240, 300, 440]) {
    await page.locator('#myna-properties').evaluate((element, width) => element.style.setProperty('--drawer-width', `${width}px`), width)
    assert.equal(await inspector.evaluate(element => element.scrollWidth <= element.clientWidth + 1), true, `Text inspector overflows at ${width}`)
  }
  await inspector.locator('[data-align="left"]').click()
  assert.equal(await page.evaluate(() => {
    const s = window.__FIKA_SLIDES__.getState(); const id = window.__FIKA_MAIN__.getState().handleElementId
    return s.slides[s.slideIndex].elements.find(element => element.id === id).left
  }), 0)
  const geometry = inspector.locator('details').filter({ has: page.locator('summary', { hasText: 'Position and size' }) })
  await geometry.locator('summary').focus(); await page.keyboard.press('Enter')
  assert.equal(await geometry.getAttribute('open'), null)
  await geometry.locator('summary').press('Enter')
  assert.notEqual(await geometry.getAttribute('open'), null)
  await page.getByRole('button', { name: 'Elements', exact: true }).click()
  const gallery = page.locator('[data-myna-elements]')
  await gallery.getByRole('button', { name: 'Charts', exact: true }).click()
  await gallery.locator('[data-chart-type="column"]').click()
  await select('chart')
  await gallery.getByRole('button', { name: 'Table', exact: true }).click()
  await gallery.locator('[data-table-cell="3x3"]').click()
  await select('table')
  // Seed an inline image to exercise the actual native image controls without a network dependency.
  await page.evaluate(() => {
    window.__FIKA_SLIDES__.getState().addElement({ id: 'inspector-image', type: 'image', left: 100, top: 100, width: 200, height: 200, rotate: 0, fixedRatio: true, src: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect width="200" height="200" fill="%2327272a"/%3E%3C/svg%3E' })
  })
  for (const type of ['text', 'image', 'table', 'chart']) {
    await select(type)
    for (const width of [240, 300, 440]) {
      await page.locator('#myna-properties').evaluate((element, width) => element.style.setProperty('--drawer-width', `${width}px`), width)
      assert.equal(await inspector.evaluate(element => element.scrollWidth <= element.clientWidth + 1), true, `${type} inspector overflows at ${width}`)
    }
  }
  await select('image')
  await inspector.getByRole('button', { name: /crop image/i }).click()
  assert.equal(await page.evaluate(() => window.__FIKA_MAIN__.getState().clipingImageElementId), 'inspector-image')
  await page.keyboard.press('Escape')
  await page.evaluate(() => {
    const s = window.__FIKA_SLIDES__.getState(); const main = window.__FIKA_MAIN__.getState()
    main.setActiveElementIdList(s.slides[s.slideIndex].elements.slice(0, 2).map(element => element.id))
    main.setHandleElementId('')
  })
  await page.waitForFunction(() => document.querySelector('[data-myna-inspector]')?.getAttribute('data-selection-kind') === 'multi')
  await inspector.getByText('Align, distribute and arrange', { exact: true }).waitFor()
  await page.evaluate(() => window.__FIKA_MAIN__.getState().setReadOnly(true))
  assert.equal(await inspector.locator('fieldset:not([disabled])').count(), 0)
  assert.deepEqual(errors, [])
  console.log('Myna inspector: page/text/image/table/chart/multiple contexts; 240/300/440px widths; native alignment and crop; keyboard collapse; read-only passed.')
} finally { await browser.close() }
