import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const elements = () => page.evaluate(() => {
  const state = window.__FIKA_SLIDES__.getState()
  return state.slides[state.slideIndex].elements
})
async function checkInsertion(button, count = 1, keyboard = false) {
  const before = await elements()
  if (keyboard) { await button.focus(); await page.keyboard.press('Enter') }
  else await button.click()
  await page.waitForFunction(count => {
    const state = window.__FIKA_SLIDES__.getState()
    return state.slides[state.slideIndex].elements.length === count
  }, before.length + count)
  await page.waitForFunction(() => document.activeElement?.hasAttribute('data-fika-canvas'), undefined, { timeout: 2000 })
  const inserted = (await elements()).slice(-count)
  await page.keyboard.press('ArrowRight')
  const moved = (await elements()).slice(-count)
  for (let i = 0; i < count; i++) assert.ok(moved[i].left > inserted[i].left, 'New selection moves immediately')
  await page.keyboard.press('Delete')
  assert.deepEqual((await elements()).map(el => el.id), before.map(el => el.id), 'Delete removes the new selection without reselecting')
}
try {
  await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5178'}/?mode=myna&locale=en`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Elements', exact: true }).click()
  const gallery = page.locator('[data-myna-elements]')
  await checkInsertion(gallery.locator('[data-myna-frames=grids]').getByRole('button', { name: 'Four photos', exact: true }), 4)
  await gallery.getByRole('button', { name: 'Shape', exact: true }).click()
  await checkInsertion(gallery.locator('[data-shape-item]').first())
  await gallery.getByRole('button', { name: 'Charts', exact: true }).click()
  await checkInsertion(gallery.locator('[data-chart-type=bar]'))
  await gallery.getByRole('button', { name: 'Table', exact: true }).click()
  await checkInsertion(gallery.locator('[data-table-cell="2x2"]'), 1, true)
  // Typing in the library must still leave the document alone.
  const before = await elements()
  await gallery.getByRole('searchbox').fill('abc')
  await page.keyboard.press('Backspace')
  assert.equal(await gallery.getByRole('searchbox').inputValue(), 'ab')
  assert.deepEqual(await elements(), before)
  await gallery.getByRole('searchbox').fill('')
  await gallery.getByRole('button', { name: 'Tools', exact: true }).click()
  await gallery.getByRole('button', { name: 'QR code', exact: true }).click()
  await checkInsertion(gallery.getByRole('button', { name: 'Add QR code', exact: true }))
  await page.getByRole('button', { name: 'Text', exact: true }).click()
  const library = page.locator('#myna-library')
  await checkInsertion(library.locator('[class*=myna-text-pair]').first(), 2)
  await library.locator('[class*=myna-text-heading]').click()
  await page.waitForFunction(() => document.activeElement?.classList.contains('ProseMirror'))
  const textId = (await elements()).at(-1).id
  await page.keyboard.press('End')
  await page.keyboard.type('keyboard check')
  await page.keyboard.press('Backspace')
  assert.ok(await page.locator(`#editable-element-${textId} .ProseMirror`).innerText().then(text => text.includes('keyboard chec')))
  assert.ok((await elements()).some(el => el.id === textId), 'Backspace edits text instead of removing its element')
  console.log('Insertion shortcuts passed: grid, shape, chart, keyboard-inserted table, QR, text pair, search-field isolation, and new text editing.')
} finally { await browser.close() }
