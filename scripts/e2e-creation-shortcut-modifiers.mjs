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
  for (const [key, type] of [['t', 'text'], ['r', 'shape'], ['o', 'shape'], ['l', 'line']]) {
    await page.evaluate(() => {
      const store = window.__FIKA_SLIDES__.getState()
      store.setSlides([{ id: 'creation-shortcut', elements: [] }])
      store.updateSlideIndex(0)
      const main = window.__FIKA_MAIN__.getState()
      main.setCreatingElement(null)
      main.setActiveElementIdList([])
      main.setThumbnailsFocus(false)
      main.setEditorareaFocus(true)
      document.activeElement?.blur()
    })
    await page.keyboard.press(`Alt+${key}`)
    const modified = await page.evaluate(() => window.__FIKA_MAIN__.getState().creatingElement)
    console.log({ key, modified })
    try { assert.equal(modified, null, 'Alt-modified keys do not activate creation tools') }
    catch (error) { failures.push(`${key}: ${error.message}`) }
    await page.evaluate(() => window.__FIKA_MAIN__.getState().setCreatingElement(null))
    await page.keyboard.press(key)
    assert.equal(await page.evaluate(() => window.__FIKA_MAIN__.getState().creatingElement?.type), type, 'The unmodified key still activates its tool')
  }
  assert.deepEqual(failures, [])
  assert.deepEqual(errors, [])
} finally { await browser.close() }
