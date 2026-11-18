import assert from 'node:assert/strict'
import { chromium } from 'playwright'

// Regression: the host bridge jumps the teacher's view to the slide the agent
// just edited (view.goToSlide). When that lands while the teacher is still
// dragging or resizing on another slide, the gesture's mouseup used to commit
// its stale element list onto the NEW current slide, so the whole slide was
// duplicated (same element ids) over the slide the agent edited.

const shape = (id, left, top) => ({ id, type: 'shape', left, top, width: 200, height: 120, rotate: 0, viewBox: [200, 120], path: 'M0 0H200V120H0Z', fill: '#2266aa', fixedRatio: false })
const deck = () => [
  { id: 'agent-slide', elements: [shape('agent-a', 100, 100), shape('agent-b', 500, 300)] },
  { id: 'middle-slide', elements: [shape('middle-a', 100, 100)] },
  { id: 'teacher-slide', elements: [shape('teacher-a', 300, 200), shape('teacher-b', 700, 400)] },
]

const browser = await chromium.launch({ headless: true, ...(process.env.FIKA_CHROMIUM ? { executablePath: process.env.FIKA_CHROMIUM } : {}) })
const failures = []
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__FIKA_AGENTIC__ && window.__FIKA_SNAPSHOT__?.getState().snapshotCursor >= 0)

  const frame = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  let reset = async () => {
    await page.evaluate(slides => {
      const s = window.__FIKA_SLIDES__.getState()
      s.setSlides(slides)
      s.updateSlideIndex(2)
      window.__FIKA_MAIN__.getState().setActiveElementIdList([])
    }, deck())
    await frame()
  }
  // Element wrappers are zero-size anchors; place the pointer from slide geometry.
  const boxOf = id => page.evaluate(id => {
    const vp = [...document.querySelectorAll('.viewport-wrapper')].map(el => el.getBoundingClientRect()).sort((a, b) => b.width - a.width)[0]
    const s = window.__FIKA_MAIN__.getState().canvasScale
    const state = window.__FIKA_SLIDES__.getState()
    const el = state.slides[state.slideIndex].elements.find(e => e.id === id)
    if (el.type === 'line') return { x: vp.x + el.left * s, y: vp.y + el.top * s - 1, w: Math.abs(el.end[0] - el.start[0]) * s, h: 0 }
    return { x: vp.x + el.left * s, y: vp.y + el.top * s, w: el.width * s, h: el.height * s }
  }, id)
  const agentEditsAndHostFocuses = () => page.evaluate(async () => {
    const api = window.__FIKA_AGENTIC__
    const edit = await api.execute({ type: 'elements.update', payload: { slideId: 'agent-slide', elementId: 'agent-a', patch: { left: 140 } } })
    if (!edit.ok) throw new Error(JSON.stringify(edit))
    // usePptxAgentBridge: controller.goToSlide(focus) after every visual mutation.
    const focus = await api.execute({ type: 'view.goToSlide', payload: { slideIdOrIndex: 'agent-slide' }, meta: { source: 'host' } })
    if (!focus.ok) throw new Error(JSON.stringify(focus))
  })
  const ids = () => page.evaluate(() => Object.fromEntries(window.__FIKA_SLIDES__.getState().slides.map(s => [s.id, s.elements.map(e => e.id + '@' + e.left + ',' + e.top + ',' + e.width + 'x' + (e.height ?? JSON.stringify(e.end)) + 'r' + (e.rotate ?? 0))])))

  const check = async (label, gesture) => {
    await reset()
    const before = (await ids())['teacher-slide'][0]
    await gesture()
    await frame()
    const after = await ids()
    console.log(label, JSON.stringify(after))
    try {
      assert.deepEqual(after['agent-slide'].map(s => s.split('@')[0]), ['agent-a', 'agent-b'], label + ': agent slide keeps its own elements')
      assert.ok(after['agent-slide'][0].startsWith('agent-a@140,'), label + ': agent edit survives')
      assert.deepEqual(after['teacher-slide'].map(s => s.split('@')[0]), ['teacher-a', 'teacher-b'], label + ': teacher slide keeps its own elements')
      assert.notEqual(after['teacher-slide'][0], before, label + ': the teacher gesture lands on the slide it started on')
      const all = Object.values(after).flat().map(s => s.split('@')[0])
      assert.equal(new Set(all).size, all.length, label + ': element ids stay unique across slides')
    }
    catch (error) { failures.push(error.message) }
  }

  await check('drag', async () => {
    const b = await boxOf('teacher-a')
    await page.mouse.move(b.x + b.w / 2, b.y + b.h / 2)
    await page.mouse.down()
    await page.mouse.move(b.x + b.w / 2 + 40, b.y + b.h / 2 + 30, { steps: 6 })
    await agentEditsAndHostFocuses()
    await frame()
    await page.mouse.move(b.x + b.w / 2 + 80, b.y + b.h / 2 + 50, { steps: 6 })
    await page.mouse.up()
  })

  await check('resize', async () => {
    const b = await boxOf('teacher-a')
    await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2)
    await frame()
    const handle = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('[data-resize-handle]')].map(el => el.getBoundingClientRect()).filter(r => r.width > 0)
      nodes.sort((a, b) => (b.x + b.y) - (a.x + a.y))
      const r = nodes[0]
      return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null
    })
    if (!handle) throw new Error('no resize handle found')
    await page.mouse.move(handle.x, handle.y)
    await page.mouse.down()
    await page.mouse.move(handle.x + 30, handle.y + 20, { steps: 6 })
    await agentEditsAndHostFocuses()
    await frame()
    await page.mouse.move(handle.x + 60, handle.y + 40, { steps: 6 })
    await page.mouse.up()
  })


  const handleDrag = async (elementId, selector, pick) => {
    const b = await boxOf(elementId)
    await page.mouse.click(b.x + b.w / 2, b.y + Math.max(b.h, 2) / 2)
    await frame()
    const handle = await page.evaluate(([selector, pick]) => {
      const rects = [...document.querySelectorAll(selector)].map(el => el.getBoundingClientRect()).filter(r => r.width > 0)
      rects.sort((a, b) => pick === 'max' ? (b.x + b.y) - (a.x + a.y) : (a.y - b.y))
      const r = rects[0]
      return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null
    }, [selector, pick])
    if (!handle) throw new Error('no handle ' + selector)
    await page.mouse.move(handle.x, handle.y)
    await page.mouse.down()
    await page.mouse.move(handle.x + 30, handle.y + 25, { steps: 6 })
    await agentEditsAndHostFocuses()
    await frame()
    await page.mouse.move(handle.x + 60, handle.y + 50, { steps: 6 })
    await page.mouse.up()
  }

  await check('rotate', () => handleDrag('teacher-a', '[data-rotate-handle]', 'top'))

  {
    const linePoints = async () => {
      await page.evaluate(slides => { const s = window.__FIKA_SLIDES__.getState(); s.setSlides(slides); s.updateSlideIndex(2); window.__FIKA_MAIN__.getState().setActiveElementIdList([]) }, lineDeck())
      await frame()
    }

  // Line endpoints: the line hook re-reads the canvas list at mouseup, which by
  // then already holds the slide the host switched to.
  const lineDeck = () => [
    { id: 'agent-slide', elements: [shape('agent-a', 100, 100), shape('agent-b', 500, 300)] },
    { id: 'middle-slide', elements: [shape('middle-a', 100, 100)] },
    { id: 'teacher-slide', elements: [{ id: 'teacher-a', type: 'line', left: 300, top: 200, width: 4, start: [0, 0], end: [300, 0], style: 'solid', color: '#222222', points: ['', ''] }, shape('teacher-b', 700, 400)] },
  ]
    const realReset = reset
    reset = linePoints
    await check('line endpoint', () => handleDrag('teacher-a', '[data-line-handle]', 'max'))
    reset = realReset
  }

  {
    // Agent edits the teacher's own slide mid-drag: both edits must survive.
    await reset()
    const b = await boxOf('teacher-a')
    await page.mouse.move(b.x + b.w / 2, b.y + b.h / 2)
    await page.mouse.down()
    await page.mouse.move(b.x + b.w / 2 + 40, b.y + b.h / 2 + 30, { steps: 6 })
    await page.evaluate(async () => {
      const r = await window.__FIKA_AGENTIC__.execute({ type: 'elements.update', payload: { slideId: 'teacher-slide', elementId: 'teacher-b', patch: { left: 750 } } })
      if (!r.ok) throw new Error(JSON.stringify(r))
    })
    await frame()
    await page.mouse.move(b.x + b.w / 2 + 80, b.y + b.h / 2 + 50, { steps: 6 })
    await page.mouse.up()
    await frame()
    const after = (await ids())['teacher-slide']
    console.log('same slide', JSON.stringify(after))
    try {
      assert.ok(!after[0].startsWith('teacher-a@300,200,'), 'same slide: teacher drag lands')
      assert.ok(after[1].startsWith('teacher-b@750,'), 'same slide: concurrent agent edit survives the drag commit')
    }
    catch (error) { failures.push(error.message) }
  }

  assert.deepEqual(errors, [])
  assert.deepEqual(failures, [])
  console.log('PASS a host focus jump mid-gesture never copies the teacher slide over the agent slide')
} finally { await browser.close() }
