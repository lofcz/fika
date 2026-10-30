import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import CryptoJS from 'crypto-js'
import { ensureDevServer } from './lib/dev-server.mjs'

const { url, child } = await ensureDevServer()
const browser = await chromium.launch({ headless: true })
try {
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'], viewport: { width: 1400, height: 1000 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(`${url}?locale=en`, { waitUntil: 'domcontentloaded' })
  const canvas = page.locator('.viewport-wrapper').first()
  await canvas.waitFor({ state: 'visible' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  await page.evaluate(() => {
    const s = window.__FIKA_SLIDES__.getState()
    s.setSlides([{ id: 'clipboard-test', elements: [] }])
    s.updateSlideIndex(0)
  })
  for (const data of [{ type: 'elements', data: [] }, null, { type: 'elements' }, { type: 'slides', data: null }]) {
    const text = CryptoJS.AES.encrypt(JSON.stringify(data), 'fika').toString()
    await canvas.click({ position: { x: 15, y: 15 } })
    await page.evaluate(text => navigator.clipboard.writeText(text), text)
    await page.keyboard.press('Control+v')
    await page.waitForTimeout(200)
  }
  assert.deepEqual(errors, [], 'Empty or malformed internal clipboard data must not crash paste')
  assert.equal(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements.length), 0)
  await page.evaluate(() => {
    navigator.clipboard.readText = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'))
  })
  await canvas.click({ button: 'right', position: { x: 15, y: 15 } })
  await page.getByText('Paste', { exact: true }).last().click()
  await page.getByText('Your browser does not support or blocks clipboard access. Please paste with Ctrl + V', { exact: true }).waitFor({ state: 'visible', timeout: 5000 })
  assert.deepEqual(errors, [], 'Denied clipboard access must show feedback without an unhandled rejection')
  await canvas.click({ position: { x: 15, y: 15 } })
  await page.evaluate(() => navigator.clipboard.writeText('Clipboard still works'))
  await page.keyboard.press('Control+v')
  await page.waitForFunction(() => window.__FIKA_SLIDES__.getState().slides[0].elements.some(el => el.type === 'text' && el.content.includes('Clipboard still works')))
  await canvas.click({ position: { x: 700, y: 400 } })
  const literal = '<b>literal</b> &amp; C:\u005c\u005cnew'
  await page.evaluate(text => navigator.clipboard.writeText(text), literal)
  await page.keyboard.press('Control+v')
  await page.waitForFunction(() => window.__FIKA_SLIDES__.getState().slides[0].elements.length === 2)
  const pastedText = await page.evaluate(() => {
    const el = window.__FIKA_SLIDES__.getState().slides[0].elements.at(-1)
    return new DOMParser().parseFromString(el.content, 'text/html').body.textContent
  })
  assert.equal(pastedText, literal, 'Plain clipboard text preserves markup, entities, and backslashes')
  await canvas.click({ position: { x: 700, y: 400 } })
  await canvas.evaluate((element, text) => {
    const dataTransfer = new DataTransfer()
    dataTransfer.setData('text/plain', text)
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }))
  }, literal)
  await page.waitForFunction(() => window.__FIKA_SLIDES__.getState().slides[0].elements.length === 3)
  const droppedText = await page.evaluate(() => {
    const el = window.__FIKA_SLIDES__.getState().slides[0].elements.at(-1)
    return new DOMParser().parseFromString(el.content, 'text/html').body.textContent
  })
  assert.equal(droppedText, literal, 'Dropped plain text preserves literal content')
  await page.waitForFunction(() => !!window.__FIKA_AGENTIC__)
  const result = await page.evaluate(async () => {
    window.__FIKA_SLIDES__.getState().setSlides([])
    return window.__FIKA_AGENTIC__.execute({ type: 'slides.create', payload: { slide: { id: 'first-page', elements: [] }, select: false } })
  })
  assert.equal(result.ok, true, JSON.stringify(result))
  await canvas.waitFor({ state: 'visible' })
  assert.equal(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slideIndex), 0, 'First insertion into an empty deck remains visible')
  assert.deepEqual(errors, [])
  console.log('PASS empty/malformed clipboard paste and clipboard permission feedback')
  console.log('PASS literal pasted/dropped text, normal paste after a denied read, and first insertion into an empty deck')
} finally {
  await browser.close()
  child?.kill()
}
