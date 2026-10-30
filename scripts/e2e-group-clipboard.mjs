import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import CryptoJS from 'crypto-js'
import { ensureDevServer } from './lib/dev-server.mjs'
const { url, child } = await ensureDevServer()
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ permissions: ['clipboard-read', 'clipboard-write'], viewport: { width: 1400, height: 1000 } })
  await page.goto(`${url}?locale=en`, { waitUntil: 'domcontentloaded' })
  await page.locator('.viewport-wrapper').first().waitFor({ state: 'visible' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  await page.evaluate(() => {
    const s = window.__FIKA_SLIDES__.getState()
    s.setSlides([{ id: 'group-slide', elements: ['left', 'right'].map((id, index) => ({ id, groupId: 'pair', type: 'shape', left: 100 + index * 300, top: 100, width: 200, height: 100, rotate: 0, viewBox: [200, 100], path: 'M0 0H200V100H0Z', fill: '#ff0000', fixedRatio: false })) }])
    s.updateSlideIndex(0)
  })
  const point = await page.evaluate(() => {
    const r = [...document.querySelectorAll('.viewport-wrapper')].map(el => el.getBoundingClientRect()).sort((a,b) => b.width-a.width)[0]
    const scale = window.__FIKA_MAIN__.getState().canvasScale
    return { x: r.x+150*scale, y:r.y+130*scale }
  })
  // Fixture represents a group with its left member selected for editing.
  // Exercise the real keyboard copy/cut handlers against that selection.
  await page.mouse.click(point.x, point.y)
  await page.keyboard.press('Control+c')
  const wholeGroup = JSON.parse(CryptoJS.AES.decrypt(await page.evaluate(() => navigator.clipboard.readText()), 'fika').toString(CryptoJS.enc.Utf8))
  assert.deepEqual(wholeGroup.data.map(el => el.id).sort(), ['left', 'right'], 'Copying the whole group retains both members')
  await page.evaluate(() => window.__FIKA_MAIN__.setState({ activeElementIdList: ['left', 'right'], handleElementId: 'left', activeGroupElementId: 'left', editorAreaFocus: true }))
  await page.keyboard.press('Control+c')
  const copied = JSON.parse(CryptoJS.AES.decrypt(await page.evaluate(() => navigator.clipboard.readText()), 'fika').toString(CryptoJS.enc.Utf8))
  assert.equal(await page.evaluate(() => window.__FIKA_MAIN__.getState().activeGroupElementId), 'left', 'Group-member selection remains active during copy')
  assert.deepEqual(copied.data.map(el => el.id), ['left'], 'Copying a selected group member excludes its siblings')
  await page.keyboard.press('Control+x')
  await page.waitForFunction(() => window.__FIKA_SLIDES__.getState().slides[0].elements.length === 1)
  assert.equal(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0].id), 'right')
  await page.keyboard.press('Control+v')
  await page.waitForFunction(() => window.__FIKA_SLIDES__.getState().slides[0].elements.length >= 2)
  assert.equal(await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements.length), 2, 'Pasting the cut group member does not duplicate its sibling')
  console.log('PASS group-member copy, cut, and paste preserve siblings')
} finally {
  await browser.close()
  child?.kill()
}
