import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH })
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  await page.goto(process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded', timeout: 180000 })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  await page.evaluate(() => {
    const fill = CanvasRenderingContext2D.prototype.fillText
    const clear = CanvasRenderingContext2D.prototype.clearRect
    CanvasRenderingContext2D.prototype.fillText = function(text, x, y, ...args) {
      if (this.canvas.closest?.('[data-thumbnail-slide]')) (this.canvas.drawn ??= []).push({ text, y, font: this.font })
      return fill.call(this, text, x, y, ...args)
    }
    CanvasRenderingContext2D.prototype.clearRect = function(...args) { this.canvas.drawn = []; return clear.apply(this, args) }
    const store = window.__FIKA_SLIDES__.getState()
    store.setSlides([{ id: 'late-font', background: { type: 'solid', color: '#0f172a' }, elements: [{
      id: 'title', type: 'text', left: 72, top: 100, width: 860, height: 132, rotate: 0,
      fixedHeight: true, inset: [8,8,8,8], defaultFontName: 'LateCalibri', defaultColor: '#2ecc71', lineHeight: 1.1,
      content: '<p><span style="font-family:LateCalibri;font-size:60px"><strong>Řízení CuteBota podle černé čáry</strong></span></p>',
    }] }])
    store.updateSlideIndex(0)
    window.__FIKA_MAIN__.getState().setActiveElementIdList([])
  })
  await page.waitForTimeout(600)
  const sample = () => page.evaluate(() => {
    const pm = document.querySelector('#editable-element-title .ProseMirror')
    const range = document.createRange(); range.selectNodeContents(pm.querySelector('strong'))
    const lines = [...range.getClientRects()].filter(r => r.width > 0)
    const canvas = document.querySelector('[data-thumbnail-slide="late-font"] canvas')
    return { domLines: new Set(lines.map(r => Math.round(r.top))).size,
      canvasLines: new Set(canvas.drawn.map(r => Math.round(r.y))).size,
      scale: Number(pm.closest('[data-text-fit-host]').style.getPropertyValue('--text-fit-scale') || 1),
      sizes: [...new Set(canvas.drawn.map(r => Number(r.font.match(/([0-9.]+)px/)[1])))],
      model: JSON.stringify(window.__FIKA_SLIDES__.getState().slides), thumbnail: canvas.toDataURL() }
  })
  const initial = await sample()
  await page.evaluate(async font => {
    const style = document.createElement('style')
    style.textContent = `@font-face { font-family:LateCalibri; font-weight:700; src:url("data:font/woff2;base64,${font}"); font-display:swap }`
    document.head.append(style)
    await document.fonts.load('700 60px LateCalibri')
    await document.fonts.ready
  }, readFileSync(new URL('../src/assets/fonts/Carlito-Bold.woff2', import.meta.url)).toString('base64'))
  await page.waitForTimeout(600)
  const loaded = await sample()
  assert.notEqual(loaded.thumbnail, initial.thumbnail, 'Late font arrival must repaint previews')
  assert.equal(loaded.canvasLines, loaded.domLines, 'Loaded fonts must wrap identically in canvas and the editor')
  assert(loaded.sizes.every(size => Math.abs(size - loaded.scale * 60) < .1), 'Loaded font sizes must match the live fit')
  const rect = await page.locator('#editable-element-title .ProseMirror').boundingBox()
  await page.mouse.dblclick(rect.x + 40, rect.y + 25)
  await page.waitForTimeout(300)
  const edited = await sample()
  assert.equal(edited.model, initial.model, 'Font arrival and selection must not author a document change')
  assert.equal(edited.thumbnail, loaded.thumbnail, 'Selecting after fonts load must not change wrapping')
  console.log('PASS: late-loaded font metrics agree across editor and canvas without selection')
} finally { await browser.close() }
