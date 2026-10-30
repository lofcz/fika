import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  const active = page.locator('[id^="editable-element-nav-table-"] .custom-textarea')
  const grid = () => page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0].data)
  const navigate = async (key, expected) => {
    await page.keyboard.press(key)
    await page.waitForFunction(expected => {
      const editor = document.querySelector('[id^="editable-element-nav-table-"] .custom-textarea')
      return editor?.closest('td')?.dataset.cellIndex === expected && document.activeElement === editor
    }, expected)
    assert.equal(await active.isVisible(), true, `${key} focuses a visible cell`)
  }
  for (const mode of ['plain', 'horizontal', 'full']) {
    await page.locator('.viewport-wrapper').first().click({ position: { x: 10, y: 10 } })
    await page.evaluate(mode => {
      const store = window.__FIKA_SLIDES__.getState()
      const data = [0, 1].map(r => [0, 1].map(c => ({ id: `${mode}-${r}-${c}`, rowspan: 1, colspan: 1, text: `Cell ${r} ${c}` })))
      if (mode !== 'plain') data[0][0].colspan = 2
      if (mode === 'full') data[0][0].rowspan = 2
      store.setSlides([{ id: 'nav-slide', elements: [{ id: `nav-table-${mode}`, type: 'table', left: 100, top: 100, width: 400, height: 160, rotate: 0, colWidths: [.5, .5], cellMinHeight: 80, outline: { width: 1, color: '#000', style: 'solid' }, data }] }])
      store.updateSlideIndex(0)
    }, mode)
    const cell = page.locator(`#editable-element-nav-table-${mode} [data-cell-index="0_0"]`)
    await cell.waitFor()
    const box = await cell.boundingBox()
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)
    await active.focus()
    await navigate('Shift+Tab', '0_0')
    assert.equal((await grid()).length, 2, 'Reverse Tab at the first cell never inserts a row')
    if (mode === 'plain') {
      await active.fill('Edited cell')
      await navigate('Tab', '0_1')
      assert.equal((await grid())[0][0].text, 'Edited cell', 'Tab commits the pending cell draft')
      await navigate('Tab', '1_0')
      await navigate('Shift+Tab', '0_1')
      await navigate('Shift+Tab', '0_0')
      assert.equal(await active.innerText(), 'Edited cell', 'Returning to a cell preserves the draft')
    }
    else {
      const next = mode === 'full' ? '2_0' : '1_0'
      await navigate('Tab', next)
      await navigate('Shift+Tab', '0_0')
      if (mode === 'full') {
        assert.equal((await grid()).length, 3, 'Tab appends after the final merged region')
        assert.equal((await grid())[0][0].rowspan, 2, 'Appending preserves the existing merge')
      }
    }
  }
  assert.deepEqual(errors, [])
  console.log('PASS table keyboard navigation: reverse/forward traversal, row boundaries, draft commits, merged-cell skipping, visible focus, and append after merged final cells.')
} finally { await browser.close() }
