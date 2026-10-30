import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { ensureDevServer } from './lib/dev-server.mjs'

const { url, child } = await ensureDevServer()
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ permissions: ['clipboard-read', 'clipboard-write'], viewport: { width: 1400, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${url}?locale=en`)
  await page.locator('.viewport-wrapper').first().waitFor({ state: 'visible' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  for (const [text, expected] of [
    ['"First\nsecond"\tB\r\nC\tD', [['First\nsecond', 'B'], ['C', 'D']]],
    ['"A\tB"\t"Say ""Hi"""', [['A\tB', 'Say "Hi"'], ['', '']]],
    ['One\tTwo\rThree\tFour', [['One', 'Two'], ['Three', 'Four']]],
    ['One\tTwo\nThree\tFour', [['One', 'Two'], ['Three', 'Four']]],
    ['<b>literal</b>\tA & B\r\nNext\tLast', [['<b>literal</b>', 'A & B'], ['Next', 'Last']]],
  ]) {
    await page.evaluate(() => {
      const s = window.__FIKA_SLIDES__.getState()
      s.setSlides([{ id: 'table-slide', elements: [{ id: 'clipboard-table', type: 'table', left: 100, top: 100, width: 500, height: 150, rotate: 0, colWidths: [0.5, 0.5], cellMinHeight: 50, outline: { color: '#111111', width: 1, style: 'solid' }, data: [0, 1].map(r => [0, 1].map(c => ({ id: `cell-${r}-${c}`, colspan: 1, rowspan: 1, text: '' }))) }] }])
      s.updateSlideIndex(0)
    })
    const point = await page.evaluate(() => {
      const rect = [...document.querySelectorAll('.viewport-wrapper')].map(el => el.getBoundingClientRect()).sort((a, b) => b.width - a.width)[0]
      const scale = window.__FIKA_MAIN__.getState().canvasScale
      return { x: rect.x + 150 * scale, y: rect.y + 120 * scale }
    })
    await page.mouse.dblclick(point.x, point.y)
    const cell = page.locator('#editable-element-clipboard-table .custom-textarea').first()
    await cell.click()
    await page.evaluate(text => navigator.clipboard.writeText(text), text)
    await page.keyboard.press('Control+v')
    await page.waitForTimeout(300)
    if (expected[0][0].includes('\n')) assert.equal(await cell.innerText(), expected[0][0], 'Multiline cell renders its line break while editing')
    if (text.startsWith('<b>')) assert.equal(await cell.textContent(), '<b>literal</b>', 'Plain spreadsheet markup stays literal in the visible cell')
    await page.locator('.viewport-wrapper').first().click({ position: { x: 10, y: 10 } })
    if (expected[0][0].includes('\n')) assert.equal(await page.locator('#editable-element-clipboard-table [data-cell-index="0_0"] .cell-text').innerText(), expected[0][0], 'Multiline cell renders its line break after editing')
    if (text.startsWith('<b>')) {
      const rendered = page.locator('#editable-element-clipboard-table [data-cell-index="0_0"] .cell-text')
      assert.equal(await rendered.textContent(), '<b>literal</b>', 'Literal cell text remains correct after leaving edit mode')
    }
    const grid = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0].data.map(row => row.map(c => c.text)))
    assert.deepEqual(grid, expected, 'Spreadsheet cells preserve rows and literal text')
    assert.deepEqual(errors, [])
    if (text.startsWith('<b>') || expected[0][0].includes('\n')) {
      await page.mouse.dblclick(point.x, point.y)
      const reopened = page.locator('#editable-element-clipboard-table .custom-textarea').first()
      await reopened.click()
      assert.equal(await reopened.innerText(), expected[0][0], 'Reopening a cell preserves its literal content')
      await page.keyboard.press('Control+End')
      await page.keyboard.insertText(' & < >')
      await page.locator('.viewport-wrapper').first().click({ position: { x: 10, y: 10 } })
      assert.equal(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0].data[0][0].text), expected[0][0] + ' & < >', 'Typing commits plain text without HTML encoding')
    }
    console.log(`PASS spreadsheet paste ${JSON.stringify(text)}`)
  }
  const tablePoint = await page.evaluate(() => {
    const r = [...document.querySelectorAll('.viewport-wrapper')].map(el => el.getBoundingClientRect()).sort((a, b) => b.width - a.width)[0]
    const scale = window.__FIKA_MAIN__.getState().canvasScale
    return { x: r.x + 150 * scale, y: r.y + 120 * scale }
  })
  await page.mouse.dblclick(tablePoint.x, tablePoint.y)
  const editor = page.locator('#editable-element-clipboard-table .custom-textarea').first()
  await editor.focus()
  await page.evaluate(() => navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob(['<table></table>'], { type: 'text/html' }) })]))
  await page.keyboard.press('Control+v')
  await page.waitForTimeout(300)
  assert.deepEqual(errors, [], 'Empty HTML tables must not crash paste')
  console.log('PASS empty HTML table paste')
  await page.evaluate(() => navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob(['<table><tr><td>A</td><td>B</td></tr><tr><td>C</td></tr></table>'], { type: 'text/html' }) })]))
  await page.keyboard.press('Control+v')
  await page.waitForTimeout(300)
  assert.deepEqual(errors, [], 'Ragged HTML tables must not crash paste')
  await page.locator('.viewport-wrapper').first().click({ position: { x: 10, y: 10 } })
  assert.deepEqual(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0].data.map(row => row.map(c => c.text))), [['A', 'B'], ['C', '']], 'Missing HTML cells are padded with empty text')
  await page.mouse.dblclick(tablePoint.x, tablePoint.y)
  await page.locator('#editable-element-clipboard-table .custom-textarea').first().focus()
  await page.evaluate(() => navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob(['<table><tr><td rowspan="2">Merged</td><td>Top</td></tr><tr><td>Bottom</td></tr></table>'], { type: 'text/html' }) })]))
  await page.keyboard.press('Control+v')
  await page.waitForTimeout(300)
  await page.locator('.viewport-wrapper').first().click({ position: { x: 10, y: 10 } })
  assert.deepEqual(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0].data.map(row => row.map(c => c.text))), [['Merged', 'Top'], ['Merged', 'Bottom']], 'Vertical merged cells preserve the columns below them')
  console.log('PASS spreadsheet clipboard rows, literal editing, quoted cells, empty/ragged HTML, and vertical merges')
} finally {
  await browser.close()
  child?.kill()
}
