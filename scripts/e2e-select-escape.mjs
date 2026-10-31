import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173/'}?locale=en`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  await page.evaluate(() => {
    const store = window.__FIKA_SLIDES__.getState()
    store.setSlides([{ id: 'escape', elements: [{ id: 'text', type: 'text', left: 100, top: 100, width: 500, height: 100, rotate: 0, defaultFontName: 'Arial', defaultColor: '#000000', content: '<p>Hello</p>' }] }])
    store.updateSlideIndex(0)
    window.__FIKA_MAIN__.getState().setActiveElementIdList(['text'])
  })
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await page.evaluate(() => window.__FIKA_MAIN__.getState().setToolbarState('elStyle'))
  const select = page.locator('[class*="select-wrap"]').filter({ hasText: 'Arial' }).first()
  await select.click()
  const search = page.locator('[data-tippy-root] input:visible').first()
  await search.waitFor()
  await search.fill('Times')
  await page.evaluate(() => {
    window.escapeReleases = 0
    document.addEventListener('keyup', event => {
      if (event.key === 'Escape') window.escapeReleases++
    })
  })
  const before = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  assert.equal(await search.isVisible(), false, 'Escape closes the font dropdown while its search input is focused')
  assert.equal(await page.evaluate(() => window.escapeReleases), 0, 'The same Escape does not also reach a containing dialog')
  assert.deepEqual(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides), before)
  await select.click()
  await search.waitFor()
  assert.equal(await search.inputValue(), '', 'Reopening resets the search')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  assert.equal(await search.isVisible(), false)
  await page.locator('body').click({ position: { x: 1, y: 1 } })
  await page.keyboard.press('Escape')
  assert.equal(await page.evaluate(() => window.escapeReleases), 1, 'Escape outside the closed dropdown remains available')
  assert.deepEqual(errors, [])
  console.log('PASS Escape dismisses searchable dropdowns without changing the document')
} finally { await browser.close() }
