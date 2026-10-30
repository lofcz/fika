import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({headless:true})
try {
  const page = await browser.newPage({viewport:{width:1500,height:1000}})
  const errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173/'}?locale=en`,{waitUntil:'domcontentloaded'})
  await page.waitForFunction(()=>window.__FIKA_SNAPSHOT__?.getState().snapshotCursor>=0)
  await page.evaluate(()=>{
    const store=window.__FIKA_SLIDES__.getState()
    store.setSlides([{id:'numeric-disabled',elements:[{id:'text',type:'text',left:100,top:100,width:250,height:100,rotate:0,content:'<p>Automatic height</p>',defaultFontName:'Arial',defaultColor:'#111111'}]}])
    store.updateSlideIndex(0)
    window.__FIKA_MAIN__.getState().setActiveElementIdList(['text'])
  })
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
  await page.evaluate(()=>window.__FIKA_MAIN__.getState().setToolbarState('elPosition'))
  const panel=page.locator('[data-align="left"]').filter({visible:true}).first().locator('xpath=ancestor::section[1]/..')
  const height=panel.locator('input[type=text]').nth(3)
  await height.waitFor()
  assert.equal(await height.isDisabled(),true)
  await page.waitForTimeout(300)
  const before=await height.inputValue()
  const beforeHeight=await page.evaluate(()=>window.__FIKA_SLIDES__.getState().slides[0].elements[0].height)
  const handlers=height.locator('xpath=..').locator('span')
  for(const handler of [handlers.first(),handlers.last()]) {
    const rect=await handler.boundingBox()
    assert.ok(rect)
    // Use an actual pointer click, including when the arrow is visually hidden.
    await page.mouse.click(rect.x+rect.width/2,rect.y+rect.height/2)
    await page.waitForTimeout(100)
    console.log({before,after:await height.inputValue()})
    assert.equal(await height.inputValue(),before,'A disabled numeric field cannot change through its step controls')
    assert.equal(await page.evaluate(()=>window.__FIKA_SLIDES__.getState().slides[0].elements[0].height),beforeHeight)
  }
  await page.evaluate(()=>window.__FIKA_SLIDES__.getState().updateElement({id:'text',props:{fixedHeight:true}}))
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
  assert.equal(await height.isDisabled(),false,'Fixed-height text enables the height field')
  await handlers.first().click()
  await page.waitForFunction(expected=>window.__FIKA_SLIDES__.getState().slides[0].elements[0].height===expected,beforeHeight+5)
  assert.equal(Number(await height.inputValue()),beforeHeight+5,'Re-enabled step control updates both the field and element')
  assert.deepEqual(errors,[])
  console.log('PASS disabled numeric controls preserve their value')
} finally {await browser.close()}
