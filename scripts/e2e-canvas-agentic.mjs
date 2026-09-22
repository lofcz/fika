import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173'}/?mode=myna&locale=en`)
  await page.waitForFunction(() => window.__FIKA_AGENTIC__ && window.__FIKA_SNAPSHOT__?.getState().snapshotLength > 0)
  const results = await page.evaluate(async () => {
    const api = window.__FIKA_AGENTIC__
    const run = (type, payload) => api.execute({ type, payload })
    await run('deck.set', { title: 'Blank', slides: [{ id: 'starter', elements: [] }] })
    const created = await run('canvas.apply', { operations: [
      { op: 'title', title: 'School concert' },
      { op: 'viewport', width: 1000, height: 1400 },
      { op: 'page', id: 'invitation', name: 'Concert invitation', x: -200, y: 100, background: '#f5f0e6' },
      { op: 'shape', pageId: 'invitation', id: 'circle', shape: 'ellipse', x: 500, y: 200, width: 300, height: 300, fill: '#cc4422' },
      { op: 'text', pageId: 'invitation', id: 'heading', x: 80, y: 80, width: 800, height: 150, text: 'School concert', fontSize: 72, color: '#202024', bold: true },
    ] })
    const summary = await run('canvas.get', { limit: 2 })
    const edited = await run('canvas.apply', { operations: [{ op: 'textUpdate', id: 'heading', text: 'Summer concert' }] })
    const text = window.__FIKA_SLIDES__.getState().slides[0].elements.find(el => el.id === 'heading')
    const beforeFailure = JSON.stringify(window.__FIKA_SLIDES__.getState().slides)
    const failed = await run('canvas.apply', { operations: [{ op: 'update', id: 'heading', patch: { left: 999 } }, { op: 'remove', id: 'missing' }] })
    return { created, summary, edited, text, failed, rolledBack: beforeFailure === JSON.stringify(window.__FIKA_SLIDES__.getState().slides) }
  })
  assert.equal(results.created.ok, true, JSON.stringify(results.created.errors))
  assert.equal(results.summary.data.pageCount, 1, 'reuses untouched starter')
  assert.equal(results.summary.data.pages[0].id, 'invitation')
  assert.equal(results.summary.data.viewport.height, 1400)
  assert.equal(results.summary.data.elements.length, 2)
  assert.equal(results.text.fixedHeight, true)
  assert.match(results.text.content, /Summer concert/)
  assert.match(results.text.content, /72px/)
  assert.equal(results.failed.ok, false)
  assert.equal(results.rolledBack, true, 'failed compact batch rolls back every operation')
  assert.ok(JSON.stringify(results.created.data).length < 600, 'mutation acknowledgements stay compact')
  console.log('PASS canvas AI bridge: initial design, bounded context, style-preserving iteration, fixed-size text, rollback, compact responses')
} finally { await browser.close() }
