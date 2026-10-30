import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import PptxGen from 'pptxgenjs-plus'
import { ensureDevServer } from './lib/dev-server.mjs'

const { url, child } = await ensureDevServer()
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
  await page.goto(`${url}?locale=en`)
  await page.locator('.viewport-wrapper').first().waitFor({ state: 'visible' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  const initial = await page.evaluate(() => {
    const store = window.__FIKA_SLIDES__.getState()
    store.setSlides([{ id: 'existing-a', elements: [] }, { id: 'existing-b', elements: [] }])
    store.updateSlideIndex(0)
    store.setViewportSize(1200)
    store.setViewportRatio(0.75)
    store.setTheme({ themeColors: ['#123456'] })
    return JSON.stringify(window.__FIKA_SLIDES__.getState().slides)
  })
  const deck = new PptxGen()
  deck.defineLayout({ name: 'SMALL', width: 5, height: 5 })
  deck.layout = 'SMALL'
  deck.addSlide().addText('Incoming PPTX', { x: 0.5, y: 0.5, w: 3, h: 1 })
  const files = [
    { name: 'small.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: Buffer.from(await deck.write({ outputType: 'arraybuffer' })) },
    { name: 'small.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
      width: 600, height: 450, theme: { themeColors: ['#ff0000'] },
      slides: [{ id: 'incoming-json', elements: [{ id: 'picture', type: 'image', src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>', left: 60, top: 45, width: 120, height: 90, rotate: 0, fixedRatio: true }] }],
    })) },
  ]
  for (const [index, file] of files.entries()) {
    await page.evaluate(() => window.__FIKA_SLIDES__.getState().updateSlideIndex(0))
    await page.locator('input[type=file]').setInputFiles(file)
    await page.getByRole('button', { name: /Add to the end/ }).click()
    await page.waitForFunction(count => window.__FIKA_SLIDES__.getState().slides.length === count, index + 3, { timeout: 60_000 })
    const state = await page.evaluate(() => {
      const s = window.__FIKA_SLIDES__.getState()
      return { width: s.viewportSize, ratio: s.viewportRatio, colors: s.theme.themeColors, original: JSON.stringify(s.slides.slice(0, 2)), last: s.slides.at(-1) }
    })
    assert.equal(state.width, 1200)
    assert.equal(state.ratio, 0.75)
    assert.deepEqual(state.colors, ['#123456'])
    assert.equal(state.original, initial, 'Appending preserves existing pages and their order')
    assert.ok(state.last.elements.length)
    if (file.name.endsWith('.json')) {
      assert.equal(state.last.elements[0].width, 240)
      assert.equal(state.last.elements[0].height, 180)
    }
  }
  console.log('PASS PPTX and JSON append: existing pages, dimensions and theme preserved; incoming pages scaled and added at the end.')
} finally {
  await browser.close()
  child?.kill()
}
