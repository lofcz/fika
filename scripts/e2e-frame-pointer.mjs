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
  for (const restriction of ['locked', 'hidden', 'visible']) {
    await page.evaluate(restriction => {
      const shape = (id,left,top,extra={}) => ({id,type:'shape',left,top,width:100,height:80,rotate:0,viewBox:[100,80],path:'M0 0H100V80H0Z',fill:'#123456',fixedRatio:false,...extra})
      const s = window.__FIKA_SLIDES__.getState()
      s.setSlides([{ id:'marquee-slide', elements:[
        shape('outer',100,100,{width:250,height:200,frame:{clipContent:true},lock:restriction==='locked'}),
        shape('inner',120,120,{width:180,height:140,frame:{clipContent:true},parentFrameId:'outer'}),
        shape('child',140,140,{parentFrameId:'inner'}),
        shape('outside',500,100),
      ] }]); s.updateSlideIndex(0)
      const m = window.__FIKA_MAIN__.getState()
      m.setHiddenElementIdList(restriction==='hidden'?['outer']:[])
      m.setActiveElementIdList([])
    },restriction)
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const point = await page.evaluate(() => {
      const r = [...document.querySelectorAll('.viewport-wrapper')].map(el=>el.getBoundingClientRect()).sort((a,b)=>b.width-a.width)[0]
      const s=window.__FIKA_MAIN__.getState().canvasScale
      return {x:r.x+160*s,y:r.y+160*s}
    })
    await page.mouse.click(point.x,point.y)
    const selected = await page.evaluate(() => window.__FIKA_MAIN__.getState().activeElementIdList)
    console.log(restriction, 'click selected:',selected)
    try {
      assert.deepEqual(selected,restriction === 'visible' ? ['child'] : [],`${restriction}: direct clicks respect frame ancestor restrictions`)
      const before = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements)
      await page.keyboard.press('ArrowRight')
      const after = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements)
      if (restriction !== 'visible') assert.deepEqual(after,before,'Clicking restricted frame contents cannot make them movable')
      else assert.equal(after[2].left,141,'Visible child remains editable')
      if (restriction === 'locked') {
        await page.mouse.click(point.x,point.y,{button:'right'})
        await page.getByText('Unlock',{exact:true}).click()
        await page.waitForFunction(() => !window.__FIKA_SLIDES__.getState().slides[0].elements[0].lock)
        await page.locator('.viewport-wrapper').first().click({position:{x:10,y:10}})
        await page.mouse.click(point.x,point.y)
        assert.deepEqual(await page.evaluate(() => window.__FIKA_MAIN__.getState().activeElementIdList),['child'],'Unlock restores child pointer access')
      }

    }
    catch(error) { failures.push(error.message) }
  }
  assert.deepEqual(errors,[])
  assert.deepEqual(failures,[])
  console.log('PASS direct clicks respect frame ancestor restrictions')
} finally { await browser.close() }
