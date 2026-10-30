import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173/'}?locale=en`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  for (const member of [true, false]) for (const command of ['left', 'horizontal', 'right', 'top', 'vertical', 'bottom']) {
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
    await page.locator(`[data-align="${command}"]`).filter({visible:true}).first().click()
    assert.equal(await page.evaluate(() => window.__FIKA_MAIN__.getState().activeGroupElementId),member ? 'left' : '', 'Alignment preserves member/group selection')
    const state = await page.evaluate(() => {
      const s = window.__FIKA_SLIDES__.getState()
      return { elements:s.slides[0].elements,width:s.viewportSize,height:s.viewportSize*s.viewportRatio }
    })
    const [left,right] = state.elements
    const width = member ? 200 : 500
    const expectedX = command === 'left' ? 0 : command === 'horizontal' ? (state.width-width)/2 : command === 'right' ? state.width-width : 100
    const expectedY = command === 'top' ? 0 : command === 'vertical' ? (state.height-100)/2 : command === 'bottom' ? state.height-100 : 100
    assert.equal(left.left,expectedX,`${command}: selected member/group reaches the horizontal target`)
    assert.equal(left.top,expectedY,`${command}: selected member/group reaches the vertical target`)
    assert.equal(right.left,member ? 400 : expectedX+300,`${command}: sibling stays in place or follows the whole group`)
    assert.equal(right.top,member ? 100 : expectedY,`${command}: sibling vertical placement is preserved`)
    console.log(`PASS ${member ? 'member' : 'whole group'} align ${command}`)
  }
  assert.deepEqual(errors,[])
} finally { await browser.close() }
