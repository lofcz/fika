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
    for(const finish of ['Enter','Tab']) for(const text of ['Infinity','1e309','-Infinity','NaN']) {
      await x.fill('100')
      await x.fill(text)
      const during=await page.evaluate(()=>Number.isFinite(window.__FIKA_SLIDES__.getState().slides[0].elements[0].left))
      console.log(text,{during})
      assert.equal(during,true,'Invalid numeric input must not write non-finite coordinates')
      await x.press(finish)
      assert.equal(Number(await x.inputValue()),100,`${finish} restores the last valid field value`)
      assert.equal(await page.evaluate(()=>Number.isFinite(window.__FIKA_SLIDES__.getState().slides[0].elements[0].left)),true)
    }
    await x.fill('1e2')
    await x.press('Enter')
    assert.equal(Number(await x.inputValue()),100,'Finite scientific notation remains valid')
    console.log('PASS numeric fields reject non-finite coordinates')

  }
  assert.deepEqual(errors,[])
} finally {await browser.close()}
