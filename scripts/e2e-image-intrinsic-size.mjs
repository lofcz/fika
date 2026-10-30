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
  for (const css of ['/* default styles */', 'img { width: 40px !important; height: 40px !important; }', '#fika-portals { display: none !important; }']) {
    await page.evaluate(() => {
      const slides = window.__FIKA_SLIDES__.getState()
      const src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="gray"/></svg>')
      slides.setSlides([{ id: 'invalid-replacement', elements: [{ id: 'image', type: 'image', src, left: 100, top: 100, width: 200, height: 100, rotate: 0, fixedRatio: false }] }])
      slides.updateSlideIndex(0)
      window.__FIKA_MAIN__.getState().setActiveElementIdList(['image'])
    })
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.evaluate(() => window.__FIKA_MAIN__.getState().setToolbarState('elStyle'))
    const input = page.locator('[class*="file-input"]').filter({ has: page.getByRole('button', { name: 'Replace image', exact: true }) }).locator('input[type=file]')
    const hostStyle = await page.addStyleTag({ content: css })
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="red"/></svg>'
    const src = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
    await input.setInputFiles({ name: 'valid.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) })
    await page.waitForFunction(src => window.__FIKA_SLIDES__.getState().slides[0].elements[0].src === src, src)
    const element = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0])
    console.log({ css, width: element.width, height: element.height, left: element.left })
    try {
      assert.equal(element.width, 200, 'Replacement keeps the intrinsic 2:1 aspect ratio')
      assert.equal(element.height, 100)
      assert.equal(element.left, 100)
    } catch (error) { failures.push(error.message) }
    await hostStyle.evaluate(node => node.remove())
  }
  assert.deepEqual(failures, [])
  assert.deepEqual(errors, [])
  console.log('PASS image sizing with default styles, constrained images, and hidden portals')
} finally {
  await browser.close()
}
