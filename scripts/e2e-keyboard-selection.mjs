import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  await page.evaluate(() => {
    const shape = (id, left, lock = false) => ({ id, type: 'shape', left, top: 100, width: 100, height: 80, rotate: 0, fill: '#234567', viewBox: [100, 100], path: 'M0 0H100V100H0Z', fixedRatio: false, lock })
    const store = window.__FIKA_SLIDES__.getState()
    store.setSlides([{ id: 'tab-slide', elements: [shape('locked', 100, true), shape('hidden', 250), shape('first', 400), shape('second', 550), shape('third', 700)] }])
    store.updateSlideIndex(0)
    window.__FIKA_MAIN__.setState({ activeElementIdList: [], handleElementId: '', hiddenElementIdList: ['hidden'], editorAreaFocus: true, thumbnailsFocus: false, disableHotkeys: false })
    document.activeElement?.blur()
  })
  const selection = () => page.evaluate(() => window.__FIKA_MAIN__.getState().activeElementIdList)
  for (const [key, expected] of [
    ['Tab', 'first'], ['Tab', 'second'], ['Tab', 'third'], ['Tab', 'first'],
    ['Shift+Tab', 'third'], ['Shift+Tab', 'second'], ['Shift+Tab', 'first'],
  ]) {
    await page.keyboard.press(key)
    assert.deepEqual(await selection(), [expected], `${key} cycles only visible, unlocked objects`)
  }
  await page.keyboard.press('ArrowRight')
  const positions = await page.evaluate(() => Object.fromEntries(window.__FIKA_SLIDES__.getState().slides[0].elements.map(el => [el.id, el.left])))
  assert.deepEqual(positions, { locked: 100, hidden: 250, first: 401, second: 550, third: 700 }, 'Keyboard nudges only the selectable object')
  await page.evaluate(() => window.__FIKA_MAIN__.getState().setActiveElementIdList([]))
  await page.keyboard.press('Shift+Tab')
  assert.deepEqual(await selection(), ['third'], 'Reverse navigation starts at the last eligible object')
  await page.evaluate(() => {
    window.__FIKA_MAIN__.getState().setHiddenElementIdList(['hidden', 'first', 'second', 'third'])
  })
  await page.keyboard.press('Tab')
  assert.deepEqual(await selection(), [], 'All hidden or locked objects leave an empty selection')
  await page.keyboard.press('Shift+Tab')
  assert.deepEqual(await selection(), [])
  await page.evaluate(() => {
    window.__FIKA_SLIDES__.getState().updateSlide({ elements: [] })
  })
  await page.keyboard.press('Tab')
  assert.deepEqual(await selection(), [], 'Empty pages are safe')
  assert.deepEqual(errors, [])
  console.log('PASS keyboard selection: forward/reverse wrap, locked and hidden objects skipped, safe nudging, reverse entry, all-unavailable and empty pages.')
} finally { await browser.close() }
