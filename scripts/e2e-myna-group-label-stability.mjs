import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1800,height:1200}})
await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173'}/?mode=myna&locale=en`);await page.locator('[data-kind="section"]').first().waitFor();await page.waitForTimeout(900)
try {
for(const action of ['group','page','pan']){
 await page.reload();await page.locator('[data-kind="section"]').first().waitFor();await page.waitForTimeout(600)
 const handle=page.locator('[data-myna-workspace-object="school-section-identity"] [data-myna-workspace-object-handle]')
 const target=action==='page'?page.locator('[data-myna-page-handle]').first():handle
 const b=await target.boundingBox()
 await page.evaluate(()=>{window.samples=[];const sample=()=>{let r=document.querySelector('[data-myna-workspace-object="school-section-identity"] [data-myna-workspace-object-handle]').getBoundingClientRect();let p=document.querySelector('[data-myna-page-handle]').getBoundingClientRect();let other=document.querySelector('[data-myna-workspace-object="school-section-editorial"] [data-myna-workspace-object-handle]').getBoundingClientRect();window.samples.push({x:r.x,y:r.y,px:p.x,py:p.y,ox:other.x,oy:other.y});window.raf=requestAnimationFrame(sample)};sample()})
 await page.keyboard.down('Alt');await page.mouse.move(b.x+25,b.y+b.height/2);await page.mouse.down({button:action==='pan'?'middle':'left'})
 for(let i=1;i<=45;i++){await page.mouse.move(b.x+25+i*1.37,b.y+b.height/2+i*.71);await page.waitForTimeout(17)}
 await page.mouse.up({button:action==='pan'?'middle':'left'});await page.keyboard.up('Alt');await page.waitForTimeout(100)
 const result=await page.evaluate(()=>{cancelAnimationFrame(window.raf);let s=window.samples;const range=f=>Math.max(...s.map(f))-Math.min(...s.map(f));return {relativeX:range(v=>v.x-v.px),relativeY:range(v=>v.y-v.py),otherX:range(v=>v.ox),otherY:range(v=>v.oy),samples:s}})
 if(action !== 'pan') {
   assert.ok(result.otherX < .001 && result.otherY < .001, `${action}: stationary group labels must not move even by a layout subpixel`)
 }
 if(action !== 'page') {
   assert.ok(result.relativeX < .04 && result.relativeY < .04, `${action}: group titles stay attached to their pages`)
 }
 console.log(action === 'pan' ? 'PASS pan: group labels track pages' : `PASS ${action}: stationary label drift ${result.otherX}px / ${result.otherY}px`)

}
} finally { await browser.close() }
