import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
const failures = []
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  for (const restriction of ['locked', 'hidden', 'visible', 'clipped', 'unclipped']) {
    await page.evaluate(restriction => {
      const shape = (id,left,top,extra={}) => ({id,type:'shape',left,top,width:100,height:80,rotate:0,viewBox:[100,80],path:'M0 0H100V80H0Z',fill:'#123456',fixedRatio:false,...extra})
      const s = window.__FIKA_SLIDES__.getState()
      s.setSlides([{ id:'marquee-slide', elements:[
        shape('outer',100,100,{width:250,height:200,frame:{clipContent:restriction!=='unclipped'},lock:restriction==='locked'}),
        shape('inner',120,120,{width:180,height:140,frame:{clipContent:restriction!=='unclipped'},parentFrameId:'outer'}),
        shape('child',restriction==='clipped'||restriction==='unclipped'?350:140,140,{parentFrameId:'inner'}),
        shape('outside',500,100),
      ] }]); s.updateSlideIndex(0)
      const m = window.__FIKA_MAIN__.getState()
      m.setHiddenElementIdList(restriction==='hidden'?['outer']:[])
      m.setActiveElementIdList([])
    },restriction)
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const point = await page.evaluate(restriction => {
      const r = [...document.querySelectorAll('.viewport-wrapper')].map(el=>el.getBoundingClientRect()).sort((a,b)=>b.width-a.width)[0]
      const s=window.__FIKA_MAIN__.getState().canvasScale
      return {x:r.x+(restriction==='clipped'||restriction==='unclipped'?380:160)*s,y:r.y+160*s}
    },restriction)
    await page.keyboard.down('Alt')
    await page.mouse.click(point.x,point.y)
    await page.keyboard.up('Alt')
    const selected = await page.evaluate(() => window.__FIKA_MAIN__.getState().activeElementIdList)
    console.log(restriction, 'click selected:',selected)
    try {
      assert.deepEqual(selected,restriction === 'visible' || restriction === 'unclipped' ? ['child'] : [],`${restriction}: Alt-click respects frame visibility and locks`)
    }
    catch(error) { failures.push(error.message) }
    await page.keyboard.press('Escape')
  }
  assert.deepEqual(errors,[])
  assert.deepEqual(failures,[])
  console.log('PASS Alt-click respects frame locks, visibility, and clipping')
} finally { await browser.close() }
