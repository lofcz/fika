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
    window.testReadCount=0
    FileReader.prototype.readAsDataURL=function(file){
      window.testReadCount++
      if(window.testHoldRead) {window.releaseTestRead=()=>original.call(this,file);return}
      return original.call(this,file)
    }
    const NativeImage=window.Image
    window.Image=function(...args){
      const image=new NativeImage(...args)
      image.addEventListener('load',()=>{
        if(image.src===window.testExpectedSource) setTimeout(()=>{window.testImageFinished=true},0)
      })
      return image
    }
    window.Image.prototype=NativeImage.prototype
  })
  await page.getByRole('button',{name:'Elements',exact:true}).click()
  for(const mode of ['lock-during-read','unlocked']) {
    await page.evaluate(mode=>{
      const store=window.__FIKA_SLIDES__.getState()
      const src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="gray"/></svg>')
      store.setSlides([{id:'drop-page',elements:[
        {id:'parent',type:'shape',left:100,top:100,width:250,height:200,rotate:0,viewBox:[250,200],path:'M0 0H250V200H0Z',fill:'#ffffff',fixedRatio:false,frame:{clipContent:true},lock:mode==='parent-locked'},
        {id:'photo',type:'image',parentFrameId:'parent',left:140,top:140,width:120,height:100,rotate:0,src,fixedRatio:false,lock:mode==='self-locked',clip:{shape:'rect',range:[[0,0],[100,100]]},photoFrame:{layout:'rect',cell:0,gutter:0,empty:true}},
      ]}]);store.updateSlideIndex(0)
      window.__FIKA_MAIN__.getState().setActiveElementIdList(['photo'])
      window.testReadCount=0
      window.testHoldRead=mode==='lock-during-read'
      window.testImageFinished=false
    },mode)
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
    const svg='<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="red"/></svg>'
    await page.evaluate(svg=>{window.testExpectedSource='data:image/svg+xml;base64,'+btoa(svg)},svg)
    const panel=page.locator('[data-myna-frames="frames"]')
    await panel.locator('input[type=file]').setInputFiles({name:'drop.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svg)})
    const reads=await page.evaluate(()=>window.testReadCount)
    if(mode==='lock-during-read') {
      await page.evaluate(()=>{
        window.__FIKA_SLIDES__.getState().updateElement({id:'parent',props:{lock:true}})
        window.releaseTestRead()
      })
      await page.waitForFunction(()=>window.testImageFinished)
    } else if(reads) await page.waitForFunction(()=>!window.__FIKA_SLIDES__.getState().slides[0].elements[1].photoFrame.empty)
    const filled=await page.evaluate(()=>!window.__FIKA_SLIDES__.getState().slides[0].elements[1].photoFrame.empty)
    console.log(mode,{reads,filled})
    try {
      assert.equal(filled,mode==='unlocked','A locked photo frame or ancestor prevents image replacement')
      assert.equal(reads,1,'The chosen file is loaded once')
      assert.equal(await panel.getByRole('button',{name:'Choose photo',exact:true}).isDisabled(),mode!=='unlocked','Sidebar controls reflect the current ancestor lock')
    } catch(error){failures.push(error.message)}

  }
  assert.deepEqual(errors,[])
  assert.deepEqual(failures,[])
  console.log('PASS sidebar photo replacement respects locks applied during loading')
} finally {await browser.close()}
