import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import CryptoJS from 'crypto-js'
import { ensureDevServer } from './lib/dev-server.mjs'
const { url, child } = await ensureDevServer()
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ permissions: ['clipboard-read', 'clipboard-write'], viewport: { width: 1400, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${url}?locale=en`, { waitUntil: 'domcontentloaded' })
  await page.locator('.viewport-wrapper').first().waitFor({ state: 'visible' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  await page.evaluate(() => {
    const s = window.__FIKA_SLIDES__.getState()
    s.setSlides([{ id: 'cut-slide', elements: [{ id: 'cut-shape', type: 'shape', left: 100, top: 100, width: 200, height: 100, rotate: 0, viewBox: [200, 100], path: 'M0 0H200V100H0Z', fill: '#ff0000', fixedRatio: false }] }, { id: 'other-slide', elements: [] }])
    s.updateSlideIndex(0)
    const original = document.execCommand.bind(document)
    window.__restoreClipboardCopy = () => { document.execCommand = original }
    document.execCommand = (command, ...args) => command === 'copy' ? false : original(command, ...args)
  })
  const point = await page.evaluate(() => {
    const r = [...document.querySelectorAll('.viewport-wrapper')].map(el => el.getBoundingClientRect()).sort((a,b) => b.width-a.width)[0]
    const scale = window.__FIKA_MAIN__.getState().canvasScale
    return { x: r.x+150*scale, y:r.y+130*scale }
  })
  await page.mouse.click(point.x, point.y)
  await page.waitForFunction(() => window.__FIKA_MAIN__.getState().activeElementIdList.includes('cut-shape'))
  await page.keyboard.press('Control+x')
  await page.waitForTimeout(300)
  assert.equal(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements.length), 1, 'Failed clipboard write must not delete the cut element')
  assert.deepEqual(errors, [], 'Clipboard denial must not cause unhandled errors')
  console.log('PASS failed cut preserves the selected element')
  await page.locator('.thumbnail-item').first().click()
  await page.keyboard.press('Control+x')
  await page.waitForTimeout(300)
  assert.deepEqual(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides.map(s => s.id)), ['cut-slide', 'other-slide'], 'Failed clipboard write must not delete the cut slide')
  assert.deepEqual(errors, [])
  console.log('PASS failed cut preserves the selected slide')
  await page.evaluate(() => window.__restoreClipboardCopy())
  await page.keyboard.press('Control+x')
  await page.waitForFunction(() => window.__FIKA_SLIDES__.getState().slides.length === 1)
  const copied = JSON.parse(CryptoJS.AES.decrypt(await page.evaluate(() => navigator.clipboard.readText()), 'fika').toString(CryptoJS.enc.Utf8))
  assert.equal(copied.type, 'slides')
  assert.equal(copied.data[0].id, 'cut-slide')
  assert.deepEqual(errors, [])
  console.log('PASS successful cut writes the slide before removing it')
} finally {
  await browser.close()
  child?.kill()
}
