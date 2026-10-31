import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
try {
  const failures = []
  for (const selected of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173/'}?locale=en`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
    await page.evaluate(selected => {
      const fill = CanvasRenderingContext2D.prototype.fillText
      const clear = CanvasRenderingContext2D.prototype.clearRect
      CanvasRenderingContext2D.prototype.fillText = function(text, ...args) {
        if (this.canvas.closest?.('[data-thumbnail-slide]')) (this.canvas.drawn ??= []).push({ text, color: this.fillStyle })
        return fill.call(this, text, ...args)
      }
      CanvasRenderingContext2D.prototype.clearRect = function(...args) { this.canvas.drawn = []; return clear.apply(this, args) }
      const base = { type: 'shape', left: 100, top: 100, width: 500, height: 160, rotate: 0, viewBox: [500, 160], path: 'M0 0H500V160H0Z', fixedRatio: false }
      const store = window.__FIKA_SLIDES__.getState()
      store.setSlides([{ id: 'surface-contrast', background: { type: 'solid', color: '#ffffff' }, elements: [
        { ...base, id: 'surface', fill: '#ffffff' },
        { ...base, id: 'label', fill: '', text: { content: '<p><span style="font-size:32px;color:#000000">Automatic </span><span data-color-explicit="true" style="font-size:32px;color:#000000">Explicit</span></p>', defaultFontName: 'Arial', defaultColor: '#000000', align: 'middle', fixedHeight: true } },
      ] }])
      store.updateSlideIndex(0)
      window.__FIKA_MAIN__.getState().setActiveElementIdList(selected ? ['label'] : [])
    }, selected)
    await page.locator('#editable-element-label .ProseMirror').waitFor()
    await page.waitForTimeout(350)
    const before = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[1])
    for (const [props, expected] of [[{ fill: '#111111' }, '#ffffff'], [{ left: 700 }, '#000000'], [{ left: 100 }, '#ffffff'], [{ fill: '#ffffff' }, '#000000']]) {
      await page.evaluate(props => window.__FIKA_SLIDES__.getState().updateElement({ id: 'surface', props }), props)
      await page.waitForFunction(expected => (document.querySelector('[data-thumbnail-slide="surface-contrast"] canvas')?.drawn || []).some(run => run.text.includes('Automatic') && run.color === expected), expected)
      const colors = await page.evaluate(() => {
        const pm = document.querySelector('#editable-element-label .ProseMirror')
        const walker = document.createTreeWalker(pm, NodeFilter.SHOW_TEXT), result = {}
        while (walker.nextNode()) result[walker.currentNode.textContent.trim()] = getComputedStyle(walker.currentNode.parentElement).color
        return result
      })
      console.log({ selected, props, expected, colors })
      try { assert.equal(colors.Automatic, expected === '#ffffff' ? 'rgb(255, 255, 255)' : 'rgb(0, 0, 0)', 'Shape text must follow the changed surface without reselection') }
      catch (error) { failures.push(error.message) }
      assert.equal(colors.Explicit, 'rgb(0, 0, 0)')
      assert.deepEqual(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[1]), before)
    }
    assert.deepEqual(errors, [])
    await page.close()
  }
  assert.deepEqual(failures, [])
} finally { await browser.close() }
