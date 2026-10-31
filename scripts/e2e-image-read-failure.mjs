import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
try {
  const failures = []
  for (const failure of ['abort', 'error']) for (const target of ['image', 'shape', 'background', 'video']) {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173/'}?locale=en`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
    await page.evaluate(({ failure, target }) => {
      window.readFailed = false
      const read = FileReader.prototype.readAsDataURL
      FileReader.prototype.readAsDataURL = function(file) {
        if (file.name !== 'broken.png') return read.call(this, file)
        if (failure === 'abort') {
          read.call(this, file)
          this.abort()
        }
        else this.dispatchEvent(new ProgressEvent('error'))
        window.readFailed = true
      }
      const slides = window.__FIKA_SLIDES__.getState()
      const src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="gray"/></svg>')
      const base = { id: 'image', left: 100, top: 100, width: 200, height: 100, rotate: 0 }
      const element = target === 'shape'
        ? { ...base, type: 'shape', viewBox: [200, 100], path: 'M0 0H200V100H0Z', fill: '#fff', pattern: src, fixedRatio: false }
        : target === 'video' ? { ...base, type: 'video', src: '', poster: src, autoplay: false }
          : { ...base, type: 'image', src, fixedRatio: false }
      slides.setSlides([{ id: 'invalid-replacement', elements: target === 'background' ? [] : [element], background: { type: 'image', image: { src, size: 'cover' } } }])
      slides.updateSlideIndex(0)
      window.__FIKA_MAIN__.getState().setActiveElementIdList(target === 'background' ? [] : ['image'])
    }, { failure, target })
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.evaluate(target => window.__FIKA_MAIN__.getState().setToolbarState(target === 'background' ? 'slideDesign' : 'elStyle'), target)
    const input = target === 'shape' ? page.locator('[class*="pattern-image"]:visible').locator('..').locator('input[type=file]')
      : target !== 'image' ? page.locator('[class*="background-image"]:visible').locator('..').locator('input[type=file]')
        : page.locator('[class*="file-input"]').filter({ has: page.getByRole('button', { name: 'Replace image', exact: true }) }).locator('input[type=file]')
    const before = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0])
    await input.setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not an image') })
    await page.waitForFunction(() => window.readFailed)
    await page.waitForTimeout(150)
    const notified = await page.getByText('Unable to read or parse this file', { exact: true }).count()
    console.log({ failure, target, notified })
    assert.deepEqual(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0]), before)
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="red"/></svg>'
    const src = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
    await input.setInputFiles({ name: 'valid.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) })
    await page.waitForFunction(({ src, target }) => {
      const slide = window.__FIKA_SLIDES__.getState().slides[0]
      return (target === 'background' ? slide.background.image.src : slide.elements[0][target === 'shape' ? 'pattern' : target === 'video' ? 'poster' : 'src']) === src
    }, { src, target })
    if (notified !== 1) failures.push(`${target}/${failure}: missing file-read error notification`)
    assert.deepEqual(errors, [])
    await page.close()
  }
  assert.deepEqual(failures, [])
} finally {
  await browser.close()
}
