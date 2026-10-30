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
    window.loadedImages = []
    const create = document.createElement.bind(document)
    document.createElement = function(tag, ...args) {
      const node = create(tag, ...args)
      if (tag.toLowerCase() === 'img') node.addEventListener('load', () => setTimeout(() => window.loadedImages.push(node.src), 0))
      return node
    }
  })
  const failures = []
  for (const [width, height] of [[200, 0], [0, 100], [0, 0]]) {
    await page.evaluate(() => {
      const slides = window.__FIKA_SLIDES__.getState()
      const src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="gray"/></svg>')
      slides.setSlides([{ id: 'zero-size', elements: [{ id: 'image', type: 'image', src, left: 100, top: 100, width: 200, height: 100, rotate: 0, fixedRatio: false }] }])
      slides.updateSlideIndex(0)
      window.__FIKA_MAIN__.getState().setActiveElementIdList(['image'])
    })
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.evaluate(() => window.__FIKA_MAIN__.getState().setToolbarState('elStyle'))
    const input = page.locator('[class*="file-input"]').filter({ has: page.getByRole('button', { name: 'Replace image', exact: true }) }).locator('input[type=file]')
    const before = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0])
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="200" height="100" fill="red"/></svg>`
    const src = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
    await input.setInputFiles({ name: 'zero.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) })
    await page.waitForFunction(src => window.loadedImages.includes(src), src)
    const after = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0])
    console.log({ source: [width, height], result: { width: after.width, height: after.height, left: after.left } })
    try {
      assert.deepEqual(after, before, 'Zero-size replacement leaves the existing image intact')
      assert.ok(await page.getByText('Unable to read or parse this file', { exact: true }).count(), 'Unusable dimensions produce error feedback')
    } catch (error) { failures.push(error.message) }
  }
  assert.deepEqual(failures, [])
  assert.deepEqual(errors, [])
  console.log('PASS zero-width, zero-height, and zero-area image replacements')
} finally {
  await browser.close()
}
