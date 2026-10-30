import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173/'}?locale=en`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  for (const member of [true, false]) {
    await page.evaluate(() => {
      const s = window.__FIKA_SLIDES__.getState()
      s.setSlides([{ id: 'align-group', elements: ['left', 'right'].map((id, i) => ({ id, groupId: 'pair', type: 'shape', left: 100 + i * 300, top: 100, width: 200, height: 100, rotate: 0, viewBox: [200,100], path: 'M0 0H200V100H0Z', fill: '#ff0000', fixedRatio: false })) }])
      s.updateSlideIndex(0)
    })
    await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().initSnapshotDatabase())
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.evaluate(() => {
      window.__FIKA_MAIN__.setState({ activeElementIdList: ['left', 'right'], handleElementId: 'left', activeGroupElementId: 'left', editorAreaFocus: true })
      window.__FIKA_MAIN__.getState().setToolbarState('elPosition')
    })
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.evaluate(member => {
      window.__FIKA_MAIN__.getState().setActiveGroupElementId(member ? 'left' : '')
      window.__FIKA_MAIN__.getState().setToolbarState(member ? 'elPosition' : 'multiPosition')
    }, member)
    await page.keyboard.press('Control+l')
    const elements = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements)
    console.log('Locks:', elements.map(el => [el.id, !!el.lock]))
    assert.equal(elements[0].lock, true, 'Selected member is locked')
    assert.equal(!!elements[1].lock, !member, 'Only the selected member is locked unless the entire group is selected')
    assert.deepEqual(await page.evaluate(() => window.__FIKA_MAIN__.getState().activeElementIdList), [], 'Locking clears the active selection')
    await page.waitForFunction(() => window.__FIKA_SNAPSHOT__.getState().snapshotCursor === 1)
    if (member) {
      const point = await page.evaluate(() => {
        const r = [...document.querySelectorAll('.viewport-wrapper')].map(el => el.getBoundingClientRect()).sort((a,b) => b.width-a.width)[0]
        const scale = window.__FIKA_MAIN__.getState().canvasScale
        return { x:r.x+450*scale, y:r.y+130*scale }
      })
      await page.mouse.click(point.x,point.y)
      assert.deepEqual(await page.evaluate(() => window.__FIKA_MAIN__.getState().activeElementIdList), ['right'], 'Clicking an unlocked sibling excludes the locked member')
      await page.keyboard.press('ArrowRight')
      const moved = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements)
      assert.equal(moved[0].left,100,'The locked member cannot move through group selection')
      assert.equal(moved[1].left,401,'The unlocked sibling remains editable')
      await page.waitForFunction(() => window.__FIKA_SNAPSHOT__.getState().snapshotCursor === 2)
      await page.keyboard.press('Control+z')
      await page.waitForFunction(() => window.__FIKA_SNAPSHOT__.getState().snapshotCursor === 1)
      // Separate deliberate undo gestures beyond the shortcut's repeat throttle.
      await page.waitForTimeout(150)
    }

    await page.keyboard.press('Control+z')
    await page.waitForFunction(() => window.__FIKA_SLIDES__.getState().slides[0].elements.every(el => !el.lock))
    const restored = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements)
    assert.deepEqual(restored.map(el => [el.id, el.left, el.top, el.groupId]), [['left',100,100,'pair'],['right',400,100,'pair']], 'Undo restores lock state without changing grouping or geometry')
    console.log(`PASS ${member ? 'member' : 'whole group'} lock and undo`)


  }
  assert.deepEqual(errors,[])
} finally { await browser.close() }
