import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173/'}?locale=en`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  await page.route('**/invalid-poster-video.webm', route => route.fulfill({ status: 200, contentType: 'video/webm', body: 'not a video' }))
  await page.evaluate(async () => {
    const slides = window.__FIKA_SLIDES__.getState()
    const poster = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="gray"/></svg>')
    slides.setSlides([{ id: 'failed-poster', elements: [{ id: 'video', type: 'video', left: 100, top: 100, width: 200, height: 100, rotate: 0, src: location.origin + '/invalid-poster-video.webm', poster, autoplay: false }] }])
    slides.updateSlideIndex(0)
    await window.__FIKA_SNAPSHOT__.getState().initSnapshotDatabase()
    window.__FIKA_MAIN__.getState().setActiveElementIdList(['video'])
    const original = HTMLMediaElement.prototype.load
    window.finishedPosterProbes = 0
    HTMLMediaElement.prototype.load = function() {
      if (this.style.left === '-9999px' && !this.hasAttribute('src')) setTimeout(() => window.finishedPosterProbes++, 0)
      return original.call(this)
    }
  })
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await page.evaluate(() => window.__FIKA_MAIN__.getState().setToolbarState('elStyle'))
  const before = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
  await page.getByRole('button', { name: 'Generate preview automatically', exact: true }).click()
  await page.waitForFunction(() => window.finishedPosterProbes > 0)
  const after = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
  console.log({ retained: after[0].elements[0].poster === before[0].elements[0].poster })
  assert.deepEqual(after, before, 'Failed generation preserves the existing cover and document')
  assert.ok(await page.getByText('Unable to read or parse this file', { exact: true }).count(), 'Generation failure is reported')
  assert.equal(await page.getByRole('button', { name: 'Generate preview automatically', exact: true }).isEnabled(), true)
  await page.waitForTimeout(350)
  assert.equal(await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().snapshotCursor), 0, 'Failure creates no history entry')
  assert.deepEqual(errors, [])
} finally { await browser.close() }
