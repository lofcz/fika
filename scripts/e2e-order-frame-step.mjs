import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser=await chromium.launch({headless:true})
try {
  const page=await browser.newPage({viewport:{width:1500,height:1000}})
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(`${process.env.FIKA_TEST_URL||'http://127.0.0.1:5173/'}?locale=en`,{waitUntil:'domcontentloaded'})
  await page.waitForFunction(()=>window.__FIKA_SNAPSHOT__?.getState().snapshotCursor>=0)
  const failures=[]
  for(const direction of ['up','down']) {
    await page.evaluate(direction=>{
      const shape=(id,extra={})=>({id,type:'shape',left:100,top:100,width:200,height:100,rotate:0,viewBox:[200,100],path:'M0 0H200V100H0Z',fill:'#123456',fixedRatio:false,...extra})
      const frame=[shape('frame',{frame:{clipContent:true}}),shape('child',{parentFrameId:'frame'})]
      const x=shape('x',{left:400})
      const s=window.__FIKA_SLIDES__.getState()
      s.setSlides([{id:'frame-order',elements:direction==='up'?[x,...frame]:[...frame,x]}]);s.updateSlideIndex(0)
      window.__FIKA_MAIN__.getState().setActiveElementIdList(['x'])
    },direction)
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
    await page.evaluate(()=>window.__FIKA_MAIN__.getState().setToolbarState('elPosition'))
    await page.getByRole('button',{name:direction==='up'?'Move up':'Move down',exact:true}).click()
    const ids=await page.evaluate(()=>window.__FIKA_SLIDES__.getState().slides[0].elements.map(e=>e.id))
    const expected=direction==='up'?['frame','child','x']:['x','frame','child']
    console.log({direction,ids,expected})
    if(ids.join()!==expected.join()) failures.push({direction,ids,expected})
  }
  assert.deepEqual(errors,[])
  assert.deepEqual(failures,[],'Single-step ordering crosses the entire neighboring frame')
} finally {await browser.close()}
