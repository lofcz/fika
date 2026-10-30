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
  for (const axis of ['row', 'col']) for (const position of ['across', 'anchor', 'inside', 'after']) {
    await page.locator('.viewport-wrapper').first().click({ position: { x: 10, y: 10 } })
    await page.evaluate(({ axis, position }) => {
      const data = [0, 1, 2].map(r => [0, 1, 2].map(c => ({ id: `${axis}-${r}-${c}`, rowspan: 1, colspan: 1, text: `Cell ${r} ${c}` })))
      if (position !== 'across') {
        data[0][0].rowspan = 2
        data[0][0].colspan = 2
        data[0][0].style = { backcolor: '#123456' }
      } else if (axis === 'row') data[1][0].colspan = 2
      else data[0][1].rowspan = 2
      const store = window.__FIKA_SLIDES__.getState()
      store.setSlides([{ id: 'delete-slide', elements: [{ id: `delete-${axis}`, type: 'table', left: 100, top: 100, width: 600, height: 240, rotate: 0, colWidths: [1/3, 1/3, 1/3], cellMinHeight: 80, outline: { width: 1, color: '#000', style: 'solid' }, data }] }])
      store.updateSlideIndex(0)
    }, { axis, position })
    const root = page.locator(`#editable-element-delete-${axis}`)
    const index = position === 'anchor' ? 0 : position === 'after' ? 2 : 1
    const cell = root.locator(`[data-cell-index="${axis === 'row' ? `${index}_2` : `2_${index}`}"]`)
    await cell.waitFor()
    const box = await cell.boundingBox()
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)
    await root.locator('.custom-textarea').focus()
    await cell.click({ button: 'right' })
    await page.getByText(axis === 'row' ? 'Delete row' : 'Delete column', { exact: true }).click()
    await page.waitForFunction(axis => {
      const data = window.__FIKA_SLIDES__.getState().slides[0].elements[0].data
      return (axis === 'row' ? data.length : data[0].length) === 2
    }, axis)
    const data = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0].data)
    try {
      assert(data.flat().every(cell => cell.rowspan >= 1 && cell.colspan >= 1), 'Deleting a merged row/column must not create zero spans in unrelated cells')
      if (position !== 'across') {
        assert.equal(data[0][0].text, 'Cell 0 0', 'A merge surviving deletion retains its content')
        assert.equal(data[0][0].rowspan, axis === 'row' && position !== 'after' ? 1 : 2)
        assert.equal(data[0][0].colspan, axis === 'col' && position !== 'after' ? 1 : 2)
      }
      const expectedVisible = position === 'across' ? 6 : position === 'after' ? 3 : 5
      assert.equal(await root.locator('td[data-cell-index]:visible').count(), expectedVisible, 'Surviving merge has the expected visible geometry')
      if (position !== 'across') assert.equal(await root.locator('[data-cell-index="0_0"]').getAttribute('data-cell-fill'), '#123456', 'Surviving merge retains its styling')
      console.log(`PASS delete ${axis} ${position}`)
    } catch (error) { failures.push(error.message); console.error(error.message) }
  }
  assert.deepEqual(errors, [])
  assert.deepEqual(failures, [])
} finally { await browser.close() }
