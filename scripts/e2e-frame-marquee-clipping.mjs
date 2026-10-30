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
  for (const restriction of ['clipped', 'unclipped', 'visible-part']) {
    await page.evaluate(restriction => {
      const shape = (id,left,top,extra={}) => ({id,type:'shape',left,top,width:100,height:80,rotate:0,viewBox:[100,80],path:'M0 0H100V80H0Z',fill:'#123456',fixedRatio:false,...extra})
      const s = window.__FIKA_SLIDES__.getState()
      s.setSlides([{ id:'marquee-slide', elements:[
        shape('outer',100,100,{width:200,height:200,frame:{clipContent:restriction!=='unclipped'}}),
        shape('child',250,150,{width:200,height:100,parentFrameId:'outer'}),
      ] }]); s.updateSlideIndex(0)
      const m = window.__FIKA_MAIN__.getState()
      m.setHiddenElementIdList([])
      m.setActiveElementIdList([])
    },restriction)
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const points = await page.evaluate(restriction => {
      const r = [...document.querySelectorAll('.viewport-wrapper')].map(el=>el.getBoundingClientRect()).sort((a,b)=>b.width-a.width)[0]
      const s=window.__FIKA_MAIN__.getState().canvasScale
      return restriction === 'visible-part'
        ? {x:r.x+20*s,y:r.y+20*s,endX:r.x+290*s,endY:r.y+280*s}
        : {x:r.x+350*s,y:r.y+50*s,endX:r.x+470*s,endY:r.y+250*s}
    },restriction)
    await page.mouse.move(points.x,points.y); await page.mouse.down()
    await page.mouse.move(points.endX,points.endY,{steps:12}); await page.mouse.up()
    const selected = await page.evaluate(() => window.__FIKA_MAIN__.getState().activeElementIdList)
    console.log(restriction, 'marquee selected:',selected)
    try {
      assert.deepEqual(selected,restriction === 'clipped' ? [] : restriction === 'visible-part' ? ['outer','child'] : ['child'],`${restriction}: invisible overflow cannot be selected by its bounds`)
    }
    catch(error) { failures.push(error.message) }
  }
  assert.deepEqual(errors,[])
  assert.deepEqual(failures,[])
  console.log('PASS drag selection respects frame clipping and permits visible overflow')
} finally { await browser.close() }
