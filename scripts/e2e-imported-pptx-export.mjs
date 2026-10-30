import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import PptxGen from 'pptxgenjs-plus'
import JSZip from 'jszip'
import { ensureDevServer } from './lib/dev-server.mjs'

const { url, child } = await ensureDevServer()
const browser = await chromium.launch({ headless: true })
try {
  const deck = new PptxGen()
  for (const text of ['Original first', 'Original second']) deck.addSlide().addText(text, { x: 1, y: 1, w: 5, h: 1, color: '000000' })
  const input = await JSZip.loadAsync(await deck.write({ outputType: 'arraybuffer' }))
  for (const index of [1, 2]) {
    const path = `ppt/slides/slide${index}.xml`
    input.file(path, (await input.file(path).async('string')).replace('</p:sld>', '<p:transition><p:fade/></p:transition></p:sld>'))
  }
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
  const browserErrors = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error' && message.text().includes('PPTX export failed')) browserErrors.push(message.text())
  })
  await page.goto(`${url}?locale=en`)
  await page.locator('.viewport-wrapper').first().waitFor({ state: 'visible' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  await page.locator('input[type=file]').setInputFiles({ name: 'ordered.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: await input.generateAsync({ type: 'nodebuffer' }) })
  await page.waitForFunction(() => window.__FIKA_SLIDES__.getState().slides.length === 2 && window.__FIKA_SLIDES__.getState().slides.every(slide => slide.sourcePackageId), { }, { timeout: 60_000 })
  await page.locator('.fullscreen-spin').waitFor({ state: 'detached' })
  await page.evaluate(() => window.__FIKA_SLIDES__.getState().moveSlide(0, 1))
  async function exported() {
    await page.locator('[data-editor-tool=export]').click()
    const button = page.locator('[data-export-format=pptx]')
    await button.waitFor({ state: 'visible' })
    await page.locator('.modal-zoom-enter-active').waitFor({ state: 'detached' })
    // Start listening before clicking, and observe both promises so a failed
    // click cannot leave an unhandled download timeout behind.
    const [file] = await Promise.all([
      page.waitForEvent('download', { timeout: 120_000 }),
      button.click(),
    ])
    assert.equal(await file.failure(), null, 'PPTX download completes successfully')
    const zip = await JSZip.loadAsync(await readFile(await file.path()))
    await page.locator('.fullscreen-spin').waitFor({ state: 'detached' })
    await page.locator('[data-export-format=pptx]').focus()
    await page.keyboard.press('Escape')
    await page.locator('[data-export-format=pptx]').waitFor({ state: 'hidden' })
    return zip
  }
  const reordered = await exported()
  assert.match(await reordered.file('ppt/slides/slide1.xml').async('string'), /Original second/)
  assert.match(await reordered.file('ppt/slides/slide2.xml').async('string'), /Original first/)
  await page.evaluate(() => {
    const s = window.__FIKA_SLIDES__.getState()
    s.setSlides(s.slides.slice(0, 1))
    s.setViewportRatio(1)
  })
  const subset = await exported()
  assert.equal(Object.keys(subset.files).filter(path => /^ppt\/slides\/slide\d+\.xml$/.test(path)).length, 1)
  assert.match(await subset.file('ppt/slides/slide1.xml').async('string'), /Original second/)
  const presentation = await subset.file('ppt/presentation.xml').async('string')
  const dimensions = presentation.match(/<p:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/)
  assert.ok(dimensions)
  assert.equal(dimensions[1], dimensions[2], 'Export respects the changed square canvas')
  assert.deepEqual(browserErrors, [], 'PPTX export has no browser errors')
  console.log('PASS imported PPTX export: reordered slides, reduced deck, and resized canvas never return stale package bytes.')
} finally {
  await browser.close()
  child?.kill()
}
