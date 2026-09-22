import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
const browser=await chromium.launch({headless:true})
try {
  const page=await browser.newPage({viewport:{width:1800,height:1200}})
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(`${process.env.FIKA_TEST_URL||'http://127.0.0.1:5173'}/?mode=myna&locale=cs`)
  await page.locator('[data-myna-workspace-object]').first().waitFor()
  await page.waitForTimeout(1500)
  const read=()=>page.evaluate(()=>{const s=window.__FIKA_SLIDES__.getState();return {slides:s.slides,scale:window.__FIKA_MAIN__.getState().canvasScale}})
  const before=await read()
  assert.equal(await page.locator('[data-kind="section"]').count(),3)
  assert.equal(await page.locator('[data-kind="comment"]').count(),2)
  assert.equal(await page.locator('[data-myna-frame-title]').count(),0,'hide unselected nested frame titles at overview zoom')
  const section=page.locator('[data-myna-workspace-object="school-section-identity"]')
  const handle=section.locator('[data-myna-workspace-object-handle]')
  await page.evaluate(() => {
    const store=window.__FIKA_SLIDES__, start=store.getState().slides
    window.__workspacePartialWrites=0
    window.__workspaceUnsubscribe=store.subscribe(state=>{
      const dx=state.slides[0].canvasPosition.x-start[0].canvasPosition.x
      const other=state.slides[3].canvasPosition.x-start[3].canvasPosition.x
      if(Math.abs(dx-other)>.001)window.__workspacePartialWrites++
    })
  })
  const box=await handle.boundingBox()
  await page.mouse.move(box.x+50,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+100,box.y+box.height/2+25,{steps:8});await page.mouse.up()
  await page.waitForTimeout(450)
  assert.equal(await page.evaluate(()=>{window.__workspaceUnsubscribe();return window.__workspacePartialWrites}),0,'group movement is one atomic store transaction')
  const after=await read(), dx=after.slides[0].canvasPosition.x-before.slides[0].canvasPosition.x,dy=after.slides[0].canvasPosition.y-before.slides[0].canvasPosition.y
  assert.ok(Math.abs(dx)>20)
  assert.equal(after.slides[3].canvasPosition.x-before.slides[3].canvasPosition.x,dx)
  assert.equal(after.slides[3].canvasPosition.y-before.slides[3].canvasPosition.y,dy)
  assert.deepEqual(after.slides[1].canvasPosition,before.slides[1].canvasPosition)
  await handle.press('Control+z');await page.waitForTimeout(450)
  assert.deepEqual((await read()).slides.map(s=>s.canvasPosition),before.slides.map(s=>s.canvasPosition))
  // Resolved status is persisted workspace metadata, independent of page artwork.
  const note=page.locator('[data-myna-workspace-object="school-comment-identity"]')
  await note.getByRole('button',{name:'Vyřešit',exact:true}).click()
  assert.equal((await read()).slides[0].workspaceLabels.find(l=>l.id==='school-comment-identity').resolved,true)
  await note.getByRole('button',{name:'Znovu otevřít',exact:true}).click()
  await page.getByRole('button',{name:'Stránky',exact:true}).click()
  const panel=page.locator('[data-myna-workspace-objects-panel]')
  await panel.getByRole('button',{name:'Přidat komentář',exact:true}).click()
  assert.equal(await page.locator('[data-kind="comment"]').count(),3)
  const reply=panel.getByRole('textbox',{name:'Odpověď',exact:true}).last()
  await reply.fill('Ověřená odpověď');await panel.getByRole('button',{name:'Přidat odpověď',exact:true}).last().click()
  assert.ok((await read()).slides.flatMap(s=>s.workspaceLabels||[]).some(l=>l.replies?.includes('Ověřená odpověď')))
  // Removing a section must retain its pages.
  await panel.locator('details').first().getByRole('button',{name:'Odstranit',exact:true}).click()
  assert.equal((await read()).slides.length,6)
  assert.equal(await page.locator('[data-kind="section"]').count(),2)
  await page.evaluate(()=>window.__FIKA_MAIN__.getState().setReadOnly(true))
  assert.equal(await panel.getByRole('button',{name:'Přidat komentář',exact:true}).isDisabled(),true)
  const lockedBefore=await read()
  const lockedHandle=page.locator('[data-kind="section"] [data-myna-workspace-object-handle]').first()
  await lockedHandle.press('ArrowRight')
  assert.deepEqual((await read()).slides,lockedBefore.slides)
  // Fresh demo screenshot after behavior checks.
  await page.reload();await page.locator('[data-kind="section"]').first().waitFor();await page.waitForTimeout(1000)
  await page.evaluate(()=>document.querySelectorAll('react-scan-overlay,#react-scan-root,#react-scan-toolbar').forEach(n=>n.remove()))
  await mkdir('output/myna',{recursive:true});await page.screenshot({path:'output/myna/workspace-sections-comments.png'})
  assert.deepEqual(errors,[])
  console.log('PASS workspace sections/comments: group movement, undo, comments, replies, resolve/reopen, section deletion preserves pages, overview frame labels')
} finally {await browser.close()}
