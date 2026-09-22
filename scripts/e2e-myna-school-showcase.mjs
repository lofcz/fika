import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
const browser = await chromium.launch({headless:true})
try {
  const page = await browser.newPage({viewport:{width:1800,height:1200}})
  const errors=[]; page.on('pageerror', e=>errors.push(e.message))
  await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173'}/?mode=myna&locale=cs`)
  await page.locator('[data-myna-workspace]').waitFor()
  await page.waitForTimeout(2500)
  const state = await page.evaluate(()=> { const s=window.__FIKA_SLIDES__.getState(); return {slides:s.slides,title:s.title,scale:window.__FIKA_MAIN__.getState().canvasScale} })
  assert.equal(state.slides.length,6)
  assert.match(state.title,/OBZOR/)
  assert.ok(state.slides.every(s=>s.canvasPosition && s.canvasName))
  assert.equal(new Set(state.slides.map(s=>s.canvasPosition.x)).size,6)
  assert.equal(new Set(state.slides.map(s=>s.canvasPosition.y)).size,6)
  assert.ok(state.slides.some(s=>s.elements.some(e=>e.frame)))
  assert.ok(state.slides.flatMap(s=>s.elements).filter(e=>e.type==='text').every(e=>e.fixedHeight))
  const visible = await page.locator('[data-myna-page-handle]').evaluateAll(nodes=>nodes.map(n=> { const b=n.getBoundingClientRect(); return b.x>=70 && b.y>=100 && b.right<=innerWidth && b.bottom<=innerHeight-120 }))
  assert.equal(visible.filter(Boolean).length,6, 'all pages start inside the canvas')
  await page.evaluate(()=>document.querySelectorAll('react-scan-overlay, #react-scan-root, #react-scan-toolbar').forEach(n=>n.remove()))
  await mkdir('output/myna',{recursive:true})
  await page.screenshot({path:'output/myna/school-showcase.png'})
  assert.deepEqual(errors,[])
  console.log('PASS Czech school showcase: six staggered pages, editable frame/text content, initial fit-all, no runtime errors')
} finally { await browser.close() }
