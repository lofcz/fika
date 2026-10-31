import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173/'}?locale=en`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  const failures = []
  for (const sameText of [false, true]) {
    await page.evaluate(same => {
      const store = window.__FIKA_SLIDES__.getState()
      store.setSlides([{ id: 'first', elements: [], remark: '<p>First</p>' }, { id: 'second', elements: [], remark: same ? '<p>First</p>' : '<p>Second</p>' }])
      store.updateSlideIndex(0)
    }, sameText)
    const editor = page.locator('.remark .ProseMirror')
    await editor.waitFor()
    await page.waitForTimeout(400)
    await editor.click()
    await page.keyboard.press('Control+a')
    await page.keyboard.insertText('Changed first')
    await page.evaluate(() => window.__FIKA_SLIDES__.getState().updateSlideIndex(1))
    await page.waitForTimeout(500)
    const remarks = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides.map(slide => {
      const node = document.createElement('div')
      node.innerHTML = slide.remark
      return node.textContent
    }))
    console.log({ sameText, remarks })
    try {
      assert.deepEqual(remarks, ['Changed first', sameText ? 'First' : 'Second'], 'Typing immediately before switching saves only to the originating slide')
      assert.equal(await editor.textContent(), sameText ? 'First' : 'Second')
      assert.equal(await page.evaluate(() => window.__FIKA_MAIN__.getState().disableHotkeys), false, 'Switching away from notes restores editor shortcuts')
    } catch (error) { failures.push(error.message) }
  }
  assert.deepEqual(errors, [])
  assert.deepEqual(failures, [])
  console.log('PASS speaker-note drafts survive immediate slide switching')
} finally { await browser.close() }
