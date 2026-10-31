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
  for (const target of ['single', 'multi']) {
    for (const label of ['Border width:', 'Border radius:']) {
      await page.evaluate(target => {
        const slides = window.__FIKA_SLIDES__.getState()
        slides.setSlides([{ id: 'border-undo', elements: ['first', 'second'].map((id, i) => ({
          id, type: 'shape', left: 100 + i * 250, top: 100, width: 180, height: 100,
          rotate: 0, viewBox: [180, 100], path: 'M 0 0 H 180 V 100 H 0 Z', fill: '#123456', fixedRatio: false,
          outline: { width: 2 + i, radius: .1 * i, color: '#123456', style: 'solid' },
        })) }])
        slides.updateSlideIndex(0)
        window.__FIKA_MAIN__.getState().setActiveElementIdList(target === 'single' ? ['first'] : ['first', 'second'])
      }, target)
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      await page.evaluate(target => window.__FIKA_MAIN__.getState().setToolbarState(target === 'single' ? 'elStyle' : 'multiStyle'), target)
      await page.waitForTimeout(400)
      await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().initSnapshotDatabase())
      const slider = page.locator('.field').filter({ has: page.getByText(label, { exact: true }) }).locator('div').first()
      await slider.scrollIntoViewIfNeeded()
      const readElements = () => page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements)
      const before = await readElements()
      const track = await slider.boundingBox()
      await slider.click({ position: { x: track.width / 4, y: track.height / 2 } })
      await page.waitForFunction(() => window.__FIKA_SNAPSHOT__.getState().snapshotCursor === 1)
      const added = await readElements()
      await page.mouse.move(track.x + track.width * .6, track.y + track.height / 2)
      await page.mouse.down()
      await page.evaluate(() => {
        document.activeElement?.blur()
        window.__FIKA_MAIN__.getState().setThumbnailsFocus(false)
        window.__FIKA_MAIN__.getState().setEditorareaFocus(true)
      })
      await page.keyboard.press('Control+z')
      await page.waitForFunction(() => window.__FIKA_SNAPSHOT__.getState().snapshotCursor === 0)
      assert.deepEqual(await readElements(), before, 'Undo restores the original borders')
      await page.mouse.move(track.x + track.width * .7, track.y + track.height / 2, { steps: 4 })
      await page.mouse.up()
      await page.waitForTimeout(350)
      const after = await readElements()
      console.log({ target, label, before, after })
      try { assert.deepEqual(after, before, 'Releasing a drag after Undo must not overwrite the restored borders') }
      catch (error) { failures.push(`${target}: ${error.message}`) }
      assert.equal(await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().snapshotCursor), 0, 'Canceled drag does not add history')
      await page.evaluate(() => {
        document.activeElement?.blur()
        window.__FIKA_MAIN__.getState().setThumbnailsFocus(false)
        window.__FIKA_MAIN__.getState().setEditorareaFocus(true)
      })
      await page.keyboard.press('Control+y')
      await page.waitForFunction(() => window.__FIKA_SNAPSHOT__.getState().snapshotCursor === 1)
      assert.deepEqual(await readElements(), added, 'Redo restores the original committed borders')
    }
  }
  assert.deepEqual(failures, [])
  assert.deepEqual(errors, [])
} finally { await browser.close() }
