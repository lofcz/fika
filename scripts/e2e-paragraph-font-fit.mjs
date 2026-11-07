import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH })
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  await page.goto(process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  await page.evaluate(() => {
    const store = window.__FIKA_SLIDES__.getState()
    store.setSlides([{ id: 'paragraph-fit', background: { type: 'solid', color: '#252d39' }, elements: [
      { id: 'paragraph', content: '<p style="font-size:25px;line-height:1.2">Ulož si obrázek<br>se svým novým vzorem.</p>', height: 35 },
      { id: 'tall', content: '<p style="font-size:25px;line-height:1.2">Ulož si obrázek<br>se svým novým vzorem.</p>', height: 65 },
      { id: 'inline', content: '<p style="line-height:1.2"><span style="font-size:25px">Ulož si obrázek<br>se svým novým vzorem.</span></p>', height: 35 },
    ].map((element, i) => ({ ...element, type: 'text', left: 100, top: 100 + i * 140, width: 700, rotate: 0,
      fixedHeight: true, vAlign: 'top', inset: [0, 0, 0, 0], defaultFontName: 'Calibri', defaultColor: '#f1f5f9', lineHeight: 1.2 })) }])
    store.updateSlideIndex(0)
  })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(1000)
  const inspect = () => page.evaluate(() => {
    const measure = id => {
      const root = document.querySelector(`#editable-element-${id} .ProseMirror`)
      const span = root.querySelector('span')
      return { font: parseFloat(getComputedStyle(span).fontSize), height: root.scrollHeight, lineHeight: getComputedStyle(root.querySelector('p')).lineHeight }
    }
    return { paragraph: measure('paragraph'), inline: measure('inline'), tall: measure('tall'),
      document: window.__FIKA_SLIDES__.getState().slides,
      thumbnail: document.querySelector('.thumbnail-item.active canvas').toDataURL() }
  })
  const before = await inspect()
  assert(before.paragraph.font > 10, 'Fitted paragraph must remain visible')
  assert(before.paragraph.height <= 35, 'Both hard-break lines fit the box')
  assert(Math.abs(before.paragraph.font - before.inline.font) < 0.1, 'Equivalent paragraph and inline sizes fit equally')
  assert.equal(before.tall.font, 25, 'A fitting paragraph retains its authored size')
  const target = await page.locator('#editable-element-paragraph .ProseMirror').boundingBox()
  await page.mouse.dblclick(target.x + 20, target.y + 5)
  await page.waitForTimeout(300)
  assert.equal(await page.locator('#editable-element-paragraph .ProseMirror').getAttribute('contenteditable'), 'true')
  assert.deepEqual(await inspect(), before, 'Editing retains geometry, thumbnail and authored document')
  await page.keyboard.press('Escape')
  await page.locator('.thumbnail-item.active').click()
  await page.waitForTimeout(500)
  assert.deepEqual(await inspect(), before, 'Blur retains geometry, thumbnail and authored document')
  console.log('PASS: paragraph font fitting stays readable, matches inline sizing, and survives editing/blur unchanged')
} finally { await browser.close() }
