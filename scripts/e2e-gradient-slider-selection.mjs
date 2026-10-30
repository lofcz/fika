import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser=await chromium.launch({headless:true})
try {
  const page=await browser.newPage({viewport:{width:1500,height:1000},hasTouch:true})
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(`${process.env.FIKA_TEST_URL||'http://127.0.0.1:5173/'}?locale=en`,{waitUntil:'domcontentloaded'})
  await page.waitForFunction(()=>window.__FIKA_SNAPSHOT__?.getState().snapshotCursor>=0)
  const failures=[]
  for(const label of ['Gradient angle']) {
    await page.evaluate(()=>{
      const s=window.__FIKA_SLIDES__.getState()
      s.setSlides([{id:'style-drag',elements:['shape','other'].map((id,i)=>({id,type:'shape',left:100+i*300,top:100,width:200,height:100,rotate:0,viewBox:[200,100],path:'M0 0H200V100H0Z',fill:'#123456',gradient:{type:'linear',rotate:i?45:0,colors:[{pos:0,color:'#ff0000'},{pos:100,color:'#0000ff'}]},fixedRatio:false,outline:{width:2+i*3,color:i?'#abcdef':'#123456',style:'solid',radius:0},shadow:{h:2+i*3,v:3+i*3,blur:4+i*3,color:i?'#abcdef':'#123456'}}))}]);s.updateSlideIndex(0)
      window.__FIKA_MAIN__.getState().setActiveElementIdList(['shape'])
      window.__FIKA_MAIN__.getState().setEditorareaFocus(true)
    })
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
    await page.evaluate(()=>window.__FIKA_MAIN__.getState().setToolbarState('elStyle'))
    const slider=page.locator('[data-style-slider=gradient-angle]')
    await slider.scrollIntoViewIfNeeded()
    const r=await slider.boundingBox()
    const before=await page.evaluate(()=>window.__FIKA_SLIDES__.getState().slides[0].elements[1])
    await page.mouse.move(r.x+r.width*.9,r.y+r.height/2)
    await page.mouse.down()
    await page.keyboard.press('Tab')
    assert.deepEqual(await page.evaluate(()=>window.__FIKA_MAIN__.getState().activeElementIdList),['other'])
    await page.mouse.move(r.x+r.width*.3,r.y+r.height/2,{steps:4})
    await page.mouse.up()
    await page.waitForTimeout(100)
    const after=await page.evaluate(()=>window.__FIKA_SLIDES__.getState().slides[0].elements[1])
    console.log(label,{before:before.gradient,after:after.gradient})
    try { assert.deepEqual(after,before,`${label}: abandoned drag cannot affect the newly selected object`) }
    catch(error) {failures.push(error.message)}
    const painted=await page.evaluate(()=>['shape','other'].map(id=>({id,stored:window.__FIKA_SLIDES__.getState().slides[0].elements.find(el=>el.id===id).gradient.rotate,painted:document.getElementById(`editable-gradient-${id}`)?.getAttribute('gradientTransform')})))
    console.log('painted gradients after changing selection',painted)
    for (const item of painted) assert.equal(item.painted,`rotate(${item.stored},0.5,0.5)`,`${item.id}: abandoned preview restores the stored gradient`)
    await page.mouse.click(r.x+r.width*.8,r.y+r.height/2)
    const edited=await page.evaluate(()=>window.__FIKA_SLIDES__.getState().slides[0].elements[1])
    const actual=edited.gradient.rotate
    const expected=285
    assert.equal(actual,expected,`${label}: a new drag edits the new selection`)
  }
  assert.deepEqual(failures,[])
  assert.deepEqual(errors,[])
  console.log('PASS gradient selection change cancels the drag and permits a fresh edit')
} finally {await browser.close()}
