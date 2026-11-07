import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH })
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
  await page.goto(process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  await page.evaluate(() => {
    const fill = CanvasRenderingContext2D.prototype.fillText
    const clear = CanvasRenderingContext2D.prototype.clearRect
    CanvasRenderingContext2D.prototype.fillText = function(text, x, y, ...args) {
      if (this.canvas.closest?.('[data-thumbnail-slide]')) {
        const p = this.getTransform().transformPoint({ x, y })
        const metrics = this.measureText(text)
        const top = this.getTransform().transformPoint({ x, y: y - metrics.fontBoundingBoxAscent })
        ;(this.canvas.drawn ??= []).push({ text, x: p.x / this.canvas.width * 960, y: top.y / this.canvas.width * 960, font: this.font, color: this.fillStyle })
      }
      return fill.call(this, text, x, y, ...args)
    }
    CanvasRenderingContext2D.prototype.clearRect = function(...args) { this.canvas.drawn = []; return clear.apply(this, args) }
    const store = window.__FIKA_SLIDES__.getState()
    store.setViewportSize(960)
    store.setViewportRatio(.75)
    store.setSlides([{ id: 'paragraph-parity', background: { type: 'solid', color: '#181b21' }, elements: [{
      id: 'body', type: 'shape', left: 40, top: 100, width: 860, height: 550, rotate: 0,
      viewBox: [860, 550], path: 'M0 0H860V550H0Z', fill: '#292f39', fixedRatio: false,
      text: { align: 'top', inset: [20,20,20,50], defaultFontName: 'Arial', defaultColor: '#2b3445', lineHeight: 1.5, paragraphSpace: 16,
        content: '<p style="line-height:1.2"><span style="font-size:32px;font-family:Arial"> </span></p><p data-indent="4" style="line-height:1.2"><span style="font-size:29px;color:#f5f5f5">Opening instruction</span></p><p style="text-align:right;line-height:1.25;margin-top:30px"><span style="font-size:18px">Save your project<br>Keep the original copy</span></p><p style="line-height:32pt;margin-top:0px"><span style="font-size:28px;color:#f5f5f5">Final instruction</span></p><p><span data-color-explicit="true" style="color:#185ca1;font-size:24px"><a href="https://example.com">Explicit blue</a></span></p>' },
    }, { id: 'footer', type: 'text', left: 750, top: 660, width: 180, height: 35, fixedHeight: true, rotate: 0,
      defaultFontName: 'Arial', defaultColor: '#ffffff', content: '<p><span style="font-size:16px"><číslo></span></p>' }] }])
    store.updateSlideIndex(0)
    window.__FIKA_MAIN__.getState().setActiveElementIdList([])
  })
  await page.waitForTimeout(900)
  const snapshot = () => page.evaluate(() => {
    const root = document.querySelector('#editable-element-body')
    const box = root.firstElementChild.getBoundingClientRect()
    const scale = box.width / 860
    const walker = document.createTreeWalker(root.querySelector('.ProseMirror'), NodeFilter.SHOW_TEXT)
    const runs = []
    while (walker.nextNode()) {
      if (!walker.currentNode.textContent.trim()) continue
      const range = document.createRange()
      range.selectNodeContents(walker.currentNode)
      const rect = range.getBoundingClientRect()
      runs.push({ text: walker.currentNode.textContent, x: (rect.x - box.x) / scale + 40, y: (rect.y - box.y) / scale + 100, color: getComputedStyle(walker.currentNode.parentElement).color })
    }
    const canvas = document.querySelector('[data-thumbnail-slide="paragraph-parity"] canvas')
    return { runs, drawn: canvas.drawn, thumbnail: canvas.toDataURL(), slide: window.__FIKA_SLIDES__.getState().slides[0] }
  })
  const before = await snapshot()
  const target = await page.locator('#editable-element-body').getByText('Opening instruction', { exact: true }).boundingBox()
  await page.mouse.dblclick(target.x + target.width / 2, target.y + target.height / 2)
  await page.waitForTimeout(500)
  const selected = await snapshot()
  assert.deepEqual(selected.runs, before.runs, 'Selecting/editing must not move or recolor any glyph')
  assert.deepEqual(selected.slide, before.slide, 'Selection must not mutate the document')
  assert.equal(selected.thumbnail, before.thumbnail, 'Selection must not change the thumbnail')
  for (const run of before.runs) {
    const painted = before.drawn.find(item => item.text === run.text)
    assert(painted, `Missing canvas run: ${run.text}`)
    assert(Math.abs(painted.x - run.x) < 1, `${run.text}: horizontal drift ${painted.x - run.x}`)
    assert(Math.abs(painted.y - run.y) < 1.5, `${run.text}: vertical drift ${painted.y - run.y}`)
    if (run.text !== 'Explicit blue') assert.equal(run.color, 'rgb(255, 255, 255)', 'Fallback body ink remains readable')
  }
  assert.equal(before.runs.at(-1).color, 'rgb(24, 92, 161)', 'Authored explicit color is preserved')
  // Escape schedules the debounced input callback even without typing. The
  // subsequent blur/unmount must not persist normalized display HTML.
  await page.keyboard.press('Escape')
  await page.locator('.thumbnail-item.active').click()
  await page.evaluate(() => { const main = window.__FIKA_MAIN__.getState(); main.setActiveElementIdList([]); main.setHandleElementId('') })
  await page.waitForTimeout(500)
  const deselected = await snapshot()
  assert.deepEqual(deselected.slide, before.slide, 'Leaving edit mode without typing must preserve authored HTML and the literal footer')
  assert.equal(deselected.thumbnail, before.thumbnail, 'Leaving edit mode must not rewrite the thumbnail')
  await page.mouse.dblclick(target.x + target.width / 2, target.y + target.height / 2)
  await page.keyboard.press('Control+End')
  await page.keyboard.type(' edited')
  await page.locator('.thumbnail-item.active').click()
  await page.waitForTimeout(500)
  const edited = await snapshot()
  assert(edited.slide.elements[0].text.content.includes(' edited'), 'A real text edit must still persist')
  assert(edited.slide.elements.some(el => el.id === 'footer'), 'Literal angle-bracket text is not an empty element')
  console.log('PASS: imported empty paragraphs, indentation, mixed line heights, spacing, contrast and selection parity')
} finally { await browser.close() }
