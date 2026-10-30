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
    window.failedImageNodes = []
    const create = document.createElement.bind(document)
    document.createElement = function(tag, ...args) {
      const node = create(tag, ...args)
      if (tag.toLowerCase() === 'img') node.addEventListener('error', () => setTimeout(() => window.failedImageNodes.push(node), 0))
      return node
    }
    const slides = window.__FIKA_SLIDES__.getState()
    const src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="gray"/></svg>')
    slides.setSlides([{ id: 'invalid-replacement', elements: [{ id: 'image', type: 'image', src, left: 100, top: 100, width: 200, height: 100, rotate: 0, fixedRatio: false }] }])
    slides.updateSlideIndex(0)
    window.__FIKA_MAIN__.getState().setActiveElementIdList(['image'])
  })
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await page.evaluate(() => window.__FIKA_MAIN__.getState().setToolbarState('elStyle'))
  const input = page.locator('[class*="file-input"]').filter({ has: page.getByRole('button', { name: 'Replace image', exact: true }) }).locator('input[type=file]')
  const before = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0])
  await input.setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not an image') })
  await page.waitForFunction(() => window.failedImageNodes.length > 0)
  const leaked = await page.evaluate(() => window.failedImageNodes.filter(node => node.isConnected).length)
  const notified = await page.getByText('Unable to read or parse this file', { exact: true }).count()
  console.log({ leaked, notified })
  assert.deepEqual(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0]), before)
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="red"/></svg>'
  const src = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
  await input.setInputFiles({ name: 'valid.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) })
  await page.waitForFunction(src => window.__FIKA_SLIDES__.getState().slides[0].elements[0].src === src, src)
  assert.equal(leaked, 0, 'Failed image probes are removed from the document')
  assert.equal(notified, 1, 'Invalid replacement reports a readable error')
  assert.deepEqual(errors, [])
  console.log('PASS invalid replacement cleanup, unchanged document, error feedback, and valid retry')
} finally {
  await browser.close()
}
