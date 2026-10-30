import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({ headless:true })
const failures = []
try {
  const page = await browser.newPage({ viewport:{width:1500,height:1000} })
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173'}/?mode=myna&locale=en`,{waitUntil:'domcontentloaded'})
  await page.waitForFunction(()=>window.__FIKA_SNAPSHOT__?.getState().snapshotCursor>=0)
  await page.evaluate(()=>{
    const original=FileReader.prototype.readAsDataURL
    window.pendingReads={}
    window.completedImages=[]
    FileReader.prototype.readAsDataURL=function(file){window.pendingReads[file.name]=()=>original.call(this,file)}
    const NativeImage=window.Image
    window.Image=function(...args){
      const image=new NativeImage(...args)
      image.addEventListener('load',()=>setTimeout(()=>window.completedImages.push(image.src),0))
      return image
    }
    window.Image.prototype=NativeImage.prototype
  })
  await page.getByRole('button',{name:'Elements',exact:true}).click()
  for(const mode of ['clear','clear-undo']) {
    await page.evaluate(()=>{
      const store=window.__FIKA_SLIDES__.getState()
      const src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="gray"/></svg>')
      store.setSlides([{id:'drop-page',elements:[
        {id:'parent',type:'shape',left:100,top:100,width:250,height:200,rotate:0,viewBox:[250,200],path:'M0 0H250V200H0Z',fill:'#ffffff',fixedRatio:false,frame:{clipContent:true}},
        {id:'photo',type:'image',parentFrameId:'parent',left:140,top:140,width:120,height:100,rotate:0,src,fixedRatio:false,clip:{shape:'rect',range:[[0,0],[100,100]]},photoFrame:{layout:'rect',cell:0,gutter:0,empty:false}},
      ]}]);store.updateSlideIndex(0)
      window.__FIKA_MAIN__.getState().setActiveElementIdList(['photo'])
      window.pendingReads={}
      window.completedImages=[]
    })
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
    await page.evaluate(()=>window.__FIKA_SNAPSHOT__.getState().initSnapshotDatabase())
    const point=await page.evaluate(()=>{
      const r=[...document.querySelectorAll('.viewport-wrapper')].map(el=>el.getBoundingClientRect()).sort((a,b)=>b.width-a.width)[0]
      const s=window.__FIKA_MAIN__.getState().canvasScale
      return {clientX:r.x+180*s,clientY:r.y+180*s}
    })
    const svg='<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="blue"/></svg>'
    const source='data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64')
    const transfer=await page.evaluateHandle(svg=>{
      const data=new DataTransfer()
      data.items.add(new File([svg],'pending.svg',{type:'image/svg+xml'}))
      return data
    },svg)
    await page.locator('#editable-element-photo').dispatchEvent('drop',{dataTransfer:transfer,...point})
    await transfer.dispose()
    await page.locator('[data-myna-frames="frames"]').getByRole('button',{name:'Clear photo',exact:true}).click()
    await page.waitForFunction(()=>window.__FIKA_SLIDES__.getState().slides[0].elements[1].photoFrame.empty)
    await page.waitForFunction(()=>window.__FIKA_SNAPSHOT__.getState().snapshotCursor===1)
    if(mode==='clear-undo') {
      await page.locator('.viewport-wrapper').first().click({position:{x:10,y:10}})
      await page.keyboard.press('Control+z')
      await page.waitForFunction(()=>!window.__FIKA_SLIDES__.getState().slides[0].elements[1].photoFrame.empty)
    }
    const expected=await page.evaluate(()=>window.__FIKA_SLIDES__.getState().slides[0].elements[1].src)
    await page.evaluate(()=>window.pendingReads['pending.svg']())
    await page.waitForFunction(src=>window.completedImages.includes(src),source)
    const actual=await page.evaluate(()=>window.__FIKA_SLIDES__.getState().slides[0].elements[1].src)
    try {
      assert.equal(actual,expected,'Clearing a photo cancels its pending replacement, including after undo')
      if(mode==='clear-undo') {
        await page.waitForTimeout(350)
        await page.keyboard.press('Control+y')
        await page.waitForFunction(()=>window.__FIKA_SLIDES__.getState().slides[0].elements[1].photoFrame.empty)
        assert.equal(await page.evaluate(()=>window.__FIKA_SNAPSHOT__.getState().snapshotCursor),1,'The canceled load preserves redo history')
      }
      console.log(`PASS ${mode}`)
    } catch(error){failures.push(error.message)}

  }
  assert.deepEqual(errors,[])
  assert.deepEqual(failures,[])
  console.log('PASS clearing photos cancels pending replacements')
} finally {await browser.close()}
