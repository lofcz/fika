import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser=await chromium.launch({headless:true})
try {
  const page=await browser.newPage({viewport:{width:1500,height:1000},hasTouch:true})
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(`${process.env.FIKA_TEST_URL||'http://127.0.0.1:5173/'}?locale=en`,{waitUntil:'domcontentloaded'})
  await page.waitForFunction(()=>window.__FIKA_SNAPSHOT__?.getState().snapshotCursor>=0)
  const cdp=await page.context().newCDPSession(page)
  const failures=[]
  for(const label of ['Border width:','Border radius:','Horizontal shadow:','Vertical shadow:','Blur distance:']) {
    await page.evaluate(()=>{
      const s=window.__FIKA_SLIDES__.getState()
      s.setSlides([{id:'style-drag',elements:['shape','other'].map((id,i)=>({id,type:'shape',left:100+i*300,top:100,width:200,height:100,rotate:0,viewBox:[200,100],path:'M 0 0 H 200 V 100 H 0 Z',fill:'#123456',fixedRatio:false,outline:{width:2+i*3,color:i?'#abcdef':'#123456',style:'solid',radius:0},shadow:{h:2+i*3,v:3+i*3,blur:4+i*3,color:i?'#abcdef':'#123456'}}))}]);s.updateSlideIndex(0)
      window.__FIKA_MAIN__.getState().setActiveElementIdList(['shape'])
      window.__FIKA_MAIN__.getState().setEditorareaFocus(true)
    })
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
    await page.evaluate(()=>window.__FIKA_MAIN__.getState().setToolbarState('elStyle'))
    await page.waitForTimeout(400)
    await page.evaluate(()=>window.__FIKA_SNAPSHOT__.getState().initSnapshotDatabase())
    const slider=page.locator('.field').filter({has:page.getByText(label,{exact:true})}).locator('div').first()
    await slider.scrollIntoViewIfNeeded()
    const r=await slider.boundingBox()
    const before=await page.evaluate(()=>window.__FIKA_SLIDES__.getState().slides[0].elements[0])
    const touch=f=>({x:r.x+r.width*f,y:r.y+r.height/2,id:1,radiusX:2,radiusY:2,force:1})
    const cursor=await page.evaluate(()=>window.__FIKA_SNAPSHOT__.getState().snapshotCursor)
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(.9)]})
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[touch(.3)]})
    await page.waitForTimeout(100)
    await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]})
    await page.waitForTimeout(100)
    assert.equal(await page.evaluate(()=>window.__FIKA_SNAPSHOT__.getState().snapshotCursor),cursor)
    const after=await page.evaluate(()=>window.__FIKA_SLIDES__.getState().slides[0].elements[0])
    console.log(label,{before:{outline:before.outline,shadow:before.shadow},after:{outline:after.outline,shadow:after.shadow}})
    try { assert.deepEqual(after,before,`${label}: canceled touch restores the original object`) }
    catch(error) {failures.push(error.message)}
    await page.mouse.click(r.x+r.width*.8,r.y+r.height/2)
    const edited=await page.evaluate(()=>window.__FIKA_SLIDES__.getState().slides[0].elements[0])
    const actual=label==='Border width:'?edited.outline.width:label==='Border radius:'?edited.outline.radius:label==='Horizontal shadow:'?edited.shadow.h:label==='Vertical shadow:'?edited.shadow.v:edited.shadow.blur
    const expected=label==='Border width:'?16:label==='Border radius:'?.8:label==='Blur distance:'?24:12
    assert.equal(actual,expected,`${label}: a new drag still commits`)
  }
  assert.deepEqual(failures,[])
  assert.deepEqual(errors,[])
} finally {await browser.close()}
