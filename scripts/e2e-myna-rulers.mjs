import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
const base = process.env.FIKA_TEST_URL || 'http://127.0.0.1:5178'
const errors = []
page.on('pageerror', error => errors.push(error.message))
const guides = () => page.evaluate(() => { const s = window.__FIKA_SLIDES__.getState(); return s.slides[s.slideIndex].guides || [] })
const geometry = () => page.evaluate(() => {
  const panel = document.querySelector('.myna-canvas').getBoundingClientRect()
  const viewport = document.querySelector('.myna-canvas .viewport-wrapper').getBoundingClientRect()
  return { panel: { x:panel.x, y:panel.y, width:panel.width, height:panel.height }, page: { x:viewport.x, y:viewport.y }, scale:window.__FIKA_MAIN__.getState().canvasScale }
})
async function createGuide(axis, position) {
  const g = await geometry()
  const origin = axis === 'x' ? { x:g.panel.x+12, y:g.panel.y+100 } : { x:g.panel.x+100, y:g.panel.y+12 }
  const target = axis === 'x' ? { x:g.page.x+position*g.scale, y:origin.y } : { x:origin.x, y:g.page.y+position*g.scale }
  await page.mouse.move(origin.x, origin.y); await page.mouse.down()
  await page.mouse.move(target.x, target.y, { steps:8 }); await page.mouse.up()
}
async function preference(name, checked) {
  await page.getByRole('button', { name:'View', exact:true }).click()
  await page.getByRole('dialog', { name:'View', exact:true }).getByLabel(name, { exact:true }).setChecked(checked)
  await page.keyboard.press('Escape')
}
async function aligned() {
  const g = await geometry()
  for (const guide of await guides()) {
    const box = await page.locator(`[data-myna-guide="${guide.id}"]`).boundingBox()
    const actual = guide.axis === 'x' ? box.x+4 : box.y+4
    const expected = (guide.axis === 'x' ? g.page.x : g.page.y) + guide.position*g.scale
    assert.ok(Math.abs(actual-expected) < 1, 'guide stays aligned to document coordinates')
  }
}
try {
  await page.goto(`${base}/?mode=myna&locale=en`, { waitUntil:'networkidle' })
  await page.locator('[data-myna-ruler="horizontal"]').waitFor()
  await page.getByRole('button', { name:'Close library', exact:true }).click()
  await page.evaluate(async () => {
    const s = window.__FIKA_SLIDES__.getState()
    s.setViewportSize(1000); s.setViewportRatio(1); s.updateSlideIndex(0)
    s.setSlides([{ id:'ruler-page', elements:[{ id:'selected-shape', type:'shape', left:400,top:400,width:150,height:100,rotate:0,fill:'#999999',fixedRatio:false,viewBox:[100,100],path:'M0 0 H100 V100 H0 Z' }] }])
    window.__FIKA_MAIN__.getState().setCanvasPercentage(65)
    await window.__FIKA_SNAPSHOT__.getState().addSnapshot()
  })
  await page.waitForTimeout(300)
  const labels = await page.locator('[data-myna-ruler="horizontal"] text').allTextContents()
  assert.ok(labels.includes('0') && labels.some(label => label.startsWith('-')), 'rulers cover negative space and page zero')
  await createGuide('y', 180)
  await createGuide('x', 210)
  let current = await guides()
  assert.equal(current.length,2)
  const horizontal = current.find(g => g.axis==='y'), vertical = current.find(g => g.axis==='x')
  assert.ok(Math.abs(horizontal.position-180)<=1 && Math.abs(vertical.position-210)<=1)
  await aligned()
  const guide = page.locator(`[data-myna-guide="${vertical.id}"]`)
  await page.waitForTimeout(400)
  const keyboardCursor = await page.evaluate(()=>window.__FIKA_SNAPSHOT__.getState().snapshotCursor)
  await guide.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Shift+ArrowRight')
  assert.equal((await guides()).find(g=>g.id===vertical.id).position,vertical.position+11)
  await page.waitForFunction(cursor=>window.__FIKA_SNAPSHOT__.getState().snapshotCursor>cursor,keyboardCursor)
  await page.keyboard.press('Control+z')
  await page.waitForFunction(({id,position})=>window.__FIKA_SLIDES__.getState().slides[0].guides.find(g=>g.id===id)?.position===position,{id:vertical.id,position:vertical.position})
  await page.keyboard.press('Control+y')
  await page.waitForFunction(({id,position})=>window.__FIKA_SLIDES__.getState().slides[0].guides.find(g=>g.id===id)?.position===position,{id:vertical.id,position:vertical.position+11})
  const old = await geometry()
  await page.mouse.move(old.page.x+(vertical.position+11)*old.scale,old.panel.y+70)
  await page.mouse.down(); await page.mouse.move(old.page.x+330*old.scale,old.panel.y+70,{steps:8}); await page.mouse.up()
  assert.ok(Math.abs((await guides()).find(g=>g.id===vertical.id).position-330)<=1)
  await page.evaluate(() => {
    window.__FIKA_MAIN__.getState().setActiveElementIdList(['selected-shape'])
    window.__FIKA_MAIN__.getState().setCanvasPercentage(50)
  })
  await page.waitForTimeout(200)
  await aligned()
  assert.ok(await page.locator('[data-myna-ruler="horizontal"] .selection-span').evaluate(el=>Number(el.getAttribute('width'))>0))
  const beforePan = await geometry()
  await page.mouse.move(beforePan.page.x+750*beforePan.scale,beforePan.page.y+700*beforePan.scale)
  await page.keyboard.down('Space'); await page.mouse.down()
  await page.mouse.move(beforePan.page.x+750*beforePan.scale+45,beforePan.page.y+700*beforePan.scale+20,{steps:8})
  await page.mouse.up(); await page.keyboard.up('Space')
  await aligned()
  await preference('Lock guides',true)
  assert.equal(await guide.getAttribute('aria-disabled'),'true')
  const locked = JSON.stringify(await guides())
  await guide.focus(); await page.keyboard.press('Delete')
  assert.equal(JSON.stringify(await guides()),locked)
  await preference('Lock guides',false)
  await preference('Show layout grid',true)
  await page.locator('[data-myna-grid]').waitFor()
  const gridBox = await page.locator('[data-myna-grid]').boundingBox()
  const g = await geometry()
  assert.ok(Math.abs(gridBox.width-1000*g.scale)<1 && Math.abs(gridBox.x-g.page.x)<1,'grid remains bounded to page')
  await preference('Show guides',false)
  assert.equal(await page.locator('[data-myna-guide]').count(),0)
  await preference('Show guides',true)
  await aligned()
  // Escape cancels creation without adding a guide or changing page selection.
  let panel = (await geometry()).panel
  await page.mouse.move(panel.x+100,panel.y+12); await page.mouse.down()
  await page.mouse.move(panel.x+100,panel.y+170,{steps:5}); await page.keyboard.press('Escape'); await page.mouse.up()
  assert.equal((await guides()).length,2)
  // Returning an existing horizontal guide to the top ruler removes it; undo restores it.
  const beforeDelete = await page.evaluate(()=>window.__FIKA_SNAPSHOT__.getState().snapshotCursor)
  const h = await geometry()
  await page.mouse.move(h.panel.x+100,h.page.y+horizontal.position*h.scale); await page.mouse.down()
  await page.mouse.move(h.panel.x+100,h.panel.y+10,{steps:8}); await page.mouse.up()
  assert.equal((await guides()).length,1)
  await page.waitForFunction(cursor=>window.__FIKA_SNAPSHOT__.getState().snapshotCursor>cursor,beforeDelete)
  await page.evaluate(()=>window.__FIKA_SNAPSHOT__.getState().unDo())
  assert.equal((await guides()).length,2)
  await guide.focus(); await page.keyboard.press('Delete')
  assert.equal((await guides()).length,1)
  await preference('Show guides',false)
  const keyboardRuler = page.locator('[data-myna-ruler="vertical"]')
  await keyboardRuler.focus(); await keyboardRuler.press('Enter')
  assert.equal((await guides()).length,2)
  const keyboardGuide = (await guides()).find(g=>g.axis==='x')
  assert.equal(keyboardGuide.position,500)
  assert.equal(await page.locator('[data-myna-guide]').count(),2,'creating a guide reveals hidden guides')
  await page.waitForFunction(id=>document.activeElement?.getAttribute('data-myna-guide')===id,keyboardGuide.id)
  await page.keyboard.press('ArrowLeft')
  assert.equal((await guides()).find(g=>g.id===keyboardGuide.id).position,499)
  await page.keyboard.press('Delete')
  assert.equal((await guides()).length,1)
  await page.evaluate(()=>window.__FIKA_MAIN__.getState().setReadOnly(true))
  assert.equal(await page.locator('[data-myna-ruler="horizontal"]').isDisabled(),true)
  const remaining = page.locator('[data-myna-guide]').first()
  await remaining.focus(); await page.keyboard.press('Delete')
  assert.equal((await guides()).length,1)
  await mkdir('output/myna',{recursive:true})
  await page.screenshot({path:'output/myna/rulers.png'})
  assert.deepEqual(errors,[])
  console.log('Myna rulers: adaptive/negative ticks, create/move/remove, keyboard, selected spans, zoom/pan, grid bounds, hide/lock, cancellation, undo and read-only passed.')
} finally { await browser.close() }
