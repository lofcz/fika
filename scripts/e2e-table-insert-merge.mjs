import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const failures = []
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  for (const axis of ['row', 'col']) for (const position of ['inside', 'before', 'after']) {
    await page.locator('.viewport-wrapper').first().click({ position: { x: 10, y: 10 } })
    await page.evaluate(axis => {
      const data = [0, 1, 2].map(r => [0, 1, 2].map(c => ({ id: `${axis}-${r}-${c}`, rowspan: 1, colspan: 1, text: `Cell ${r} ${c}` })))
      data[0][0].rowspan = 2
      data[0][0].colspan = 2
      const store = window.__FIKA_SLIDES__.getState()
      store.setSlides([{ id: 'insert-slide', elements: [{ id: `insert-${axis}`, type: 'table', left: 100, top: 100, width: 600, height: 240, rotate: 0, colWidths: [1/3, 1/3, 1/3], cellMinHeight: 80, outline: { width: 1, color: '#000', style: 'solid' }, data }] }])
      store.updateSlideIndex(0)
    }, axis)
    const root = page.locator(`#editable-element-insert-${axis}`)
    const index = position === 'after' ? 1 : 0
    const cell = root.locator(`[data-cell-index="${axis === 'row' ? `${index}_2` : `2_${index}`}"]`)
    await cell.waitFor()
    const box = await cell.boundingBox()
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)
    await root.locator('.custom-textarea').focus()
    await page.keyboard.press(axis === 'row' ? (position === 'before' ? 'Control+ArrowUp' : 'Control+ArrowDown') : (position === 'before' ? 'Control+ArrowLeft' : 'Control+ArrowRight'))
    await page.waitForFunction(axis => {
      const data = window.__FIKA_SLIDES__.getState().slides[0].elements[0].data
      return (axis === 'row' ? data.length : data[0].length) === 4
    }, axis)
    const data = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0].data)
    try {
      const anchorRow = axis === 'row' && position === 'before' ? 1 : 0
      const anchorCol = axis === 'col' && position === 'before' ? 1 : 0
      assert.equal(data[anchorRow][anchorCol][axis === 'row' ? 'rowspan' : 'colspan'], position === 'inside' ? 3 : 2, `Inserting a ${axis} ${position} a merge preserves its extent`)
      const coveredRow = axis === 'row' && position !== 'after' ? 2 : 1
      const coveredCol = axis === 'col' && position !== 'after' ? 2 : 1
      assert.equal(data[coveredRow][coveredCol].text, 'Cell 1 1', 'Original covered content stays intact')
      assert.equal(await root.locator(`[data-cell-index="${coveredRow}_${coveredCol}"]`).isVisible(), false, 'Previously covered cells remain covered')
      assert.equal(await root.locator('td[data-cell-index]:visible').count(), position === 'inside' ? 7 : 9, 'Inserted cells and merged area have the expected visible geometry')
      const editor = root.locator('.custom-textarea')
      assert.equal(await editor.evaluate(el => document.activeElement === el), true, 'Keyboard insertion preserves editing focus')
      const selected = await editor.evaluate(el => el.closest('td').dataset.cellIndex.split('_').map(Number))
      const selectedId = data[selected[0]][selected[1]].id
      await page.keyboard.press('Control+A')
      await page.keyboard.insertText('Continued typing')
      await page.keyboard.press('Tab')
      const committed = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0].data.flat())
      assert.equal(committed.find(cell => cell.id === selectedId)?.text, 'Continued typing', 'Typing after insertion is committed to the active cell')
      console.log(`PASS insert ${axis} ${position} a merged region`)
    } catch (error) { failures.push(error.message); console.error(error.message) }
  }
  assert.deepEqual(errors, [])
  assert.deepEqual(failures, [])
} finally { await browser.close() }
