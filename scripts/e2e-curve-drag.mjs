/**
 * Real-browser: dragging a bent curve/polyline must move the line, not start
 * a marquee, and dragging an endpoint must keep the authored curvature.
 *
 *   node scripts/e2e-curve-drag.mjs
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const DEV_PORTS = [5173, 5174, 5175, 5176, 5188]
const DRAG = { x: 72, y: 48 }

const CASES = [
  [1, 'Unselected quadratic: drag on the arch does not show a marquee'],
  [2, 'Unselected quadratic: the line moves with the pointer'],
  [3, 'Unselected quadratic: relative curve geometry is unchanged'],
  [4, 'Selected quadratic: drag on the arch does not show a marquee'],
  [5, 'Selected quadratic: the line moves instead of reshaping'],
  [6, 'Cubic: drag on the painted midpoint does not show a marquee'],
  [7, 'Cubic: the line moves with the pointer'],
  [8, 'Broken polyline: drag on the elbow stroke does not show a marquee'],
  [9, 'Broken polyline: the line moves with the pointer'],
  [10, 'Empty canvas drag still opens a selection rectangle'],
  [11, 'Clicking the quadratic arch selects the line'],
  [12, 'Hit rect covers the painted quadratic midpoint'],
  [13, 'Quadratic: dragging the end handle does not flatten the curve'],
  [14, 'Quadratic: dragging the start handle does not flatten the curve'],
  [15, 'Quadratic: end-handle drag still paints a Q command'],
  [16, 'Cubic: dragging the end handle keeps both controls off the chord'],
  [17, 'Broken: dragging the end handle keeps the elbow off the chord'],
  [18, 'Broken2: dragging the end handle keeps the elbow'],
  [19, 'Round-rect keypoint survives a corner resize'],
  [20, 'Triangle keypoint survives a corner resize'],
]

const LINES = {
  quadratic: {
    id: 'e2e-curve-quadratic',
    type: 'line',
    left: 220,
    top: 280,
    start: [0, 0],
    end: [320, 0],
    curve: [160, -150],
    width: 4,
    style: 'solid',
    color: '#2563eb',
    points: ['', 'arrow'],
  },
  cubic: {
    id: 'e2e-curve-cubic',
    type: 'line',
    left: 200,
    top: 300,
    start: [0, 0],
    end: [300, 20],
    cubic: [[80, -140], [220, -130]],
    width: 4,
    style: 'solid',
    color: '#18181b',
    points: ['', ''],
  },
  broken: {
    id: 'e2e-curve-broken',
    type: 'line',
    left: 180,
    top: 260,
    start: [0, 0],
    end: [280, 10],
    broken: [140, -130],
    width: 4,
    style: 'solid',
    color: '#b45309',
    points: ['', 'arrow'],
  },
  broken2: {
    id: 'e2e-curve-broken2',
    type: 'line',
    left: 160,
    top: 240,
    start: [0, 0],
    end: [260, 120],
    broken2: [80, -90],
    broken2Direction: 'horizontal',
    width: 4,
    style: 'solid',
    color: '#0f766e',
    points: ['', ''],
  },
}

const SHAPES = {
  roundRect: {
    id: 'e2e-shape-roundrect-keypoint',
    type: 'shape',
    left: 80,
    top: 80,
    width: 200,
    height: 160,
    rotate: 0,
    viewBox: [200, 160],
    pathFormula: 'roundRect',
    keypoints: [0.28],
    path: 'M 44.8 0 L 155.2 0 Q 200 0 200 44.8 L 200 115.2 Q 200 160 155.2 160 L 44.8 160 Q 0 160 0 115.2 L 0 44.8 Q 0 0 44.8 0 Z',
    fixedRatio: false,
    fill: '#4472c4',
  },
  triangle: {
    id: 'e2e-shape-triangle-keypoint',
    type: 'shape',
    left: 80,
    top: 80,
    width: 200,
    height: 180,
    rotate: 0,
    viewBox: [200, 180],
    pathFormula: 'triangle',
    keypoints: [0.22],
    path: 'M 44 0 L 0 180 L 200 180 Z',
    fixedRatio: false,
    fill: '#4472c4',
  },
}

async function isFikaDev(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) return false
    const html = await res.text()
    return html.includes('fika-shell') || html.includes('>fika<')
  }
  catch {
    return false
  }
}

async function findFikaDev() {
  for (const port of DEV_PORTS) {
    const url = `http://127.0.0.1:${port}/`
    if (await isFikaDev(url)) return url
  }
  return null
}

async function waitForDev(timeoutMs = 60000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const url = await findFikaDev()
    if (url) return url
    await sleep(400)
  }
  return null
}

async function stripScan(page) {
  await page.evaluate(() => {
    document.querySelectorAll('[data-react-scan], #react-scan-root').forEach(el => el.remove())
  })
}

async function waitForStoreHook(page) {
  const start = Date.now()
  while (Date.now() - start < 20000) {
    if (await page.evaluate(() => !!(window.__FIKA_SLIDES__ && window.__FIKA_MAIN__))) return
    await sleep(250)
  }
  throw new Error('window.__FIKA_SLIDES__ hook did not appear')
}

async function injectLine(page, element, active) {
  return page.evaluate(({ el, select }) => {
    const slides = window.__FIKA_SLIDES__
    const main = window.__FIKA_MAIN__
    if (!slides || !main) return false
    slides.getState().addSlide({
      id: `e2e-curve-slide-${el.id}-${Date.now()}`,
      elements: [el],
    })
    main.getState().setEditingElementId('')
    main.getState().setActiveElementIdList(select ? [el.id] : [])
    main.getState().setEditorareaFocus(true)
    return true
  }, { el: element, select: active })
}

async function loadLine(page, element, active) {
  await page.keyboard.press('Escape').catch(() => {})
  const ok = await injectLine(page, element, active)
  if (!ok) throw new Error('fika store hook missing')
  const appeared = await page.waitForSelector(`#editable-element-${element.id}`, { state: 'attached', timeout: 4000 }).then(() => true).catch(() => false)
  if (!appeared) {
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByText('Add slide').waitFor({ timeout: 90000 })
    await stripScan(page)
    await waitForStoreHook(page)
    if (!await injectLine(page, element, active)) throw new Error('fika store hook missing after reload')
    await page.waitForSelector(`#editable-element-${element.id}`, { state: 'attached', timeout: 15000 })
  }
  await sleep(120)
}

async function paintedMidpoint(page, id) {
  return page.evaluate((elId) => {
    const st = window.__FIKA_SLIDES__.getState()
    const el = st.slides[st.slideIndex]?.elements.find(item => item.id === elId)
    if (!el || el.type !== 'line') return null
    const wrap = document.querySelector('.viewport-wrapper')
    if (!(wrap instanceof HTMLElement)) return null
    const scale = window.__FIKA_MAIN__.getState().canvasScale
    const box = wrap.getBoundingClientRect()
    const lerp = (a, b, t) => a + (b - a) * t
    let localX
    let localY
    if (el.curve) {
      localX = 0.25 * el.start[0] + 0.5 * el.curve[0] + 0.25 * el.end[0]
      localY = 0.25 * el.start[1] + 0.5 * el.curve[1] + 0.25 * el.end[1]
    }
    else if (el.cubic) {
      const t = 0.5
      const mt = 1 - t
      const [c1, c2] = el.cubic
      localX = mt * mt * mt * el.start[0] + 3 * mt * mt * t * c1[0] + 3 * mt * t * t * c2[0] + t * t * t * el.end[0]
      localY = mt * mt * mt * el.start[1] + 3 * mt * mt * t * c1[1] + 3 * mt * t * t * c2[1] + t * t * t * el.end[1]
    }
    else if (el.broken) {
      localX = lerp(el.start[0], el.broken[0], 0.55)
      localY = lerp(el.start[1], el.broken[1], 0.55)
    }
    else {
      localX = (el.start[0] + el.end[0]) / 2
      localY = (el.start[1] + el.end[1]) / 2
    }
    const canvasX = el.left + localX
    const canvasY = el.top + localY
    const root = document.getElementById(`editable-element-${elId}`)
    const path = [...(root?.querySelectorAll('path') || [])].find((node) => {
      const stroke = node.getAttribute('stroke')
      return !!stroke && stroke !== 'transparent' && (node.getAttribute('d') || '').length > 8
    })
    let pathPt = null
    if (path instanceof SVGPathElement) {
      const len = path.getTotalLength()
      const mid = path.getPointAtLength(len * 0.5)
      const ctm = path.getScreenCTM()
      if (ctm) {
        const pt = new DOMPoint(mid.x, mid.y).matrixTransform(ctm)
        pathPt = { x: pt.x, y: pt.y }
      }
    }
    return {
      x: box.left + canvasX * scale,
      y: box.top + canvasY * scale,
      localX,
      localY,
      canvasX,
      canvasY,
      scale,
      pathPt,
    }
  }, id)
}

async function storeLine(page, id) {
  return page.evaluate((elId) => {
    const st = window.__FIKA_SLIDES__.getState()
    const el = st.slides[st.slideIndex]?.elements.find(item => item.id === elId)
    if (!el || el.type !== 'line') return null
    return {
      left: el.left,
      top: el.top,
      start: el.start,
      end: el.end,
      curve: el.curve || null,
      cubic: el.cubic || null,
      broken: el.broken || null,
      broken2: el.broken2 || null,
      selected: window.__FIKA_MAIN__.getState().activeElementIdList.includes(elId),
    }
  }, id)
}

async function hitRectCovers(page, id, point) {
  return page.evaluate(({ elId, x, y }) => {
    const rects = [...document.querySelectorAll('[class*="hit-rect"]')].filter(node => (
      node instanceof HTMLElement && !node.className.includes('hit-rect-wrap')
    ))
    return rects.some((node) => {
      const box = node.getBoundingClientRect()
      return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom
    }) || (() => {
      const root = document.getElementById(`editable-element-${elId}`)
      const path = root?.querySelector('path')
      return path instanceof SVGPathElement && path.isPointInStroke?.(new DOMPoint(x, y))
    })()
  }, { elId: id, x: point.x, y: point.y })
}

async function marqueeVisible(page) {
  return page.locator('[data-mouse-selection]').count().then(n => n > 0)
}

async function dragFrom(page, point, dx, dy) {
  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  await page.mouse.move(point.x + dx, point.y + dy, { steps: 14 })
  await sleep(40)
  const marquee = await marqueeVisible(page)
  await page.mouse.up()
  await sleep(200)
  return { marquee }
}

function distToChord(start, end, point) {
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const len2 = dx * dx + dy * dy
  if (!len2) return Math.hypot(point[0] - start[0], point[1] - start[1])
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / len2))
  return Math.hypot(point[0] - (start[0] + t * dx), point[1] - (start[1] + t * dy))
}

function controlOffChord(line, min = 40) {
  if (!line) return false
  if (line.curve) return distToChord(line.start, line.end, line.curve) > min
  if (line.broken) return distToChord(line.start, line.end, line.broken) > min
  if (line.broken2) return distToChord(line.start, line.end, line.broken2) > min
  if (line.cubic) {
    return distToChord(line.start, line.end, line.cubic[0]) > min && distToChord(line.start, line.end, line.cubic[1]) > min
  }
  return false
}

async function paintedPath(page, id) {
  return page.evaluate((elId) => {
    const root = document.getElementById(`editable-element-${elId}`)
    const path = [...(root?.querySelectorAll('path') || [])].find((node) => {
      const stroke = node.getAttribute('stroke')
      return !!stroke && stroke !== 'transparent' && (node.getAttribute('d') || '').length > 8
    })
    return path?.getAttribute('d') || ''
  }, id)
}

async function selectLine(page, id) {
  for (let i = 0; i < 8; i++) {
    await page.evaluate((elId) => {
      const main = window.__FIKA_MAIN__
      main.getState().setEditingElementId('')
      main.getState().setActiveElementIdList([elId])
      main.getState().setEditorareaFocus(true)
    }, id)
    await sleep(70)
    if (await page.locator(`[data-line-handle="end"]`).count()) return
  }
  throw new Error(`could not select line ${id}`)
}

async function dragLineHandle(page, id, handle, dx, dy) {
  await selectLine(page, id)
  const box = await page.locator(`[data-line-handle="${handle}"]`).first().boundingBox()
  if (!box) throw new Error(`no ${handle} handle on ${id}`)
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 14 })
  await sleep(40)
  await page.mouse.up()
  await sleep(220)
}

async function injectShape(page, element) {
  return page.evaluate((el) => {
    const slides = window.__FIKA_SLIDES__
    const main = window.__FIKA_MAIN__
    if (!slides || !main) return false
    slides.getState().addSlide({
      id: `e2e-shape-slide-${el.id}-${Date.now()}`,
      elements: [el],
    })
    main.getState().setEditingElementId('')
    main.getState().setActiveElementIdList([el.id])
    main.getState().setEditorareaFocus(true)
    return true
  }, element)
}

async function loadShape(page, element) {
  await page.keyboard.press('Escape').catch(() => {})
  const ok = await injectShape(page, element)
  if (!ok) throw new Error('fika store hook missing')
  await page.waitForSelector(`#editable-element-${element.id}`, { state: 'attached', timeout: 8000 })
  await sleep(100)
  for (let i = 0; i < 8; i++) {
    await page.evaluate((elId) => {
      const main = window.__FIKA_MAIN__
      main.getState().setEditingElementId('')
      main.getState().setActiveElementIdList([elId])
      main.getState().setEditorareaFocus(true)
    }, element.id)
    await sleep(70)
    if (await page.locator(`#operate-element-${element.id} [data-resize-handle="right-bottom"]`).count()) return
  }
  throw new Error(`could not select shape ${element.id}`)
}

async function storeShape(page, id) {
  return page.evaluate((elId) => {
    const st = window.__FIKA_SLIDES__.getState()
    const el = st.slides[st.slideIndex]?.elements.find(item => item.id === elId)
    if (!el || el.type !== 'shape') return null
    return {
      width: el.width,
      height: el.height,
      keypoints: el.keypoints || null,
      path: el.path || '',
    }
  }, id)
}

async function resizeShapeCorner(page, id, dx, dy) {
  const handle = page.locator(`#operate-element-${id} [data-resize-handle="right-bottom"]`).first()
  const box = await handle.boundingBox()
  if (!box) throw new Error(`no corner handle on ${id}`)
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 12 })
  await sleep(40)
  await page.mouse.up()
  await sleep(220)
}

async function emptyCanvasPoint(page) {
  return page.evaluate(() => {
    const wrap = document.querySelector('.viewport-wrapper')
    if (!(wrap instanceof HTMLElement)) return null
    const box = wrap.getBoundingClientRect()
    return { x: box.left + 36, y: box.top + 36 }
  })
}

const results = []
function rec(id, pass, measured) {
  results.push({ id, name: CASES[id - 1][1], pass: !!pass, measured: measured ?? null })
}

const browser = await chromium.launch({ headless: true })
let child = null
try {
  let devUrl = await waitForDev(1500)
  if (!devUrl) {
    child = spawn('npm', ['run', 'dev'], { cwd: root, shell: true, stdio: 'ignore' })
    devUrl = await waitForDev(90000)
    if (!devUrl) throw new Error('fika dev server did not start')
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(devUrl, { waitUntil: 'networkidle' })
  await page.getByText('Add slide').waitFor({ timeout: 90000 })
  await stripScan(page)
  await waitForStoreHook(page)

  await loadLine(page, LINES.quadratic, false)
  const quadMid = await paintedMidpoint(page, LINES.quadratic.id)
  if (!quadMid) throw new Error('quadratic path midpoint missing')
  const quadBefore = await storeLine(page, LINES.quadratic.id)
  const quadHit = await hitRectCovers(page, LINES.quadratic.id, quadMid)
  const quadDrag = await dragFrom(page, quadMid, DRAG.x, DRAG.y)
  const quadAfter = await storeLine(page, LINES.quadratic.id)
  rec(1, !quadDrag.marquee, { marquee: quadDrag.marquee, mid: quadMid })
  rec(2, Math.abs((quadAfter?.left ?? 0) - (quadBefore?.left ?? 0)) > 20 && Math.abs((quadAfter?.top ?? 0) - (quadBefore?.top ?? 0)) > 12, {
    before: quadBefore,
    after: quadAfter,
  })
  rec(3, JSON.stringify(quadBefore?.curve) === JSON.stringify(quadAfter?.curve) && JSON.stringify(quadBefore?.start) === JSON.stringify(quadAfter?.start), {
    before: quadBefore,
    after: quadAfter,
  })

  await loadLine(page, { ...LINES.quadratic, id: 'e2e-curve-quadratic-selected' }, true)
  const selMid = await paintedMidpoint(page, 'e2e-curve-quadratic-selected')
  if (!selMid) throw new Error('selected quadratic path midpoint missing')
  const selBefore = await storeLine(page, 'e2e-curve-quadratic-selected')
  const selDrag = await dragFrom(page, selMid, DRAG.x, DRAG.y)
  const selAfter = await storeLine(page, 'e2e-curve-quadratic-selected')
  rec(4, !selDrag.marquee, { marquee: selDrag.marquee, mid: selMid })
  rec(5, Math.abs((selAfter?.left ?? 0) - (selBefore?.left ?? 0)) > 20 && JSON.stringify(selBefore?.curve) === JSON.stringify(selAfter?.curve), {
    before: selBefore,
    after: selAfter,
  })

  await loadLine(page, LINES.cubic, false)
  const cubicMid = await paintedMidpoint(page, LINES.cubic.id)
  if (!cubicMid) throw new Error('cubic path midpoint missing')
  const cubicBefore = await storeLine(page, LINES.cubic.id)
  const cubicDrag = await dragFrom(page, cubicMid, DRAG.x, DRAG.y)
  const cubicAfter = await storeLine(page, LINES.cubic.id)
  rec(6, !cubicDrag.marquee, { marquee: cubicDrag.marquee, mid: cubicMid })
  rec(7, Math.abs((cubicAfter?.left ?? 0) - (cubicBefore?.left ?? 0)) > 20, {
    before: cubicBefore,
    after: cubicAfter,
  })

  await loadLine(page, LINES.broken, false)
  const brokenMid = await paintedMidpoint(page, LINES.broken.id)
  if (!brokenMid) throw new Error('broken path midpoint missing')
  const brokenBefore = await storeLine(page, LINES.broken.id)
  const brokenDrag = await dragFrom(page, brokenMid, DRAG.x, DRAG.y)
  const brokenAfter = await storeLine(page, LINES.broken.id)
  rec(8, !brokenDrag.marquee, { marquee: brokenDrag.marquee, mid: brokenMid })
  rec(9, Math.abs((brokenAfter?.left ?? 0) - (brokenBefore?.left ?? 0)) > 20, {
    before: brokenBefore,
    after: brokenAfter,
  })

  const blank = await emptyCanvasPoint(page)
  if (!blank) throw new Error('viewport wrapper missing')
  await page.mouse.move(blank.x, blank.y)
  await page.mouse.down()
  await page.mouse.move(blank.x + 90, blank.y + 70, { steps: 10 })
  await sleep(40)
  const blankMarquee = await marqueeVisible(page)
  await page.mouse.up()
  rec(10, blankMarquee, { marquee: blankMarquee, blank })

  await loadLine(page, { ...LINES.quadratic, id: 'e2e-curve-quadratic-select' }, false)
  const pickMid = await paintedMidpoint(page, 'e2e-curve-quadratic-select')
  if (!pickMid) throw new Error('select-click path midpoint missing')
  await page.mouse.click(pickMid.x, pickMid.y)
  await sleep(120)
  const picked = await storeLine(page, 'e2e-curve-quadratic-select')
  rec(11, !!picked?.selected, picked)

  rec(12, quadHit, { hit: quadHit, mid: quadMid })

  await loadLine(page, { ...LINES.quadratic, id: 'e2e-curve-quadratic-end' }, true)
  await dragLineHandle(page, 'e2e-curve-quadratic-end', 'end', 80, 56)
  const quadEnd = await storeLine(page, 'e2e-curve-quadratic-end')
  const quadEndPath = await paintedPath(page, 'e2e-curve-quadratic-end')
  rec(13, controlOffChord(quadEnd), { after: quadEnd, off: quadEnd ? distToChord(quadEnd.start, quadEnd.end, quadEnd.curve) : null })

  await loadLine(page, { ...LINES.quadratic, id: 'e2e-curve-quadratic-start' }, true)
  await dragLineHandle(page, 'e2e-curve-quadratic-start', 'start', -70, 50)
  const quadStart = await storeLine(page, 'e2e-curve-quadratic-start')
  rec(14, controlOffChord(quadStart), { after: quadStart, off: quadStart ? distToChord(quadStart.start, quadStart.end, quadStart.curve) : null })
  rec(15, /Q/.test(quadEndPath), { path: quadEndPath })

  await loadLine(page, { ...LINES.cubic, id: 'e2e-curve-cubic-end' }, true)
  await dragLineHandle(page, 'e2e-curve-cubic-end', 'end', 80, 50)
  const cubicEnd = await storeLine(page, 'e2e-curve-cubic-end')
  rec(16, controlOffChord(cubicEnd), { after: cubicEnd })

  await loadLine(page, { ...LINES.broken, id: 'e2e-curve-broken-end' }, true)
  await dragLineHandle(page, 'e2e-curve-broken-end', 'end', 80, 50)
  const brokenEnd = await storeLine(page, 'e2e-curve-broken-end')
  rec(17, controlOffChord(brokenEnd), { after: brokenEnd })

  await loadLine(page, LINES.broken2, true)
  await dragLineHandle(page, LINES.broken2.id, 'end', 70, 40)
  const broken2End = await storeLine(page, LINES.broken2.id)
  rec(18, controlOffChord(broken2End, 20), { after: broken2End })

  await loadShape(page, SHAPES.roundRect)
  const roundBefore = await storeShape(page, SHAPES.roundRect.id)
  await resizeShapeCorner(page, SHAPES.roundRect.id, 90, 40)
  const roundAfter = await storeShape(page, SHAPES.roundRect.id)
  rec(19, JSON.stringify(roundBefore?.keypoints) === JSON.stringify(roundAfter?.keypoints) && (roundAfter?.width ?? 0) > (roundBefore?.width ?? 0), {
    before: roundBefore,
    after: roundAfter,
  })

  await loadShape(page, SHAPES.triangle)
  const triBefore = await storeShape(page, SHAPES.triangle.id)
  await resizeShapeCorner(page, SHAPES.triangle.id, 80, 36)
  const triAfter = await storeShape(page, SHAPES.triangle.id)
  rec(20, JSON.stringify(triBefore?.keypoints) === JSON.stringify(triAfter?.keypoints) && (triAfter?.width ?? 0) > (triBefore?.width ?? 0), {
    before: triBefore,
    after: triAfter,
  })

  const failed = results.filter(p => !p.pass)
  const width = 68
  console.log('#   result  case'.padEnd(width + 12) + 'measured')
  console.log('-'.repeat(120))
  for (const [id, name] of CASES) {
    const proof = results.find(p => p.id === id)
    if (!proof) throw new Error(`missing proof ${id} ${name}`)
    const mark = proof.pass ? 'PASS' : 'FAIL'
    const m = proof.measured || {}
    console.log(`${String(id).padEnd(4)}${mark.padEnd(8)}${name.padEnd(width)}${JSON.stringify({
      marquee: m.marquee,
      left: m.after?.left ?? m.before?.left,
      top: m.after?.top ?? m.before?.top,
      selected: m.selected,
      hit: m.hit,
      off: m.off,
      keypoints: m.after?.keypoints,
      path: m.path ? String(m.path).slice(0, 48) : undefined,
    })}`)
  }
  if (results.length !== CASES.length) throw new Error(`expected ${CASES.length} proofs, got ${results.length}`)
  if (failed.length) throw new Error(`${failed.length} curve-drag proofs failed: ${failed.map(p => p.id).join(', ')}`)
  console.log('-'.repeat(120))
  console.log(`curve-drag e2e passed (${CASES.length} cases)`)
  await page.close()
}
finally {
  await browser.close()
  if (child) child.kill()
}
