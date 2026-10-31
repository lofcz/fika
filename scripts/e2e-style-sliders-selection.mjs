import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser=await chromium.launch({headless:true})
try {
  const page=await browser.newPage({viewport:{width:1500,height:1000},hasTouch:true})
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(`${process.env.FIKA_TEST_URL||'http://127.0.0.1:5173/'}?locale=en`,{waitUntil:'domcontentloaded'})
  await page.waitForFunction(()=>window.__FIKA_SNAPSHOT__?.getState().snapshotCursor>=0)
  const failures=[]
  for(const label of ['Border width:','Border radius:','Horizontal shadow:','Vertical shadow:','Blur distance:']) {
    await page.evaluate(()=>{
      const s=window.__FIKA_SLIDES__.getState()
      s.setSlides([{id:'style-drag',elements:['shape','other'].map((id,i)=>({id,type:'shape',left:100+i*300,top:100,width:200,height:100,rotate:0,viewBox:[200,100],path:'M0 0H200V100H0Z',fill:'#123456',fixedRatio:false,outline:{width:2+i*3,color:i?'#abcdef':'#123456',style:'solid',radius:0},shadow:{h:2+i*3,v:3+i*3,blur:4+i*3,color:i?'#abcdef':'#123456'}}))}]);s.updateSlideIndex(0)
      window.__FIKA_MAIN__.getState().setActiveElementIdList(['shape'])
      window.__FIKA_MAIN__.getState().setEditorareaFocus(true)
    })
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
    await page.evaluate(()=>window.__FIKA_MAIN__.getState().setToolbarState('elStyle'))
    const slider=page.locator('.field').filter({has:page.getByText(label,{exact:true})}).locator('div').first()
    await slider.scrollIntoViewIfNeeded()
    const r=await slider.boundingBox()
    const original=await page.evaluate(()=>window.__FIKA_SLIDES__.getState().slides[0].elements[0])
    const before=await page.evaluate(()=>window.__FIKA_SLIDES__.getState().slides[0].elements[1])
    await page.mouse.move(r.x+r.width*.9,r.y+r.height/2)
    await page.mouse.down()
    await page.keyboard.press('Tab')
    assert.deepEqual(await page.evaluate(()=>window.__FIKA_MAIN__.getState().activeElementIdList),['other'])
    await page.mouse.move(r.x+r.width*.3,r.y+r.height/2,{steps:4})
    await page.mouse.up()
    await page.waitForTimeout(100)
    const after=await page.evaluate(()=>window.__FIKA_SLIDES__.getState().slides[0].elements[1])
    try { assert.deepEqual(await page.evaluate(()=>window.__FIKA_SLIDES__.getState().slides[0].elements[0]),original,`${label}: original object restores after selection changes`) }
    catch(error) {failures.push(error.message)}
    console.log(label,{before:{outline:before.outline,shadow:before.shadow},after:{outline:after.outline,shadow:after.shadow}})
    try { assert.deepEqual(after,before,`${label}: abandoned drag cannot affect the newly selected object`) }
    catch(error) {failures.push(error.message)}
    await page.mouse.click(r.x+r.width*.8,r.y+r.height/2)
    const edited=await page.evaluate(()=>window.__FIKA_SLIDES__.getState().slides[0].elements[1])
    const actual=label==='Border width:'?edited.outline.width:label==='Border radius:'?edited.outline.radius:label==='Horizontal shadow:'?edited.shadow.h:label==='Vertical shadow:'?edited.shadow.v:edited.shadow.blur
    const expected=label==='Border width:'?16:label==='Border radius:'?.8:label==='Blur distance:'?24:12
    assert.equal(actual,expected,`${label}: a new drag edits the new selection`)
  }
  assert.deepEqual(failures,[])
  assert.deepEqual(errors,[])
} finally {await browser.close()}
