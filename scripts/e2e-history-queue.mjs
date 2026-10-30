import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { ensureDevServer } from './lib/dev-server.mjs'
const { url, child } = await ensureDevServer()
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  await page.goto(`${url}?locale=en`, { waitUntil: 'domcontentloaded' })
  await page.locator('.viewport-wrapper').first().waitFor({ state: 'visible' })
  await page.waitForFunction(() => window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)
  const result = await page.evaluate(async () => {
    const slides = window.__FIKA_SLIDES__
    const history = window.__FIKA_SNAPSHOT__
    slides.getState().setSlides([{ id: 'history', elements: [] }])
    slides.getState().setTitle('Initial')
    await history.getState().initSnapshotDatabase()
    slides.getState().setTitle('First edit')
    const first = history.getState().addSnapshot()
    slides.getState().setTitle('Second edit')
    const second = history.getState().addSnapshot()
    await Promise.all([first, second])
    const after = { cursor: history.getState().snapshotCursor, length: history.getState().snapshotLength }
    await history.getState().unDo()
    const undo = slides.getState().title
    await history.getState().unDo()
    const baseline = slides.getState().title
    await Promise.all([history.getState().reDo(), history.getState().reDo()])
    return { after, undo, baseline, redo: slides.getState().title, cursor: history.getState().snapshotCursor }
  })
  assert.deepEqual(result, { after: { cursor: 2, length: 3 }, undo: 'First edit', baseline: 'Initial', redo: 'Second edit', cursor: 2 }, 'Overlapping history operations preserve every edit and their metadata')
  console.log('PASS overlapping snapshots, undo, and redo preserve edit ordering')
  await page.waitForTimeout(500)
  const noOp = await page.evaluate(async () => {
    const history = window.__FIKA_SNAPSHOT__.getState()
    const slides = window.__FIKA_SLIDES__.getState()
    slides.setTitle('Initial')
    await history.initSnapshotDatabase()
    slides.setTitle('First edit')
    await history.addSnapshot()
    slides.setTitle('Second edit')
    await history.addSnapshot()
    await history.unDo()
    await history.addSnapshot()
    await history.reDo()
    return { title: window.__FIKA_SLIDES__.getState().title, length: window.__FIKA_SNAPSHOT__.getState().snapshotLength }
  })
  assert.deepEqual(noOp, { title: 'Second edit', length: 3 }, 'Saving an unchanged document after undo must preserve redo')
  console.log('PASS unchanged history saves preserve the redo branch')
  const branching = await page.evaluate(async () => {
    const slides = window.__FIKA_SLIDES__
    const history = window.__FIKA_SNAPSHOT__.getState()
    await Promise.all([history.unDo(), history.unDo()])
    const baseline = slides.getState().title
    const saves = []
    for (let i = 1; i <= 25; i++) {
      slides.getState().setSlides([{ id: `slide-${i}`, elements: [] }])
      slides.getState().setTitle(`Edit ${i}`)
      saves.push(history.addSnapshot())
    }
    await Promise.all(saves)
    const length = window.__FIKA_SNAPSHOT__.getState().snapshotLength
    await Promise.all(Array.from({ length: 19 }, () => history.unDo()))
    const oldest = { title: slides.getState().title, slide: slides.getState().slides[0].id }
    await Promise.all(Array.from({ length: 19 }, () => history.reDo()))
    const latest = { title: slides.getState().title, slide: slides.getState().slides[0].id }
    // A reset queued behind a save must establish the new document baseline.
    slides.getState().setTitle('Discarded document')
    const pending = history.addSnapshot()
    slides.getState().setTitle('New document')
    const reset = history.initSnapshotDatabase()
    slides.getState().setTitle('New edit')
    await Promise.all([pending, reset, history.addSnapshot()])
    await history.unDo()
    return { baseline, length, oldest, latest, resetTitle: slides.getState().title }
  })
  assert.deepEqual(branching, {
    baseline: 'Initial', length: 20,
    oldest: { title: 'Edit 6', slide: 'slide-6' },
    latest: { title: 'Edit 25', slide: 'slide-25' },
    resetTitle: 'New document',
  }, 'History branching, retention, and document resets preserve slide data and metadata')
  console.log('PASS concurrent undo, history branching, retention, and reset ordering')
} finally {
  await browser.close()
  child?.kill()
}
