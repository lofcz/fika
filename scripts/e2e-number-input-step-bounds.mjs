import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173/'}?locale=en`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  for (const member of [true]) {
    await page.evaluate(() => {
      const s = window.__FIKA_SLIDES__.getState()
      s.setSlides([{ id: 'align-group', elements: ['left', 'right'].map((id, i) => ({ id, groupId: 'pair', type: 'shape', left: 100 + i * 300, top: 100, width: 200, height: 100, rotate: 0, viewBox: [200,100], path: 'M0 0H200V100H0Z', fill: '#ff0000', fixedRatio: false })) }])
      s.updateSlideIndex(0)
    })
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.evaluate(() => {
      window.__FIKA_MAIN__.setState({ activeElementIdList: ['left', 'right'], handleElementId: 'left', activeGroupElementId: 'left', editorAreaFocus: true })
      window.__FIKA_MAIN__.getState().setToolbarState('elPosition')
    })
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.evaluate(member => {
      window.__FIKA_MAIN__.getState().setActiveGroupElementId(member ? 'left' : '')
      window.__FIKA_MAIN__.getState().setToolbarState(member ? 'elPosition' : 'multiPosition')
    }, member)
    await page.waitForTimeout(300)
    const panel=page.locator('[data-align="left"]').filter({visible:true}).first().locator('xpath=ancestor::section[1]/..')
    const inputs=panel.locator('input[type=text]')
    const x=inputs.nth(0), width=inputs.nth(2)
    await width.fill('1500')
    await width.press('Enter')
    const up=width.locator('xpath=..').locator('span').first()
    const down=width.locator('xpath=..').locator('span').last()
    await up.click({clickCount:3})
    console.log({display:await width.inputValue(),stored:await page.evaluate(()=>window.__FIKA_SLIDES__.getState().slides[0].elements[0].width)})
    assert.equal(Number(await width.inputValue()),1500,'Incrementing at the maximum must keep the displayed value in bounds')
    await down.click()
    assert.equal(await page.evaluate(()=>window.__FIKA_SLIDES__.getState().slides[0].elements[0].width),1495,'One decrement moves away from the maximum')
    await width.fill('1498')
    await width.press('Enter')
    await up.click()
    assert.equal(Number(await width.inputValue()),1500,'An overshooting step clamps to the maximum')
    await width.fill('22')
    await width.press('Enter')
    await down.click()
    assert.equal(Number(await width.inputValue()),20,'An overshooting step clamps to the minimum')
    await width.fill('20')
    await width.press('Enter')
    await down.click({clickCount:3})
    assert.equal(Number(await width.inputValue()),20,'Decrementing at the minimum must keep the displayed value in bounds')
    await up.click()
    assert.equal(await page.evaluate(()=>window.__FIKA_SLIDES__.getState().slides[0].elements[0].width),25,'One increment moves away from the minimum')

  }
  assert.deepEqual(errors,[])
} finally {await browser.close()}
