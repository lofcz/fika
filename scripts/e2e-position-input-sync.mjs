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
    const result=await page.evaluate(async()=>{
      const store=window.__FIKA_SLIDES__
      const update=store.getState().updateElement
      const emitted=[]
      store.setState({updateElement: args=>{emitted.push(args);update(args)}})
      for(let i=0;i<80;i++) {
        update({id:'left',props:{left:800}})
        await new Promise(requestAnimationFrame)
        update({id:'left',props:{left:100}})
        await new Promise(requestAnimationFrame)
      }
      await new Promise(resolve=>setTimeout(resolve,200))
      return {emitted,left:store.getState().slides[0].elements[0].left}
    })
    console.log(JSON.stringify(result))
    assert.deepEqual(result.emitted,[],'External geometry updates must not be emitted back by the position inputs')
    assert.equal(result.left,100)
    const panel=page.locator('[data-align="left"]').filter({visible:true}).first().locator('xpath=ancestor::section[1]/..')
    const inputs=panel.locator('input[type=text]')
    const x=inputs.nth(0), width=inputs.nth(2)
    await x.fill('125')
    await page.waitForFunction(()=>window.__FIKA_SLIDES__.getState().slides[0].elements[0].left===125)
    await x.fill('-2000')
    await x.press('Enter')
    await page.waitForFunction(()=>window.__FIKA_SLIDES__.getState().slides[0].elements[0].left===-1000)
    await width.fill('2000')
    await width.press('Tab')
    await page.waitForFunction(()=>window.__FIKA_SLIDES__.getState().slides[0].elements[0].width===1500)
    await x.fill('120')
    await x.locator('xpath=..').locator('span').first().click()
    await page.waitForFunction(()=>window.__FIKA_SLIDES__.getState().slides[0].elements[0].left===125)
    await x.locator('xpath=..').locator('span').last().click()
    await page.waitForFunction(()=>window.__FIKA_SLIDES__.getState().slides[0].elements[0].left===120)
    for(const text of ['12.5','-12.5','.5','-.5']) {
      await x.fill('')
      await x.pressSequentially(text,{delay:40})
      assert.equal(await x.inputValue(),text,'Decimal and sign characters remain while typing')
      await x.press('Enter')
      assert.equal(await page.evaluate(()=>window.__FIKA_SLIDES__.getState().slides[0].elements[0].left),Number(text),'Decimal typing commits the intended coordinate')
    }
    console.log('PASS numeric input synchronization, decimal typing, bounds and step controls')
  }
  assert.deepEqual(errors,[])
} finally {await browser.close()}
