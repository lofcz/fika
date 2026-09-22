import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { writeFile,mkdir } from 'node:fs/promises'
const browser=await chromium.launch({headless:true})
try {
 const page=await browser.newPage({viewport:{width:1600,height:1000}})
 await page.addInitScript(()=>{
  window.__mynaPerf={renders:{},paints:0,notifications:0,gaps:[],tasks:[]}
  const p=window.__mynaPerf
  const clear=CanvasRenderingContext2D.prototype.clearRect
  CanvasRenderingContext2D.prototype.clearRect=function(...args){if(this.canvas.dataset.canvasPainted)p.paints++;return clear.apply(this,args)}
  new PerformanceObserver(list=>p.tasks.push(...list.getEntries().map(e=>e.duration))).observe({type:'longtask',buffered:false})
 })
 await page.goto(`${process.env.FIKA_TEST_URL||'http://127.0.0.1:5173'}/?mode=myna&locale=cs${process.env.FIKA_PERF_QUERY||''}`)
 await page.locator('[data-kind="section"]').first().waitFor();await page.waitForTimeout(1500)
 const results={}
 for(const mode of ['pan','element','section']) {
  results[mode]=await page.evaluate(async mode=>{
   const p=window.__mynaPerf;p.renders={};window.__FIKA_RENDER_METRICS__=p.renders;p.paints=0;p.notifications=0;p.tasks=[];p.gaps=[]
   const slides=window.__FIKA_SLIDES__, initial=slides.getState(), slide=initial.slides[0], el=slide.elements.find(e=>e.type==='text'),off=slides.subscribe(()=>p.notifications++)
   const canvas=document.querySelector('.canvas');let previous=performance.now()
   for(let i=0;i<45;i++){
    await new Promise(requestAnimationFrame);const now=performance.now();p.gaps.push(now-previous);previous=now
    if(mode==='pan')canvas.dispatchEvent(new WheelEvent('wheel',{deltaX:3,deltaY:1,bubbles:true,cancelable:true}))
    if(mode==='element')slides.getState().updateElement({id:el.id,slideId:slide.id,props:{left:el.left+(i%2)}})
    if(mode==='section') {const s=slides.getState().slides[0];slides.getState().updateSlide({workspaceLabels:s.workspaceLabels.map(l=>l.id==='school-section-identity'?{...l,x:l.x+1}:l)},s.id)}
   }
   await new Promise(r=>setTimeout(r,250));off()
   const sorted=p.gaps.slice(1).sort((a,b)=>a-b)
   return {renders:{...p.renders},paints:p.paints,notifications:p.notifications,frameP95:Math.round(sorted[Math.floor(sorted.length*.95)]*10)/10,longTasks:p.tasks.length}
  },mode)
 }
 if(process.env.FIKA_PERF_ASSERT==='1') {
  assert.equal(results.pan.renders.WorkspaceLabelsCanvas||0,0,'panning cannot rerender annotation content')
  for(const name of ['MynaWorkspace','MynaPageCanvas','WorkspaceLabelsCanvas','WorkspaceObject']) assert.equal(results.element.renders[name]||0,0,`element edits must not invalidate ${name}`)
  for(const name of ['MynaWorkspace','Canvas','ThumbnailSlide']) assert.equal(results.section.renders[name]||0,0,`annotation edits must not invalidate ${name}`)
 }
 await mkdir('output/myna',{recursive:true})
 const path=process.env.FIKA_PERF_OUTPUT||'output/myna/perf.json';await writeFile(path,JSON.stringify(results,null,2))
 console.log(JSON.stringify(Object.fromEntries(Object.entries(results).map(([mode,r])=>[mode,{...r,renders:Object.fromEntries(Object.entries(r.renders).filter(([n])=>/Myna|Workspace|Canvas|Thumbnail/.test(n)))}])),null,2))
} finally {await browser.close()}
