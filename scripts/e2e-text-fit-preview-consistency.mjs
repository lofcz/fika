import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { thumbnailTextGeometry } from './lib/thumbnail-text.mjs'

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 4 })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173/'}?locale=en`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  await page.evaluate(() => {
    const fill = CanvasRenderingContext2D.prototype.fillText
    const clear = CanvasRenderingContext2D.prototype.clearRect
    CanvasRenderingContext2D.prototype.fillText = function(text, ...args) {
      if (this.canvas.closest?.('[data-thumbnail-slide]')) (this.canvas.drawn ??= []).push({ text, font: this.font, color: this.fillStyle, y: args[1] })
      return fill.call(this, text, ...args)
    }
    CanvasRenderingContext2D.prototype.clearRect = function(...args) {
      this.canvas.drawn = []
      return clear.apply(this, args)
    }
  })
  const cases = [32, 48].flatMap(font => [500, 800].flatMap(width => [135, 170].map(height => ({ font, width, height, mixed: false }))))
  cases.push({ font: 66, width: 800, height: 170, mixed: true })
  for (const { font, width, height, mixed } of cases) {
    await page.evaluate(({ font, width, height, mixed }) => {
      const store = window.__FIKA_SLIDES__.getState()
      store.setSlides([{ id: 'appearance', background: mixed ? { type: 'gradient', gradient: { type: 'linear', rotate: 0, colors: [{ pos: 0, color: '#227cd3' }, { pos: 100, color: '#7047eb' }] } } : { type: 'solid', color: '#fff' }, elements: [{
        id: 'text', type: 'text', left: 100, top: 100, width, height, rotate: 0,
        fixedHeight: true, defaultFontName: mixed ? 'Calibri' : 'Arial', defaultColor: '#000', lineHeight: 1.25, paragraphSpace: 5,
        content: mixed ? `<p style="text-align:center"><span style="font-size:${font}px">jak se dneska máš? <span style="color:#ff9900">hahahahahahahahahahah</span> <strong><em><u><span data-color-explicit="true" style="color:#18181b">hdhashdahdhsahdh</span></u></em></strong> dsaa <span style="color:#009688">dsadsadsadd</span></span></p>` : `<p style="text-align:center"><span style="font-size:${font}px;color:#000000">jak se dneska máš? hahahahahahahahahahah hdhashdahdhsahdh dsaa dsadsadsadd</span></p>`,
      }] }])
      store.updateSlideIndex(0)
      window.__FIKA_MAIN__.getState().setActiveElementIdList([])
    }, { font, width, height, mixed })
    await page.waitForTimeout(450)
    const dom = await page.evaluate(() => {
      const pm = document.querySelector('#editable-element-text .ProseMirror')
      const range = document.createRange()
      const walker = document.createTreeWalker(pm, NodeFilter.SHOW_TEXT)
      const rects = []
      while (walker.nextNode()) {
        range.selectNodeContents(walker.currentNode)
        rects.push(...range.getClientRects())
      }
      return {
        lines: new Set(rects.filter(rect => rect.width > 0).map(rect => Math.round(rect.top))).size,
        scale: Number(pm.closest('[data-text-fit-host]').style.getPropertyValue('--text-fit-scale') || 1),
      }
    })
    const thumb = await thumbnailTextGeometry(page, { id: 'text' })
    const drawn = await page.evaluate(() => document.querySelector('[data-thumbnail-slide="appearance"] canvas')?.drawn)
    if (!mixed) assert.equal(thumb.lines, dom.lines, 'Thumbnail and editor must wrap onto the same lines')
    assert.ok(drawn?.length)
    for (const run of drawn) assert.ok(Math.abs(Number(run.font.match(/([0-9.]+)px/)[1]) - font * dom.scale) < .1, 'Thumbnail and editor must paint the same font size')
    assert.equal(new Set(drawn.map(run => Math.round(run.y))).size, dom.lines, 'Canvas text baselines match editor wrapping')
    if (mixed) assert.ok(drawn.some(run => run.text.includes('hdhash') && run.color === '#18181b'), 'Styled explicit black is preserved')
    console.log({ font, width, height, lines: dom.lines, scale: dom.scale })
  }
  await page.evaluate(() => {
    window.__FIKA_SLIDES__.getState().updateElement({ id: 'text', props: {
      width: 650, height: 135, defaultFontName: 'Arial',
      content: '<p style="text-align:center"><span style="font-size:32px">jak se dneska máš? hahahahahahahahahahah hdhashdahdhsahdh dsaa dsadsadsadd</span></p>',
    } })
    window.__FIKA_MAIN__.getState().setActiveElementIdList(['text'])
  })
  await page.waitForTimeout(400)
  const editor = page.locator('#editable-element-text .ProseMirror')
  const rect = await editor.boundingBox()
  await page.mouse.dblclick(rect.x + rect.width / 2, rect.y + rect.height / 2)
  await page.waitForTimeout(200)
  await editor.focus()
  await page.keyboard.press('Control+End')
  await page.evaluate(() => {
    window.fitFrames = []
    window.sampleFit = true
    const sample = () => {
      const host = document.querySelector('#editable-element-text [data-text-fit-host]')
      window.fitFrames.push({ scale: Number(host.style.getPropertyValue('--text-fit-scale') || 1), height: host.scrollHeight })
      if (window.sampleFit) requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
  await page.keyboard.type(' hdhashdahdhsahdh dsaa dsadsadsadd hdhashdahdhsahdh dsaa dsadsadsadd', { delay: 50 })
  await page.waitForTimeout(700)
  await page.evaluate(() => window.sampleFit = false)
  const frames = await page.evaluate(() => window.fitFrames)
  assert.ok(frames.length > 20)
  assert.ok(frames.every(frame => frame.height <= 115), 'Typing must not paint an overflowing frame before fitting')
  for (let i = 1; i < frames.length; i++) assert.ok(frames[i].scale <= frames[i - 1].scale + .002, 'Appending text must not make the fit oscillate upward')
  assert.deepEqual(errors, [])
  console.log('PASS matching preview sizes and line counts; stable fitting while typing')
} finally { await browser.close() }
