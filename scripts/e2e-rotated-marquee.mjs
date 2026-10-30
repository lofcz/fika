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
  for (const angle of [45, -45, 30, -30]) for (const region of ['empty-corner', 'visible']) {
    await page.evaluate(angle => {
      const shape = (id,left,top,extra={}) => ({id,type:'shape',left,top,width:100,height:80,rotate:0,viewBox:[100,80],path:'M0 0H100V80H0Z',fill:'#123456',fixedRatio:false,...extra})
      const s = window.__FIKA_SLIDES__.getState()
      s.setSlides([{ id:'marquee-slide', elements:[
        shape('rotated',200,200,{width:200,height:200,rotate:angle}),
      ] }]); s.updateSlideIndex(0)
      const m = window.__FIKA_MAIN__.getState()
      m.setHiddenElementIdList([])
      m.setActiveElementIdList([])
    },angle)
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const points = await page.evaluate(region => {
      const r = [...document.querySelectorAll('.viewport-wrapper')].map(el=>el.getBoundingClientRect()).sort((a,b)=>b.width-a.width)[0]
      const s=window.__FIKA_MAIN__.getState().canvasScale
      const end = region === 'empty-corner' ? 200 : 310
      return {x:r.x+150*s,y:r.y+150*s,endX:r.x+end*s,endY:r.y+end*s}
    },region)
    await page.mouse.move(points.x,points.y); await page.mouse.down()
    await page.mouse.move(points.endX,points.endY,{steps:12}); await page.mouse.up()
    const selected = await page.evaluate(() => window.__FIKA_MAIN__.getState().activeElementIdList)
    console.log(angle,region,'selected:',selected)
    try {
      assert.deepEqual(selected,region === 'empty-corner' ? [] : ['rotated'],`${angle} degrees: drag selection uses the rotated rectangle`)
    }
    catch(error) { failures.push(error.message) }
  }
  assert.deepEqual(errors,[])
  assert.deepEqual(failures,[])
  console.log('PASS drag selection excludes empty rotated corners and includes visible areas')
} finally { await browser.close() }
