import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1700, height: 1100 } })
  page.setDefaultTimeout(20_000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173/'}?locale=en`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  await page.evaluate(() => {
    window.__FIKA_MAIN__.setState({ showBubbleMenu: true })
    const cell = (id, text, extra = {}) => ({ id, text, colspan: 1, rowspan: 1, ...extra })
    window.__FIKA_SLIDES__.getState().setSlides([{ id: 'rich-slide', elements: [{
      id: 'rich-table', type: 'table', left: 100, top: 100, width: 700, height: 160, rotate: 0,
      colWidths: [.5, .5], cellMinHeight: 80, outline: { width: 1, color: '#000000', style: 'solid' },
      data: [
        [cell('a', 'Alpha beta', { style: { bold: true, fontsize: '24px' } }), cell('b', 'Second')],
        [cell('c', '<strong>literal</strong> &amp;'), cell('d', '<p>Before <strong><span class="fika-math" data-latex="x^2"></span></strong> after</p>', { textFormat: 'html' })],
      ],
    }] }])
    window.__FIKA_SLIDES__.getState().updateSlideIndex(0)
  })
  const root = page.locator('#editable-element-rich-table')
  const active = root.locator('.custom-textarea')
  const stored = (row = 0, col = 0) => page.evaluate(([r, c]) => window.__FIKA_SLIDES__.getState().slides[0].elements[0].data[r][c], [row, col])
  const selectStart = async count => {
    await active.focus()
    await page.keyboard.press('Control+Home')
    for (let i = 0; i < count; i++) await page.keyboard.press('Shift+ArrowRight')
  }
  const paste = async (text, html = '') => active.evaluate((el, { text, html }) => {
    const data = new DataTransfer()
    if (text) data.setData('text/plain', text)
    if (html) data.setData('text/html', html)
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  }, { text, html })
  assert.equal(await root.locator('[data-cell-index="1_0"] .cell-text').textContent(), '<strong>literal</strong> &amp;')
  const first = await root.locator('[data-cell-index="0_0"]').boundingBox()
  await page.mouse.dblclick(first.x + first.width / 2, first.y + first.height / 2)
  await selectStart(5)
  await page.keyboard.press('Control+b')
  assert.equal((await stored()).textFormat, 'html')
  assert.equal(await active.locator('strong').textContent(), ' beta', 'Legacy emphasis can be removed from just the selection')
  await page.getByRole('button', { name: 'Italic', exact: true }).click()
  assert.equal(await active.locator('em').textContent(), 'Alpha', 'Floating controls retain and format only the text selection')
  await page.keyboard.press('Control+z')
  assert.equal(await active.locator('em').count(), 0, 'Cell undo includes toolbar formatting')
  await page.keyboard.press('Control+Shift+z')
  assert.equal(await active.locator('em').textContent(), 'Alpha')

  await page.keyboard.press('Tab')
  await active.fill('Edited second')
  await page.keyboard.press('Shift+Tab')
  assert.equal(await active.locator('em').textContent(), 'Alpha', 'Switching cells preserves rich runs')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Control+z')
  assert.equal(await active.innerText(), 'Second', 'Each cell retains its own undo history across navigation')
  await page.keyboard.press('Control+Shift+z')
  assert.equal(await active.innerText(), 'Edited second')

  await page.keyboard.press('Control+a')
  await paste('Before x after', '<p>Before <strong>x</strong><script>bad()</script> after</p>')
  assert.equal(await active.locator('strong').textContent(), 'x')
  assert.doesNotMatch((await stored(0, 1)).text, /script|bad\(/)
  await page.keyboard.press('Control+a')
  await page.keyboard.insertText(String.raw`Area \(\frac{a \cdot v_a}{2}\) and text`)
  await active.locator('.fika-math').waitFor()
  assert.equal(await active.locator('.fika-math').getAttribute('data-latex'), String.raw`\frac{a \cdot v_a}{2}`)
  await active.locator('.fika-math').dblclick()
  await page.locator('math-field').waitFor()
  await page.locator('math-field').evaluate(el => { el.value = String.raw`\sqrt{x}` })
  await page.getByRole('button', { name: 'OK', exact: true }).click()
  assert.equal(await active.locator('.fika-math').getAttribute('data-latex'), String.raw`\sqrt{x}`, 'Table math uses the shared equation editor')
  assert.doesNotMatch((await stored(0, 1)).text, /ML__/, 'Generated math glyph markup is never persisted')

  await page.keyboard.press('Shift+Tab')
  await paste('A\tB\nC\tD', '<table><tr><td><strong>A</strong></td><td><em>B</em></td></tr><tr><td>C<br>D</td><td><span class="fika-math" data-latex="y_2"></span></td></tr></table>')
  assert.equal(await active.locator('strong').textContent(), 'A', 'Spreadsheet HTML takes precedence over its plain-text flavor')
  assert.match((await stored(0, 1)).text, /<em>B<\/em>/)
  assert.match((await stored(1, 1)).text, /data-latex="y_2"/)
  await page.keyboard.press('Control+z')
  assert.equal(await active.locator('em').textContent(), 'Alpha', 'Spreadsheet paste keeps the previous cell history')
  await page.keyboard.press('Control+Shift+z')
  assert.equal(await active.locator('strong').textContent(), 'A')

  // External edits must replace the live document even while the cell owns focus.
  await page.evaluate(() => {
    const store = window.__FIKA_SLIDES__.getState()
    const data = structuredClone(store.slides[0].elements[0].data)
    data[0][0].text = ''
    store.updateElement({ id: 'rich-table', props: { data } })
  })
  await page.waitForFunction(() => !document.querySelector('#editable-element-rich-table .custom-textarea')?.textContent)
  await page.keyboard.press('Control+z')
  assert.equal(await active.textContent(), '', 'An external replacement discards stale local undo')
  await active.fill('One')
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Shift+Enter')
  await page.keyboard.press('Enter')
  const saved = await stored()
  assert.doesNotMatch(saved.text, /ProseMirror-trailingBreak/)
  assert.match(saved.text, /<br>/)
  await page.keyboard.press('Tab')
  assert.equal((await stored()).text, saved.text, 'Leaving a cell does not invent or drop trailing breaks')
  assert.deepEqual(errors, [])
  console.log('PASS rich table cells: legacy literals/styles, selection formatting, local undo across cells, rich clipboard, atomic LaTeX editing, spreadsheet history, external replacement and trailing breaks.')
} finally { await browser.close() }
