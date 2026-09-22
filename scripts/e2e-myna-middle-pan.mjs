import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173'}/?mode=myna&locale=cs`)
  await page.locator('[data-myna-page-id]').first().waitFor()
  await page.waitForTimeout(1200)
  const state = () => page.evaluate(() => {
    const slides = window.__FIKA_SLIDES__.getState()
    const main = window.__FIKA_MAIN__.getState()
    return { slides: slides.slides, index: slides.slideIndex, selected: main.activeElementIdList }
  })
  const initial = await state()
  const activeId = initial.slides[initial.index].id
  const otherId = await page.locator('[data-myna-page-id]').first().getAttribute('data-myna-page-id')
  const anchor = page.locator(`[data-myna-page-handle="${activeId}"]`)
  const pan = async (target, label) => {
    const before = await state()
    const origin = await anchor.boundingBox()
    const box = await target.boundingBox()
    assert.ok(box, `${label}: visible target`)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down({ button: 'middle' })
    await page.mouse.move(box.x + box.width / 2 + 35, box.y + box.height / 2 + 25, { steps: 8 })
    await page.mouse.up({ button: 'middle' })
    await page.waitForTimeout(100)
    const moved = await anchor.boundingBox()
    assert.ok(Math.abs(moved.x - origin.x - 35) < 2, `${label}: horizontal pan`)
    assert.ok(Math.abs(moved.y - origin.y - 25) < 2, `${label}: vertical pan`)
    assert.deepEqual(await state(), before, `${label}: preserves active page, selection, and document`)
  }
  await pan(page.locator(`[data-myna-page-id="${otherId}"]`), 'inactive page')
  await pan(page.locator(`[data-myna-page-handle="${otherId}"]`), 'inactive page header')
  await pan(anchor, 'active page header')
  await pan(anchor.locator('..'), 'active page body')
  await page.evaluate(() => window.__FIKA_MAIN__.getState().setReadOnly(true))
  await pan(page.locator(`[data-myna-page-id="${otherId}"]`), 'read-only page')
  await page.evaluate(() => window.__FIKA_MAIN__.getState().setReadOnly(false))
  await page.locator(`[data-myna-page-id="${otherId}"]`).click()
  assert.equal((await state()).slides[(await state()).index].id, otherId, 'left click still activates pages')
  assert.deepEqual(errors, [])
  console.log('PASS middle-button pan over active/inactive pages and headers, read-only navigation, and left-click activation')
} finally {
  await browser.close()
}
