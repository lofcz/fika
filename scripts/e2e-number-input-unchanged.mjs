import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173/'}?locale=en`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  for (const finish of ['Tab','Enter']) for (const axis of ['width','height']) for (const locked of [true,false]) {
    await page.evaluate(({axis,locked}) => {
      const s = window.__FIKA_SLIDES__.getState()
      s.setSlides([{ id: 'align-group', elements: ['left', 'right'].map((id, i) => ({ id, groupId: 'pair', type: 'shape', left: 100 + i * 300, top: 100, width: 400.04, height: 100.04, rotate: 0, viewBox: [200,100], path: 'M0 0H200V100H0Z', fill: '#ff0000', fixedRatio: locked })) }])
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
    const before=await page.evaluate(()=>window.__FIKA_SLIDES__.getState().slides[0].elements[0])
    await field.focus()
    await field.press(finish)
    const after=await page.evaluate(()=>window.__FIKA_SLIDES__.getState().slides[0].elements[0])
    console.log(finish,axis,locked,{before:[before.width,before.height],after:[after.width,after.height]})
    assert.deepEqual(after,before,'Focusing and leaving a numeric field must not alter the element')

  }
  assert.deepEqual(errors,[])
} finally {await browser.close()}
