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
    store.setSlides([{ id: 'remark-caret', elements: [], remark: '<p>Alpha omega</p>' }])
    store.updateSlideIndex(0)
  })
  const editor = page.locator('.remark .ProseMirror')
  await editor.waitFor()
  await page.waitForTimeout(400)
  await editor.click()
  await editor.evaluate(element => {
    const text = element.querySelector('p').firstChild
    window.getSelection().setBaseAndExtent(text, 5, text, 5)
  })
  await page.waitForTimeout(50)
  assert.equal(await page.evaluate(() => window.getSelection()?.anchorOffset), 5)
  await page.keyboard.insertText('X')
  const before = await page.evaluate(() => window.getSelection()?.anchorOffset)
  await page.waitForTimeout(500)
  const after = await page.evaluate(() => window.getSelection()?.anchorOffset)
  await page.keyboard.insertText('Y')
  await page.waitForTimeout(400)
  const text = await editor.textContent()
  console.log({ before, after, text })
  assert.equal(after, before, 'Saving keeps the caret at the insertion point')
  assert.equal(text, 'AlphaXY omega', 'Typing after autosave continues at the same position')
  await page.evaluate(() => document.activeElement?.blur())
  await page.evaluate(() => window.__FIKA_SLIDES__.getState().updateSlide({ remark: '<p>External update</p>' }))
  await page.waitForTimeout(400)
  assert.equal(await editor.textContent(), 'External update', 'Real external document changes still synchronize')
  assert.deepEqual(errors, [])
  console.log('PASS speaker-note autosave preserves the caret and external updates still render')
} finally { await browser.close() }
