import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
try {
 const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
 const errors = []; page.on('pageerror', e => errors.push(e.message))
 await page.goto(process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' })
 await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
 for (const reverse of [false, true]) {
 await page.locator('.viewport-wrapper').first().click({position:{x:10,y:10}})
 await page.evaluate(() => {
  const data = [0,1,2].map(r => [0,1,2].map(c => ({id:`scope-${r}-${c}`, rowspan:1,colspan:1,text:`Cell ${r} ${c}`})))
  data[1][1].rowspan=2; data[1][1].colspan=2
  const s = window.__FIKA_SLIDES__.getState()
  s.setSlides([{ id:'scope-slide', elements:[{id:'scope-table',type:'table',left:100,top:100,width:600,height:240,rotate:0,colWidths:[1/3,1/3,1/3],cellMinHeight:80,outline:{width:1,color:'#000',style:'solid'},data}]}]);s.updateSlideIndex(0)
 })
 const root = page.locator('#editable-element-scope-table')
 const cell = root.locator('[data-cell-index="0_0"]'); await cell.waitFor()
 const b = await cell.boundingBox(); await page.mouse.dblclick(b.x+b.width/2,b.y+b.height/2)
 await root.locator('.custom-textarea').focus()
 const first = await cell.boundingBox()
 const merged = root.locator('[data-cell-index="1_1"]')
 const last = await merged.boundingBox()
 const from = reverse ? last : first
 const to = reverse ? first : last
 await page.mouse.move(from.x+10, from.y+10); await page.mouse.down()
 await page.mouse.move(to.x+10,to.y+10,{steps:8}); await page.mouse.up()
 assert.equal(await root.locator('td.selected').count(),9,'Selection includes the whole merged region')
 await merged.click({button:'right',position:{x:10,y:10}})
 await page.getByText('Merge cells',{exact:true}).click()
 const data = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0].data)
 console.log('Merged extent:',data[0][0].rowspan,data[0][0].colspan)
 assert.equal(data[0][0].rowspan,3,'Merge includes all rows of the selected merged cell')
 assert.equal(data[0][0].colspan,3,'Merge includes all columns of the selected merged cell')
 assert.equal(await root.locator('td:visible').count(),1,'Merged selection has no gaps or leftover fragments')
 assert(data.flat().slice(1).every(cell => cell.rowspan === 1 && cell.colspan === 1), 'Covered cells do not retain old merges')
 await cell.click({button:'right',position:{x:10,y:10}})
 await page.getByText('Unmerge cells',{exact:true}).click()
 assert.equal(await root.locator('td:visible').count(),9,'Unmerging restores every individual cell')
 const restored = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0].data)
 restored.forEach((row,r) => row.forEach((cell,c) => assert.equal(cell.text,`Cell ${r} ${c}`,'Merging and unmerging preserve cell text')))
 }
 console.log('PASS merge selection expands over existing regions, removes overlapping spans, and unmerges without losing content')
 assert.deepEqual(errors,[])
} finally {await browser.close()}
