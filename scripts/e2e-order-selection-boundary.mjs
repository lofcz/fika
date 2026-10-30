import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser=await chromium.launch({headless:true})
try {
  const page=await browser.newPage({viewport:{width:1500,height:1000}})
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(`${process.env.FIKA_TEST_URL||'http://127.0.0.1:5173/'}?locale=en`,{waitUntil:'domcontentloaded'})
  await page.waitForFunction(()=>window.__FIKA_SNAPSHOT__?.getState().snapshotCursor>=0)
  const failures=[]
  for(const selection of [['a','d'],['b','c']]) for(const command of ['front','back']) {
    await page.evaluate(selection=>{
      const s=window.__FIKA_SLIDES__.getState()
      s.setSlides([{id:'order',elements:['a','b','c','d'].map((id,i)=>({id,type:'shape',left:100+i*200,top:100,width:150,height:100,rotate:0,viewBox:[150,100],path:'M0 0H150V100H0Z',fill:'#ff0000',fixedRatio:false}))}])
      s.updateSlideIndex(0)
      window.__FIKA_MAIN__.getState().setActiveElementIdList(selection)
      window.__FIKA_MAIN__.getState().setEditorareaFocus(true)
    },selection)
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
    await page.keyboard.press(command==='front'?'Alt+f':'Alt+b')
    const ids=await page.evaluate(()=>window.__FIKA_SLIDES__.getState().slides[0].elements.map(e=>e.id))
    console.log(command,ids)
    const remaining=['a','b','c','d'].filter(id=>!selection.includes(id))
    const expected=command==='front'?[...remaining,...selection]:[...selection,...remaining]
    if(ids.join()!==expected.join()) failures.push({command,selection,ids,expected})
  }
  assert.deepEqual(errors,[])
  assert.deepEqual(failures,[])
} finally {await browser.close()}
