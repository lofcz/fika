import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const errors = []
page.on('pageerror', error => errors.push(error.message))
const state = () => page.evaluate(() => {
  const slides = window.__FIKA_SLIDES__.getState()
  return { slides: slides.slides, index: slides.slideIndex, scale: window.__FIKA_MAIN__.getState().canvasScale }
})
const handle = id => page.locator(`[data-myna-page-handle="${id}"]`)
const near = (actual, expected, message, tolerance = 3) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`)

try {
  await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5178'}/?mode=myna&locale=en`, { waitUntil: 'networkidle' })
  await page.locator('[data-myna-workspace]').waitFor()
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotLength > 0)
  await page.getByRole('button', { name: 'Add page', exact: true }).click()
  await page.getByRole('button', { name: 'Add page', exact: true }).click()
  const initial = await state()
  assert.equal(initial.slides.length, 3)
  const ids = initial.slides.map(slide => slide.id)
  const fitAll = page.getByRole('button', { name: 'Fit all pages', exact: true })
  await fitAll.click()
  await page.waitForTimeout(350)
  assert.equal(await page.locator('[data-myna-page-handle]').count(), 3, 'Every page has a draggable title')
  const canvas = await page.locator('.canvas').boundingBox()
  const boxes = await Promise.all(ids.map(id => handle(id).boundingBox()))
  for (const box of boxes) {
    assert.ok(box.x >= canvas.x && box.x + box.width <= canvas.x + canvas.width + 2, 'Fit all brings page titles into the canvas horizontally')
    assert.ok(box.y >= canvas.y && box.y + box.height <= canvas.y + canvas.height + 2, 'Fit all brings page titles into the canvas vertically')
  }
  assert.ok(new Set(boxes.map(box => Math.round(box.x))).size > 1, 'New pages use a two-dimensional layout')

  // Move an inactive page at non-unit zoom: document delta must equal pointer delta / scale.
  const beforeDrag = await state()
  const movingId = ids[0]
  const start = await handle(movingId).boundingBox()
  const dx = 67, dy = 49
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.move(start.x + start.width / 2 + dx, start.y + start.height / 2 + dy, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(400)
  const afterDrag = await state()
  const movedPosition = afterDrag.slides.find(slide => slide.id === movingId).canvasPosition
  assert.ok(movedPosition && Number.isFinite(movedPosition.x) && Number.isFinite(movedPosition.y), 'Page position is stored in the document')
  const movedBox = await handle(movingId).boundingBox()
  near(movedBox.x - start.x, dx, 'Page follows horizontal pointer motion')
  near(movedBox.y - start.y, dy, 'Page follows vertical pointer motion')
  const oldPosition = beforeDrag.slides.find(slide => slide.id === movingId).canvasPosition
  if (oldPosition) {
    near(movedPosition.x - oldPosition.x, dx / beforeDrag.scale, 'Document horizontal position accounts for zoom', 3 / beforeDrag.scale)
    near(movedPosition.y - oldPosition.y, dy / beforeDrag.scale, 'Document vertical position accounts for zoom', 3 / beforeDrag.scale)
  }
  await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().unDo())
  await page.waitForTimeout(150)
  const undone = await handle(movingId).boundingBox()
  near(undone.x, start.x, 'Undo restores page x')
  near(undone.y, start.y, 'Undo restores page y')
  await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().reDo())
  await page.waitForTimeout(150)
  assert.deepEqual((await state()).slides.find(slide => slide.id === movingId).canvasPosition, movedPosition, 'Redo restores document position')

  await fitAll.click()
  await page.waitForTimeout(250)
  const switchToId = ids[1]
  const beforeActivation = await Promise.all(ids.map(id => handle(id).boundingBox()))
  const preview = page.locator(`[data-myna-page-id="${switchToId}"]`)
  await preview.click({ position: { x: 30, y: 30 } })
  await page.waitForFunction(id => {
    const s = window.__FIKA_SLIDES__.getState()
    return s.slides[s.slideIndex].id === id
  }, switchToId)
  const afterActivation = await Promise.all(ids.map(id => handle(id).boundingBox()))
  afterActivation.forEach((box, index) => {
    near(box.x, beforeActivation[index].x, 'Page activation preserves scene x')
    near(box.y, beforeActivation[index].y, 'Page activation preserves scene y')
  })
  const native = await page.locator('.canvas .viewport-wrapper').boundingBox()
  assert.ok(native.width > 0 && native.height > 0, 'Active page uses the native editable canvas')
  await page.mouse.move(native.x + native.width / 2, native.y + native.height / 2)
  await page.mouse.wheel(0, 170)
  await page.waitForTimeout(200)
  assert.equal((await state()).slides[(await state()).index].id, switchToId, 'Wheel pans the workspace without cycling pages')

  const counts = (await state()).slides.map(slide => slide.elements.length)
  await page.getByRole('button', { name: 'Text', exact: true }).click()
  await page.getByRole('button', { name: 'Add a heading', exact: true }).click()
  await page.waitForFunction(id => {
    const s = window.__FIKA_SLIDES__.getState()
    return s.slides.find(slide => slide.id === id).elements.length > 0
  }, switchToId)
  const inserted = await state()
  inserted.slides.forEach((slide, index) => assert.equal(slide.elements.length, counts[index] + (slide.id === switchToId ? 1 : 0), 'Insertion changes only the active page'))
  assert.equal(inserted.slides.find(slide => slide.id === switchToId).elements.at(-1).fixedHeight, true)
  assert.deepEqual(JSON.parse(JSON.stringify(inserted.slides)).find(slide => slide.id === movingId).canvasPosition, movedPosition, 'Page coordinates survive document serialization')
  await page.keyboard.press('Escape')
  await fitAll.click()
  await page.waitForTimeout(150)
  await handle(ids[0]).click()
  await handle(ids[1]).click({ modifiers: ['Shift'] })
  const beforeGroup = await state()
  await page.keyboard.down('Alt') // This assertion measures unconstrained movement; snapping has its own suite.
  const groupStart = await handle(ids[1]).boundingBox()
  await page.mouse.move(groupStart.x + groupStart.width / 2, groupStart.y + groupStart.height / 2)
  await page.mouse.down()
  await page.mouse.move(groupStart.x + groupStart.width / 2 + 37, groupStart.y + groupStart.height / 2 + 23, { steps: 8 })
  await page.mouse.up()
  await page.keyboard.up('Alt')
  const afterGroup = await state()
  for (const id of ids.slice(0, 2)) {
    const old = beforeGroup.slides.find(slide => slide.id === id).canvasPosition
    const moved = afterGroup.slides.find(slide => slide.id === id).canvasPosition
    near(moved.x - old.x, 37 / beforeGroup.scale, 'Shift-selected pages move together horizontally', 2)
    near(moved.y - old.y, 23 / beforeGroup.scale, 'Shift-selected pages move together vertically', 2)
  }
  assert.deepEqual(afterGroup.slides[2].canvasPosition, beforeGroup.slides[2].canvasPosition, 'Unselected page stays in place')
  await page.getByRole('button', { name: 'Pages', exact: true }).click()
  const layout = page.locator('[data-myna-page-layout]')
  await layout.getByLabel('Page name').fill('Campaign detail')
  await layout.getByLabel('Page X position').fill('-640')
  await layout.getByLabel('Page Y position').fill('-320')
  await layout.getByRole('button', { name: 'Set position', exact: true }).click()
  assert.deepEqual((await state()).slides.find(slide => slide.id === switchToId).canvasPosition, { x: -640, y: -320 }, 'Exact coordinates support negative canvas space')
  assert.equal(await handle(switchToId).textContent(), 'Campaign detail', 'Page name appears on the canvas title')
  assert.equal((await state()).slides.find(slide => slide.id === switchToId).canvasName, 'Campaign detail')
  const transferElement = (await state()).slides.find(slide => slide.id === switchToId).elements.at(-1)
  await page.evaluate(id => window.__FIKA_MAIN__.getState().setActiveElementIdList([id]), transferElement.id)
  await layout.getByLabel('Move selected objects to…').selectOption(ids[2])
  await page.waitForFunction(id => {
    const store = window.__FIKA_SLIDES__.getState()
    return store.slides[store.slideIndex].id === id
  }, ids[2])
  const transferred = await state()
  assert.equal(transferred.slides.find(slide => slide.id === switchToId).elements.some(element => element.id === transferElement.id), false)
  assert.deepEqual(transferred.slides.find(slide => slide.id === ids[2]).elements.find(element => element.id === transferElement.id), transferElement, 'Transfer preserves object geometry and formatting')
  await page.waitForTimeout(400)
  await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().unDo())
  const transferUndone = await state()
  assert.deepEqual(transferUndone.slides.find(slide => slide.id === switchToId).elements.find(element => element.id === transferElement.id), transferElement, 'Undo restores the source object')
  assert.equal(transferUndone.slides.find(slide => slide.id === ids[2]).elements.some(element => element.id === transferElement.id), false)
  await fitAll.click()
  await handle(switchToId).click()
  await page.evaluate(() => window.__FIKA_MAIN__.getState().setReadOnly(true))
  assert.equal(await layout.getByLabel('Page X position').isDisabled(), true)
  assert.equal(await layout.getByRole('button', { name: 'Set position', exact: true }).isDisabled(), true)
  const readOnlyPosition = (await state()).slides.find(slide => slide.id === switchToId).canvasPosition
  const readOnlyHandle = await handle(switchToId).boundingBox()
  await page.mouse.move(readOnlyHandle.x + readOnlyHandle.width / 2, readOnlyHandle.y + readOnlyHandle.height / 2)
  await page.mouse.down()
  await page.mouse.move(readOnlyHandle.x + readOnlyHandle.width / 2 + 30, readOnlyHandle.y + readOnlyHandle.height / 2 + 30, { steps: 4 })
  await page.mouse.up()
  assert.deepEqual((await state()).slides.find(slide => slide.id === switchToId).canvasPosition, readOnlyPosition, 'Read-only page titles cannot move pages')
  await page.evaluate(() => window.__FIKA_MAIN__.getState().setReadOnly(false))
  await page.getByRole('button', { name: 'Duplicate page', exact: true }).first().click()
  const duplicated = await state()
  assert.equal(duplicated.slides.length, 4)
  const duplicatePosition = duplicated.slides[duplicated.index].canvasPosition
  assert.ok(duplicated.slides.filter((_, index) => index !== duplicated.index).every(slide => slide.canvasPosition.x !== duplicatePosition.x || slide.canvasPosition.y !== duplicatePosition.y), 'Duplicate receives its own workspace position')
  // Populate this isolated browser fixture for a useful overview screenshot after functional checks.
  await page.evaluate(() => {
    const store = window.__FIKA_SLIDES__.getState()
    const source = store.slides[0]
    store.setSlides(store.slides.slice(0, 3).map((slide, index) => ({
      ...slide,
      canvasPosition: [{ x: -300, y: -160 }, { x: 960, y: 170 }, { x: 90, y: 1140 }][index],
      elements: source.elements.map(element => ({ ...structuredClone(element), id: `overview-${index}-${element.id}` })),
    })))
    window.__FIKA_SLIDES__.getState().updateSlideIndex(0)
  })
  await fitAll.click()
  await page.waitForTimeout(350)
  await mkdir('output/myna', { recursive: true })
  await page.screenshot({ path: 'output/myna/freeform-pages.png' })
  assert.deepEqual(errors, [])
  console.log('PASS Myna freeform pages: grid, fit all, zoom-aware drag, undo/redo, stable activation, wheel pan, targeted fixed-size text insertion, serialized and negative positions, multi-page dragging, read-only protection, duplicate placement, named pages, cross-page object transfer and undo.')
} finally { await browser.close() }
