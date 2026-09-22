import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser=await chromium.launch({headless:true})
try {
 const page=await browser.newPage({viewport:{width:1600,height:1000}})
 await page.goto(`${process.env.FIKA_TEST_URL||'http://127.0.0.1:5173'}/?mode=myna&locale=cs`)
 await page.locator('[data-kind="section"]').first().waitFor()
 await page.waitForTimeout(600)
 const results=[]
 for(const scale of [.1,.15,.2,.25,.33,.5,.75,1,1.5,2]) {
  await page.evaluate(scale=>window.__FIKA_MAIN__.getState().setCanvasScale(scale),scale)
  await page.waitForTimeout(100)
  const result=await page.evaluate(()=>{
   const labels=window.__FIKA_SLIDES__.getState().slides.flatMap(s=>s.workspaceLabels||[])
   const overlaps=[]
   for(const label of labels.filter(l=>l.kind==='section')) {
    const h=document.querySelector(`[data-myna-workspace-object="${label.id}"] [data-myna-workspace-object-handle]`).getBoundingClientRect()
    for(const id of label.pageIds||[]) {
     const node=document.querySelector(`[data-myna-page-handle="${id}"]`); if(!node)continue
     const b=node.getBoundingClientRect()
     if(b.left<h.right&&b.right>h.left&&b.top<h.bottom&&b.bottom>h.top) overlaps.push(id)
    }
   }
   const card=document.querySelector('[data-kind="comment"]'),body=card.querySelector('p').parentElement
   return {overlaps, commentWidth:card.getBoundingClientRect().width, lineHeight:getComputedStyle(body.querySelector('p')).lineHeight, scroll:body.scrollHeight, height:body.clientHeight}
  })
  assert.deepEqual(result.overlaps,[],`section/page titles at ${scale*100}%`)
  results.push(result)
 }
 assert.ok(results.every(r=>r.lineHeight===results[0].lineHeight),'comment text uses stable world-space layout')
 assert.ok(Math.abs(results[9].commentWidth/results[0].commentWidth-20)<.01)
 await page.getByRole('button',{name:'Zobrazit všechny stránky',exact:true}).click()
 await page.waitForTimeout(300)
 await page.evaluate(()=>document.querySelectorAll('[data-react-scan],react-scan-overlay,#react-scan-root,#react-scan-toolbar').forEach(n=>n.remove()))
 await page.screenshot({path:'output/myna/workspace-zoom-spacing.png'})
 console.log('PASS: no section/page title overlaps at 10–200%; comment layout scales as one object')
} finally {await browser.close()}
