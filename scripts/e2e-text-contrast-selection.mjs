import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173/'}?locale=en`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  await page.evaluate(() => {
    const fill = CanvasRenderingContext2D.prototype.fillText
    const clear = CanvasRenderingContext2D.prototype.clearRect
    CanvasRenderingContext2D.prototype.fillText = function(text, ...args) {
      if (this.canvas.closest?.('[data-thumbnail-slide]')) (this.canvas.drawn ??= []).push({ text, color: this.fillStyle })
      return fill.call(this, text, ...args)
    }
    CanvasRenderingContext2D.prototype.clearRect = function(...args) { this.canvas.drawn = []; return clear.apply(this, args) }
    const store = window.__FIKA_SLIDES__.getState()
    store.setSlides([{ id: 'contrast-selection', background: { type: 'solid', color: '#ffffff' }, elements: [{
      id: 'contrast-text', type: 'text', left: 100, top: 100, width: 700, height: 140, rotate: 0,
      fixedHeight: true, defaultFontName: 'Arial', defaultColor: '#000000',
      content: '<p><span style="font-size:32px;color:#000000">Default ink </span><span style="font-size:32px;color:#ff0000">Accent ink</span></p>',
    }] }])
    store.updateSlideIndex(0)
    window.__FIKA_MAIN__.getState().setActiveElementIdList(['contrast-text'])
  })
  const editor = page.locator('#editable-element-contrast-text .ProseMirror')
  await editor.waitFor()
  const rect = await editor.boundingBox()
  await page.mouse.dblclick(rect.x + rect.width / 2, rect.y + rect.height / 2)
  await page.waitForTimeout(200)
  await editor.focus()
  await page.keyboard.press('Control+a')
  await page.waitForTimeout(350)
  const selected = await editor.evaluate(el => ({ from: el.__pmView.state.selection.from, to: el.__pmView.state.selection.to }))
  assert.ok(selected.to > selected.from)
  for (const dark of [true, false, true]) {
    const content = await page.evaluate(dark => {
      window.__FIKA_SLIDES__.getState().updateSlide({ background: dark ? {
        type: 'gradient', gradient: { type: 'linear', rotate: 0, colors: [{ pos: 0, color: '#227cd3' }, { pos: 100, color: '#7047eb' }] },
      } : { type: 'solid', color: '#ffffff' } })
      return window.__FIKA_SLIDES__.getState().slides[0].elements[0].content
    }, dark)
    const expected = dark ? 'rgb(255, 255, 255)' : 'rgb(0, 0, 0)'
    await page.waitForFunction(expected => {
      const pm = document.querySelector('#editable-element-contrast-text .ProseMirror')
      const walker = document.createTreeWalker(pm, NodeFilter.SHOW_TEXT)
      while (walker.nextNode()) if (walker.currentNode.textContent.includes('Default ink')) return getComputedStyle(walker.currentNode.parentElement).color === expected
      return false
    }, expected)
    const colors = await editor.evaluate(el => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), result = {}
      while (walker.nextNode()) result[walker.currentNode.textContent.trim()] = getComputedStyle(walker.currentNode.parentElement).color
      return result
    })
    assert.equal(colors['Default ink'], expected)
    assert.equal(colors['Accent ink'], 'rgb(255, 0, 0)', 'Authored accent colors remain unchanged')
    assert.deepEqual(await editor.evaluate(el => ({ from: el.__pmView.state.selection.from, to: el.__pmView.state.selection.to })), selected)
    await page.waitForFunction(dark => {
      const drawn = document.querySelector('[data-thumbnail-slide="contrast-selection"] canvas')?.drawn || []
      return drawn.some(run => run.text.includes('Default ink') && run.color === (dark ? '#ffffff' : '#000000'))
    }, dark)
    assert.equal(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0].content), content, 'Painting the resolved ink does not write editor markup back into the document')
  }
  await page.evaluate(() => window.__FIKA_MAIN__.getState().setToolbarState('elStyle'))
  await editor.focus()
  await page.keyboard.press('Control+Home')
  for (let i = 0; i < 11; i++) await page.keyboard.press('Shift+ArrowRight')
  await page.locator('[class*="color-swatches"]:visible button[style*="rgb(24, 24, 27)"]').first().click()
  await page.waitForTimeout(700)
  const explicit = await page.evaluate(() => {
    const el = document.querySelector('#editable-element-contrast-text .ProseMirror')
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let ink
    while (walker.nextNode()) if (walker.currentNode.textContent.includes('Default ink')) ink = getComputedStyle(walker.currentNode.parentElement).color
    return { ink, drawn: document.querySelector('[data-thumbnail-slide="contrast-selection"] canvas').drawn }
  })
  console.log({ explicit })
  assert.equal(explicit.ink, 'rgb(24, 24, 27)', 'Explicitly selected black must remain black in the editor')
  assert.ok(explicit.drawn.some(run => run.text.includes('Default ink') && run.color === '#18181b'), 'Explicitly selected black must remain black in the thumbnail')
  const saved = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0].content)
  assert.ok(saved.includes('data-color-explicit="true"'), 'The explicit choice is persisted')
  await page.evaluate(() => {
    const store = window.__FIKA_SLIDES__.getState()
    const slide = structuredClone(store.slides[0])
    store.setSlides([{ ...slide, id: 'reloaded-explicit', elements: slide.elements.map(el => ({ ...el, id: 'reloaded-text' })) }])
    window.__FIKA_MAIN__.getState().setActiveElementIdList([])
  })
  await page.waitForFunction(() => {
    const pm = document.querySelector('#editable-element-reloaded-text .ProseMirror')
    const chosen = pm?.querySelector('[data-color-explicit="true"]')
    return chosen && getComputedStyle(chosen).color === 'rgb(24, 24, 27)'
  })
  for (const color of ['#ffffff', '#111111']) {
    await page.evaluate(color => window.__FIKA_SLIDES__.getState().updateSlide({ background: { type: 'solid', color } }), color)
    await page.waitForTimeout(250)
    assert.equal(await page.locator('#editable-element-reloaded-text [data-color-explicit="true"]').first().evaluate(el => getComputedStyle(el).color), 'rgb(24, 24, 27)')
    assert.ok(await page.evaluate(() => (document.querySelector('[data-thumbnail-slide="reloaded-explicit"] canvas')?.drawn || []).some(run => run.text.includes('Default ink') && run.color === '#18181b')))
  }
  assert.deepEqual(errors, [])
  console.log('PASS default and accent inks agree with preview while retaining the text selection')
} finally { await browser.close() }
