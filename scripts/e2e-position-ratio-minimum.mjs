import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173/'}?locale=en`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  for (const axis of ['width','height']) for (const locked of [true,false]) {
    await page.evaluate(({axis,locked}) => {
      const s = window.__FIKA_SLIDES__.getState()
      s.setSlides([{ id: 'align-group', elements: ['left', 'right'].map((id, i) => ({ id, groupId: 'pair', type: 'shape', left: 100 + i * 300, top: 100, width: axis==='width'?400:100, height: axis==='width'?100:400, rotate: 0, viewBox: [200,100], path: 'M0 0H200V100H0Z', fill: '#ff0000', fixedRatio: locked })) }])
      s.updateSlideIndex(0)
    },{axis,locked})
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.evaluate(() => {
      window.__FIKA_MAIN__.setState({ activeElementIdList: ['left', 'right'], handleElementId: 'left', activeGroupElementId: 'left', editorAreaFocus: true })
      window.__FIKA_MAIN__.getState().setToolbarState('elPosition')
    })
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.evaluate(member => {
      window.__FIKA_MAIN__.getState().setActiveGroupElementId(member ? 'left' : '')
      window.__FIKA_MAIN__.getState().setToolbarState(member ? 'elPosition' : 'multiPosition')
    }, true)
    await page.waitForTimeout(300)
    const panel=page.locator('[data-align="left"]').filter({visible:true}).first().locator('xpath=ancestor::section[1]/..')
    const inputs=panel.locator('input[type=text]')
    const field=inputs.nth(axis==='width'?2:3)
    await field.fill('20')
    await field.press('Enter')
    const element=await page.evaluate(()=>window.__FIKA_SLIDES__.getState().slides[0].elements[0])
    console.log(axis,locked,{width:element.width,height:element.height})
    assert.equal(element.width,axis==='width'?(locked?80:20):(locked?20:100))
    assert.equal(element.height,axis==='height'?(locked?80:20):(locked?20:100))
    assert.equal(Number(await field.inputValue()),element[axis],'The field displays the actual constrained dimension')
    await field.fill('160')
    await field.press('Enter')
    const grown=await page.evaluate(()=>window.__FIKA_SLIDES__.getState().slides[0].elements)
    assert.equal(grown[0].width,axis==='width'?160:(locked?40:100))
    assert.equal(grown[0].height,axis==='height'?160:(locked?40:100))
    assert.equal(grown[1].width,axis==='width'?400:100,'Resizing a group member preserves its sibling')
    assert.equal(grown[1].height,axis==='width'?100:400)
    console.log(`PASS ${axis} ${locked?'locked':'unlocked'} minimum-size edit and growth`)

  }
  assert.deepEqual(errors,[])
} finally {await browser.close()}
