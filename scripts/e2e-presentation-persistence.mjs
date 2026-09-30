import assert from 'node:assert/strict'
import { chromium } from 'playwright'

// Run against `CI=1 bun run dev`. Exercises the real rich-text and drop handlers.
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
const errors = []
page.on('pageerror', error => errors.push(error.message))
try {
  await page.goto(process.env.FIKA_DEV_URL ?? 'http://127.0.0.1:5173/', { waitUntil: 'networkidle' })
  await page.waitForFunction(() => !!window.__FIKA_SLIDES__ && document.querySelector('.ProseMirror'))
  await page.evaluate(() => {
    const store = window.__FIKA_SLIDES__.getState()
    store.setSlides([
      { id: 'first', elements: [{ id: 'text-first', type: 'text', left: 100, top: 100, width: 600, height: 80, content: '<p>Before</p>', defaultFontName: 'Arial', defaultColor: '#222', rotate: 0 }] },
      { id: 'second', elements: [] },
    ])
    store.updateSlideIndex(0)
  })
  const editor = page.locator('#editable-element-text-first .ProseMirror')
  await editor.waitFor({ state: 'visible' })
  const box = await editor.boundingBox()
  await page.mouse.dblclick(box.x + 15, box.y + box.height / 2)
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText('Text survives an immediate slide switch')
  // Switch inside the 300ms text debounce; no blur/click delay may save it for us.
  await page.evaluate(() => window.__FIKA_SLIDES__.getState().updateSlideIndex(1))
  assert.match(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0].content), /Text survives/)
  await page.evaluate(() => window.__FIKA_SLIDES__.getState().updateSlideIndex(0))
  await editor.waitFor({ state: 'visible' })
  assert.match(await editor.innerText(), /Text survives/)
  console.log('PASS: pending text survives immediate slide navigation and return')

  const src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  await page.evaluate(src => {
    const dataTransfer = new DataTransfer()
    dataTransfer.setData('text/plain', src)
    dataTransfer.setData('text/html', `<img src="${src}">`)
    document.querySelector('[data-fika-canvas]').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }))
    window.__FIKA_SLIDES__.getState().updateSlideIndex(1)
  }, src)
  await page.waitForFunction(() => window.__FIKA_SLIDES__.getState().slides[0].elements.some(e => e.type === 'image'))
  const slides = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides)
  assert.equal(slides[0].elements.filter(e => e.type === 'image').length, 1)
  assert.equal(slides[0].elements.filter(e => e.type === 'text').length, 1)
  assert.equal(slides[1].elements.length, 0)
  console.log('PASS: a dragged image becomes an image on its original slide even during navigation')

  await page.evaluate(() => {
    const dataTransfer = new DataTransfer()
    dataTransfer.setData('text/plain', 'ordinary dropped text')
    document.querySelector('[data-fika-canvas]').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }))
  })
  await page.waitForFunction(() => window.__FIKA_SLIDES__.getState().slides[1].elements.some(e => e.content?.includes('ordinary dropped text')))
  console.log('PASS: ordinary text drops remain text')
  assert.deepEqual(errors, [])
} finally {
  await browser.close()
}
