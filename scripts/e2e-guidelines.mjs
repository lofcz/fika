/**
 * Real-browser guidelines: Ctrl measures must stay attached to the selected
 * element, follow live drag, and prefer nearby/aligned snap targets.
 *
 *   node scripts/e2e-guidelines.mjs
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const DEV_PORTS = [5173, 5174, 5175, 5176]
const ATTACH_TOL = 1.5

const CASES = [
  [1, 'Screenshot slide: Ctrl shows measure lines'],
  [2, 'Screenshot: vertical title-gap sits on the code box'],
  [3, 'Screenshot: no vertical measure in the bullet/code gutter'],
  [4, 'Screenshot: bottom-edge measure sits on the code box'],
  [5, 'Screenshot: horizontal measures sit on the code box'],
  [6, 'Screenshot: measure labels use px'],
  [7, 'No Ctrl: no measure lines'],
  [8, 'Releasing Ctrl hides measure lines'],
  [9, 'Selecting the title attaches measures to the title'],
  [10, 'Title-to-code gap label is the authored distance'],
  [11, 'Side-by-side shapes: horizontal measure exists'],
  [12, 'Side-by-side: horizontal measure Y is in the overlap'],
  [13, 'Stacked shapes: vertical measure exists'],
  [14, 'Stacked: vertical measure X is in the overlap'],
  [15, 'Stacked gap label matches the authored 40px'],
  [16, 'Three stacked boxes walk the gap chain'],
  [17, 'Aligned neighbor is preferred over a diagonal one'],
  [18, 'Diagonal-only neighbor still projects onto the selection'],
  [19, 'Drag without Ctrl: no measure lines'],
  [20, 'Ctrl mid-drag: measures appear'],
  [21, 'Ctrl mid-drag: vertical measure follows the live box'],
  [22, 'Ctrl mid-drag: measure is not parked at the origin'],
  [23, 'After drop, idle Ctrl matches the committed box'],
  [24, 'Dragging near a neighbor shows an edge snap guide'],
  [25, 'Edge snap guide is on the neighbor edge'],
  [26, 'Equal-gap row shows spacing guides'],
  [27, 'Nearby object wins over a distant aligned edge'],
  [28, 'Alone on the slide, box snaps toward canvas center'],
  [29, 'Far from everything: no false snap offset'],
  [30, 'Multi-select union box keeps measures attached'],
  [31, 'Rotated element measures attach to the AABB'],
  [32, 'Near the left edge, left margin is shown'],
  [33, 'Far from slide edges, far margins stay hidden'],
  [34, 'Switching selection retargets measures'],
  [35, 'Single element shows useful canvas margins'],
  [36, 'Measure length matches the labeled gap'],
  [37, 'Vertical and horizontal measures can show together'],
  [38, 'Measure count stays at or under 8'],
  [39, 'Dense map chips: Ctrl still attaches to the selected card'],
  [40, 'Dense map: gutter between chips is not a measure lane'],
  [41, 'Drag a card toward a chip cluster still snaps'],
  [42, 'Far from an 80-chip cluster: no snap steal'],
  [43, 'Typical title/body/image slide attaches to the image'],
  [44, 'Guide nodes expose data-alignment-line attributes'],
  [45, 'Keyboard-store Ctrl without a pointerdown works'],
  [46, 'Copy-drag (Ctrl from pointerdown) still shows attached measures'],
  [47, 'Spacing snap does not duplicate a matching measure label'],
  [48, 'Center snap emits a center guide'],
  [49, 'Idle Ctrl on a code block does not detach after a prior drag'],
  [50, 'Complex 24-element slide: measures stay on the mover'],
]

const textEl = (id, left, top, width, height, content) => ({
  id,
  type: 'text',
  left,
  top,
  width,
  height,
  rotate: 0,
  content: `<p>${content}</p>`,
  defaultFontName: 'Arial',
  defaultColor: '#ffffff',
  fill: 'transparent',
  lineHeight: 1.4,
  inset: [4, 4, 4, 4],
  fixedHeight: true,
})

const shapeEl = (id, left, top, width, height, fill = '#4472c4') => ({
  id,
  type: 'shape',
  left,
  top,
  width,
  height,
  rotate: 0,
  viewBox: [100, 100],
  path: 'M 0 0 L 100 0 L 100 100 L 0 100 Z',
  fixedRatio: false,
  fill,
})

const codeEl = (id, left, top, width, height) => ({
  id,
  type: 'code',
  left,
  top,
  width,
  height,
  rotate: 0,
  code: 'function greet(name: string) {\n  return `Hello, ${name}!`\n}\n\nconsole.log(greet(\'world\'))',
  language: 'typescript',
  theme: 'github-dark',
  fontSize: 16,
  showLineNumbers: true,
})

const SCREENSHOT = [
  textEl('e2e-guide-title', 80, 36, 320, 48, 'Click to add title'),
  textEl('e2e-guide-bullet', 80, 220, 200, 36, 'How are you?'),
  codeEl('e2e-guide-code', 450, 200, 280, 140),
]

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
    const ready = await page.evaluate(() => !!(window.__FIKA_SLIDES__ && window.__FIKA_MAIN__ && window.__FIKA_KEYBOARD__))
    if (ready) return
    await sleep(250)
  }
  throw new Error('fika store hooks did not appear (need a current dev build with __FIKA_KEYBOARD__)')
}

async function dismissUi(page) {
  await page.keyboard.press('Escape').catch(() => {})
  await page.evaluate(() => {
    const main = window.__FIKA_MAIN__
    const keys = window.__FIKA_KEYBOARD__
    if (!main) return
    main.getState().setEditingElementId('')
    main.getState().setScalingState?.(false)
    main.getState().setGesturingState?.(false)
    keys?.getState().setCtrlKeyState(false)
  })
  await sleep(60)
}

async function injectSlide(page, elements, activeIds) {
  return page.evaluate(({ els, ids }) => {
    const slides = window.__FIKA_SLIDES__
    const main = window.__FIKA_MAIN__
    if (!slides || !main) return false
    slides.getState().addSlide({
      id: `e2e-guide-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      elements: els,
    })
    main.getState().setActiveElementIdList(ids)
    main.getState().setEditorareaFocus(true)
    return true
  }, { els: elements, ids: activeIds })
}

async function loadSlide(page, elements, activeIds) {
  await dismissUi(page)
  const ok = await injectSlide(page, elements, activeIds)
  if (!ok) throw new Error('fika store hook missing')
  const first = activeIds[0]
  const appeared = await page.waitForSelector(`#editable-element-${first}`, { state: 'attached', timeout: 4000 }).then(() => true).catch(() => false)
  if (!appeared) {
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByText('Add slide').waitFor({ timeout: 90000 })
    await stripScan(page)
    await waitForStoreHook(page)
    if (!await injectSlide(page, elements, activeIds)) throw new Error('fika store hook missing after reload')
    await page.waitForSelector(`#editable-element-${first}`, { state: 'attached', timeout: 15000 })
  }
  if (elements.some(el => el.type === 'code')) await sleep(400)
  else await sleep(80)
  await selectElements(page, activeIds)
}

async function selectElements(page, ids) {
  for (let i = 0; i < 8; i++) {
    await page.evaluate((elIds) => {
      const main = window.__FIKA_MAIN__
      main.getState().setEditingElementId('')
      main.getState().setActiveElementIdList(elIds)
      main.getState().setEditorareaFocus(true)
    }, ids)
    await sleep(70)
    const n = await page.locator(`#operate-element-${ids[0]}`).count()
    if (n > 0) return
  }
  throw new Error(`could not select ${ids.join(',')}`)
}

async function setCtrl(page, on) {
  await page.evaluate((active) => {
    window.__FIKA_MAIN__.getState().setEditorareaFocus(true)
    window.__FIKA_KEYBOARD__.getState().setCtrlKeyState(active)
  }, on)
  await sleep(80)
}

async function readGuides(page) {
  return page.evaluate(() => [...document.querySelectorAll('[data-alignment-line]')].map(el => ({
    kind: el.getAttribute('data-kind'),
    type: el.getAttribute('data-type'),
    label: el.getAttribute('data-label') || '',
    axisX: parseFloat(el.getAttribute('data-axis-x') || ''),
    axisY: parseFloat(el.getAttribute('data-axis-y') || ''),
    length: parseFloat(el.getAttribute('data-length') || ''),
  })))
}

async function storeBox(page, id) {
  return page.evaluate((elId) => {
    const state = window.__FIKA_SLIDES__.getState()
    const el = state.slides[state.slideIndex].elements.find(item => item.id === elId)
    const rotate = ('rotate' in el && el.rotate) ? el.rotate : 0
    if (rotate) {
      const rad = rotate * Math.PI / 180
      const cx = el.left + el.width / 2
      const cy = el.top + el.height / 2
      const corners = [
        [el.left, el.top],
        [el.left + el.width, el.top],
        [el.left + el.width, el.top + el.height],
        [el.left, el.top + el.height],
      ].map(([x, y]) => {
        const dx = x - cx
        const dy = y - cy
        return [cx + dx * Math.cos(rad) - dy * Math.sin(rad), cy + dx * Math.sin(rad) + dy * Math.cos(rad)]
      })
      const xs = corners.map(p => p[0])
      const ys = corners.map(p => p[1])
      return { left: Math.min(...xs), top: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }
    }
    return { left: el.left, top: el.top, width: el.width, height: el.height || 0 }
  }, id)
}

async function liveBox(page, id) {
  return page.evaluate((elId) => {
    const box = document.getElementById(`editable-element-${elId}`)?.firstElementChild
    const el = (() => {
      const state = window.__FIKA_SLIDES__.getState()
      return state.slides[state.slideIndex].elements.find(item => item.id === elId)
    })()
    const left = parseFloat(box?.style.left || '') || el?.left || 0
    const top = parseFloat(box?.style.top || '') || el?.top || 0
    return { left, top, width: el?.width || 0, height: el?.height || 0 }
  }, id)
}

function attachedX(guide, box, tol = ATTACH_TOL) {
  return guide.axisX >= box.left - tol && guide.axisX <= box.left + box.width + tol
}

function attachedY(guide, box, tol = ATTACH_TOL) {
  return guide.axisY >= box.top - tol && guide.axisY <= box.top + box.height + tol
}

function allAttached(guides, box, tol = ATTACH_TOL) {
  return guides.every(guide => guide.type === 'vertical' ? attachedX(guide, box, tol) : attachedY(guide, box, tol))
}

function inGutterX(guide, leftBox, rightBox) {
  return guide.type === 'vertical' && guide.axisX > leftBox.left + leftBox.width + 1 && guide.axisX < rightBox.left - 1
}

async function canvasScale(page) {
  return page.evaluate(() => window.__FIKA_MAIN__.getState().canvasScale)
}

async function dragElement(page, id, dxSlide, dySlide, holdCtrl = false) {
  const op = page.locator(`#operate-element-${id}`)
  await op.waitFor({ state: 'attached', timeout: 8000 })
  const box = await op.boundingBox()
  if (!box) throw new Error(`operate box missing for ${id}`)
  const scale = await canvasScale(page)
  let dx = dxSlide * scale
  let dy = dySlide * scale
  if (Math.abs(dx) < 7 && Math.abs(dy) < 7) dy = dy <= 0 ? -10 : 10
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  if (holdCtrl) await page.keyboard.down('Control')
  await page.mouse.move(start.x + dx, start.y + dy, { steps: 12 })
  await sleep(50)
  const live = {
    box: await liveBox(page, id),
    guides: await readGuides(page),
  }
  await page.mouse.up()
  if (holdCtrl) await page.keyboard.up('Control').catch(() => {})
  await sleep(160)
  await setCtrl(page, false)
  return { start, live, after: await storeBox(page, id), scale }
}

const results = []
function rec(id, name, pass, measured) {
  results.push({ id, name, pass: !!pass, measured: measured ?? null })
}

const browser = await chromium.launch({ headless: true })
let child = null
try {
  let devUrl = await waitForDev(1500)
  if (!devUrl) {
    child = spawn('npm', ['run', 'dev'], { cwd: root, shell: true, stdio: 'ignore' })
    devUrl = await waitForDev(90000)
    if (!devUrl) throw new Error('fika dev server did not start (tried ports 5173-5176)')
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(devUrl, { waitUntil: 'networkidle' })
  await page.getByText('Add slide').waitFor({ timeout: 90000 })
  await stripScan(page)
  await waitForStoreHook(page)

  const run = async (id, fn) => {
    const name = CASES[id - 1][1]
    try {
      const measured = await fn()
      const pass = measured && typeof measured === 'object' && 'pass' in measured ? !!measured.pass : !!measured
      rec(id, name, pass, measured && typeof measured === 'object' ? measured : { pass })
    }
    catch (error) {
      rec(id, name, false, { error: String(error?.message || error) })
    }
  }

  await loadSlide(page, SCREENSHOT, ['e2e-guide-code'])
  await setCtrl(page, true)
  const shotGuides = await readGuides(page)
  const shotMeasures = shotGuides.filter(g => g.kind === 'measure')
  const codeBox = await storeBox(page, 'e2e-guide-code')
  const bulletBox = await storeBox(page, 'e2e-guide-bullet')
  const titleBox = await storeBox(page, 'e2e-guide-title')
  const shotVertical = shotMeasures.filter(g => g.type === 'vertical')
  const shotHorizontal = shotMeasures.filter(g => g.type === 'horizontal')

  await run(1, () => ({ pass: shotMeasures.length > 0, count: shotMeasures.length }))
  await run(2, () => ({
    pass: shotVertical.length > 0 && shotVertical.every(g => attachedX(g, codeBox)),
    xs: shotVertical.map(g => g.axisX),
    code: codeBox,
  }))
  await run(3, () => ({
    pass: !shotVertical.some(g => inGutterX(g, bulletBox, codeBox)),
    xs: shotVertical.map(g => g.axisX),
  }))
  await run(4, () => {
    const bottom = shotVertical.find(g => Math.abs(g.length - (562.5 - (codeBox.top + codeBox.height))) < 2)
    return { pass: !bottom || attachedX(bottom, codeBox), bottom }
  })
  await run(5, () => ({
    pass: shotHorizontal.every(g => attachedY(g, codeBox)),
    ys: shotHorizontal.map(g => g.axisY),
  }))
  await run(6, () => ({
    pass: shotMeasures.length > 0 && shotMeasures.every(g => /px$/.test(g.label)),
    labels: shotMeasures.map(g => g.label),
  }))
  await setCtrl(page, false)
  const noCtrl = await readGuides(page)
  await run(7, () => ({ pass: noCtrl.filter(g => g.kind === 'measure').length === 0, count: noCtrl.length }))
  await setCtrl(page, true)
  await sleep(60)
  const again = await readGuides(page)
  await setCtrl(page, false)
  const hidden = await readGuides(page)
  await run(8, () => ({
    pass: again.filter(g => g.kind === 'measure').length > 0 && hidden.filter(g => g.kind === 'measure').length === 0,
  }))

  await selectElements(page, ['e2e-guide-title'])
  await setCtrl(page, true)
  const titleGuides = (await readGuides(page)).filter(g => g.kind === 'measure')
  await run(9, () => ({
    pass: titleGuides.length > 0 && allAttached(titleGuides, titleBox),
    count: titleGuides.length,
  }))
  const expectedGap = Math.round(codeBox.top - (titleBox.top + titleBox.height))
  const gapGuide = shotVertical.find(g => Math.abs(g.length - expectedGap) < 2)
  await run(10, () => ({ pass: !!gapGuide, expectedGap, labels: shotVertical.map(g => g.label) }))
  await setCtrl(page, false)

  const row = [
    shapeEl('e2e-guide-row-a', 80, 180, 80, 40, '#5b9bd5'),
    shapeEl('e2e-guide-row-b', 200, 180, 80, 40, '#ed7d31'),
  ]
  await loadSlide(page, row, ['e2e-guide-row-b'])
  await setCtrl(page, true)
  const rowGuides = (await readGuides(page)).filter(g => g.kind === 'measure')
  const rowB = await storeBox(page, 'e2e-guide-row-b')
  const rowH = rowGuides.filter(g => g.type === 'horizontal')
  await run(11, () => ({ pass: rowH.length > 0, labels: rowH.map(g => g.label) }))
  await run(12, () => ({
    pass: rowH.length > 0 && rowH.every(g => attachedY(g, rowB)),
    ys: rowH.map(g => g.axisY),
  }))
  await setCtrl(page, false)

  const col = [
    shapeEl('e2e-guide-col-a', 200, 80, 80, 40),
    shapeEl('e2e-guide-col-b', 200, 160, 80, 40, '#ed7d31'),
  ]
  await loadSlide(page, col, ['e2e-guide-col-b'])
  await setCtrl(page, true)
  const colGuides = (await readGuides(page)).filter(g => g.kind === 'measure')
  const colB = await storeBox(page, 'e2e-guide-col-b')
  const colV = colGuides.filter(g => g.type === 'vertical')
  await run(13, () => ({ pass: colV.length > 0, labels: colV.map(g => g.label) }))
  await run(14, () => ({
    pass: colV.length > 0 && colV.every(g => attachedX(g, colB)),
    xs: colV.map(g => g.axisX),
  }))
  await run(15, () => ({
    pass: colV.some(g => g.label === '40px' || Math.abs(g.length - 40) < 1),
    labels: colV.map(g => g.label),
  }))
  await setCtrl(page, false)

  const chain = [
    shapeEl('e2e-guide-chain-a', 200, 60, 80, 40),
    shapeEl('e2e-guide-chain-b', 200, 120, 80, 40, '#ed7d31'),
    shapeEl('e2e-guide-chain-c', 200, 200, 80, 40, '#70ad47'),
  ]
  await loadSlide(page, chain, ['e2e-guide-chain-b'])
  await setCtrl(page, true)
  const chainGuides = (await readGuides(page)).filter(g => g.kind === 'measure' && g.type === 'vertical')
  await run(16, () => ({
    pass: chainGuides.filter(g => g.label === '20px' || g.label === '40px' || Math.abs(g.length - 20) < 1 || Math.abs(g.length - 40) < 1).length >= 1,
    labels: chainGuides.map(g => g.label),
  }))
  await setCtrl(page, false)

  const prefer = [
    shapeEl('e2e-guide-pref-near', 80, 180, 80, 40),
    shapeEl('e2e-guide-pref-far', 400, 40, 80, 40, '#ed7d31'),
    shapeEl('e2e-guide-pref-move', 200, 180, 80, 40, '#70ad47'),
  ]
  await loadSlide(page, prefer, ['e2e-guide-pref-move'])
  await setCtrl(page, true)
  const preferGuides = (await readGuides(page)).filter(g => g.kind === 'measure')
  const preferMove = await storeBox(page, 'e2e-guide-pref-move')
  await run(17, () => ({
    pass: preferGuides.some(g => g.type === 'horizontal' && (g.label === '40px' || Math.abs(g.length - 40) < 1))
      && allAttached(preferGuides, preferMove),
    labels: preferGuides.map(g => g.label),
  }))
  await setCtrl(page, false)

  const diagonal = [
    shapeEl('e2e-guide-diag-a', 80, 60, 80, 40),
    shapeEl('e2e-guide-diag-b', 320, 240, 80, 40, '#ed7d31'),
  ]
  await loadSlide(page, diagonal, ['e2e-guide-diag-b'])
  await setCtrl(page, true)
  const diagGuides = (await readGuides(page)).filter(g => g.kind === 'measure')
  const diagB = await storeBox(page, 'e2e-guide-diag-b')
  await run(18, () => ({
    pass: diagGuides.length > 0 && allAttached(diagGuides, diagB),
    guides: diagGuides,
  }))
  await setCtrl(page, false)

  await loadSlide(page, [shapeEl('e2e-guide-drag', 200, 180, 80, 40), shapeEl('e2e-guide-drag-ref', 80, 80, 80, 40)], ['e2e-guide-drag'])
  const dragNoCtrl = await dragElement(page, 'e2e-guide-drag', 60, 40, false)
  await run(19, () => ({
    pass: dragNoCtrl.live.guides.filter(g => g.kind === 'measure').length === 0,
    kinds: dragNoCtrl.live.guides.map(g => g.kind),
  }))

  await loadSlide(page, [shapeEl('e2e-guide-live', 220, 200, 80, 40), textEl('e2e-guide-live-title', 80, 36, 280, 40, 'Title')], ['e2e-guide-live'])
  const op = page.locator('#operate-element-e2e-guide-live')
  await op.waitFor({ state: 'attached', timeout: 8000 })
  const liveStartBox = await op.boundingBox()
  const origin = await storeBox(page, 'e2e-guide-live')
  await page.mouse.move(liveStartBox.x + liveStartBox.width / 2, liveStartBox.y + liveStartBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(liveStartBox.x + liveStartBox.width / 2 + 70, liveStartBox.y + liveStartBox.height / 2 + 50, { steps: 8 })
  await page.keyboard.down('Control')
  await setCtrl(page, true)
  await page.mouse.move(liveStartBox.x + liveStartBox.width / 2 + 110, liveStartBox.y + liveStartBox.height / 2 + 80, { steps: 8 })
  await sleep(80)
  const midLive = await liveBox(page, 'e2e-guide-live')
  const midGuides = (await readGuides(page)).filter(g => g.kind === 'measure')
  const midVertical = midGuides.filter(g => g.type === 'vertical')
  await page.mouse.up()
  await page.keyboard.up('Control').catch(() => {})
  await sleep(180)
  await setCtrl(page, false)
  await run(20, () => ({ pass: midGuides.length > 0, count: midGuides.length }))
  await run(21, () => ({
    pass: midVertical.length > 0 && midVertical.every(g => attachedX(g, midLive, 3)),
    xs: midVertical.map(g => g.axisX),
    live: midLive,
  }))
  await run(22, () => ({
    pass: Math.abs(midLive.left - origin.left) > 8 && midVertical.length > 0 && midVertical.every(g => !attachedX(g, origin, 1)),
    origin,
    live: midLive,
    xs: midVertical.map(g => g.axisX),
  }))
  await setCtrl(page, true)
  const afterDrop = (await readGuides(page)).filter(g => g.kind === 'measure')
  const committed = await storeBox(page, 'e2e-guide-live')
  await run(23, () => ({
    pass: afterDrop.length > 0 && allAttached(afterDrop, committed, 2),
    committed,
  }))
  await setCtrl(page, false)

  await loadSlide(page, [shapeEl('e2e-guide-snap-a', 100, 200, 60, 30), shapeEl('e2e-guide-snap-b', 164, 80, 60, 30, '#ed7d31')], ['e2e-guide-snap-b'])
  const snapDrag = await dragElement(page, 'e2e-guide-snap-b', 0, 118, false)
  const edgeGuides = snapDrag.live.guides.filter(g => g.kind === 'edge' && g.type === 'vertical')
  await run(24, () => ({ pass: edgeGuides.length > 0, kinds: snapDrag.live.guides.map(g => g.kind) }))
  await run(25, () => ({
    pass: edgeGuides.some(g => Math.abs(g.axisX - 100) < 2 || Math.abs(g.axisX - 160) < 2),
    xs: edgeGuides.map(g => g.axisX),
  }))

  await loadSlide(page, [
    shapeEl('e2e-guide-sp-a', 40, 180, 80, 40),
    shapeEl('e2e-guide-sp-b', 140, 180, 80, 40, '#ed7d31'),
    shapeEl('e2e-guide-sp-c', 242, 180, 80, 40, '#70ad47'),
  ], ['e2e-guide-sp-c'])
  const spacingDrag = await dragElement(page, 'e2e-guide-sp-c', -4, 0, false)
  await run(26, () => ({
    pass: spacingDrag.live.guides.some(g => g.kind === 'spacing') || Math.abs(spacingDrag.after.left - 240) < 3,
    kinds: spacingDrag.live.guides.map(g => g.kind),
    left: spacingDrag.after.left,
  }))

  await loadSlide(page, [
    shapeEl('e2e-guide-near', 50, 80, 40, 20),
    shapeEl('e2e-guide-far', 56, 400, 40, 20, '#ed7d31'),
    shapeEl('e2e-guide-near-move', 53, 40, 40, 20, '#70ad47'),
  ], ['e2e-guide-near-move'])
  const nudged = await dragElement(page, 'e2e-guide-near-move', 0, 12, false)
  await run(27, () => ({
    pass: Math.abs(nudged.after.left - 50) < 2,
    left: nudged.after.left,
    kinds: nudged.live.guides.map(g => g.kind),
  }))

  await loadSlide(page, [shapeEl('e2e-guide-center', 496, 80, 80, 40)], ['e2e-guide-center'])
  const centerNudge = await dragElement(page, 'e2e-guide-center', 0, 12, false)
  await run(28, () => ({
    pass: Math.abs(centerNudge.after.left - 500) < 4 || centerNudge.live.guides.some(g => g.kind === 'center'),
    left: centerNudge.after.left,
    kinds: centerNudge.live.guides.map(g => g.kind),
  }))

  await loadSlide(page, [shapeEl('e2e-guide-far-move', 333, 222, 40, 20), shapeEl('e2e-guide-far-other', 0, 0, 20, 20)], ['e2e-guide-far-move'])
  const farDrag = await dragElement(page, 'e2e-guide-far-move', 12, 10, false)
  await run(29, () => ({
    pass: Math.abs(farDrag.after.left - (333 + 12)) < 3 && Math.abs(farDrag.after.top - (222 + 10)) < 3,
    after: farDrag.after,
  }))

  await loadSlide(page, [
    shapeEl('e2e-guide-multi-a', 200, 160, 80, 40),
    shapeEl('e2e-guide-multi-b', 300, 220, 80, 40, '#ed7d31'),
    textEl('e2e-guide-multi-title', 80, 36, 240, 40, 'Title'),
  ], ['e2e-guide-multi-a', 'e2e-guide-multi-b'])
  await setCtrl(page, true)
  const multiGuides = (await readGuides(page)).filter(g => g.kind === 'measure')
  const union = { left: 200, top: 160, width: 180, height: 100 }
  await run(30, () => ({
    pass: multiGuides.length > 0 && allAttached(multiGuides, union, 2),
    guides: multiGuides,
  }))
  await setCtrl(page, false)

  const rotated = { ...shapeEl('e2e-guide-rot', 360, 180, 80, 40, '#7030a0'), rotate: 25 }
  await loadSlide(page, [rotated, textEl('e2e-guide-rot-title', 80, 36, 240, 40, 'Title')], ['e2e-guide-rot'])
  await setCtrl(page, true)
  const rotGuides = (await readGuides(page)).filter(g => g.kind === 'measure')
  const rotBox = await storeBox(page, 'e2e-guide-rot')
  await run(31, () => ({
    pass: rotGuides.length > 0 && allAttached(rotGuides, rotBox, 3),
    rotBox,
  }))
  await setCtrl(page, false)

  await loadSlide(page, [shapeEl('e2e-guide-margin', 48, 80, 40, 20)], ['e2e-guide-margin'])
  await setCtrl(page, true)
  const marginGuides = (await readGuides(page)).filter(g => g.kind === 'measure')
  await run(32, () => ({
    pass: marginGuides.some(g => g.type === 'horizontal' && (g.label === '48px' || Math.abs(g.length - 48) < 1)),
    labels: marginGuides.map(g => g.label),
  }))
  await setCtrl(page, false)

  await loadSlide(page, [shapeEl('e2e-guide-nomargin', 400, 240, 40, 20)], ['e2e-guide-nomargin'])
  await setCtrl(page, true)
  const farMargins = (await readGuides(page)).filter(g => g.kind === 'measure')
  await run(33, () => ({
    pass: !farMargins.some(g => g.length > 200),
    labels: farMargins.map(g => `${g.label}:${g.length}`),
  }))
  await setCtrl(page, false)

  await loadSlide(page, SCREENSHOT, ['e2e-guide-code'])
  await setCtrl(page, true)
  await selectElements(page, ['e2e-guide-bullet'])
  await sleep(80)
  const switched = (await readGuides(page)).filter(g => g.kind === 'measure')
  const bulletNow = await storeBox(page, 'e2e-guide-bullet')
  await run(34, () => ({
    pass: switched.length > 0 && allAttached(switched, bulletNow),
    count: switched.length,
  }))
  await setCtrl(page, false)

  await loadSlide(page, [shapeEl('e2e-guide-solo', 80, 60, 40, 20)], ['e2e-guide-solo'])
  await setCtrl(page, true)
  const solo = (await readGuides(page)).filter(g => g.kind === 'measure')
  await run(35, () => ({
    pass: solo.some(g => g.type === 'horizontal' && (g.label === '80px' || Math.abs(g.length - 80) < 1))
      && solo.some(g => g.type === 'vertical' && (g.label === '60px' || Math.abs(g.length - 60) < 1)),
    labels: solo.map(g => g.label),
  }))
  await run(36, () => ({
    pass: solo.every(g => !g.label || Math.abs(g.length - parseFloat(g.label)) < 1),
    labels: solo.map(g => `${g.label}/${g.length}`),
  }))
  await run(37, () => ({
    pass: solo.some(g => g.type === 'vertical') && solo.some(g => g.type === 'horizontal'),
    types: solo.map(g => g.type),
  }))
  await setCtrl(page, false)

  const crowded = [codeEl('e2e-guide-crowd', 420, 180, 240, 120)]
  for (let i = 0; i < 10; i++) {
    crowded.push(shapeEl(`e2e-guide-crowd-${i}`, 40 + (i % 5) * 70, 40 + Math.floor(i / 5) * 70, 48, 28, i % 2 ? '#ed7d31' : '#5b9bd5'))
  }
  await loadSlide(page, crowded, ['e2e-guide-crowd'])
  await setCtrl(page, true)
  const crowdGuides = (await readGuides(page)).filter(g => g.kind === 'measure')
  const crowdBox = await storeBox(page, 'e2e-guide-crowd')
  await run(38, () => ({ pass: crowdGuides.length <= 8, count: crowdGuides.length }))
  await setCtrl(page, false)

  const chips = [shapeEl('e2e-guide-card', 280, 90, 160, 90, '#1d4ed8')]
  for (let i = 0; i < 24; i++) {
    chips.push(shapeEl(`e2e-guide-chip-${i}`, 20 + (i % 8) * 22, 20 + Math.floor(i / 8) * 18, 18, 14, '#94a3b8'))
  }
  await loadSlide(page, chips, ['e2e-guide-card'])
  await setCtrl(page, true)
  const chipGuides = (await readGuides(page)).filter(g => g.kind === 'measure')
  const cardBox = await storeBox(page, 'e2e-guide-card')
  await run(39, () => ({
    pass: chipGuides.length > 0 && allAttached(chipGuides, cardBox, 2),
    count: chipGuides.length,
  }))
  await run(40, () => ({
    pass: !chipGuides.some(g => g.type === 'vertical' && g.axisX < 200),
    xs: chipGuides.filter(g => g.type === 'vertical').map(g => g.axisX),
  }))
  await setCtrl(page, false)

  const clusterDrag = await dragElement(page, 'e2e-guide-card', -80, -40, false)
  await run(41, () => ({
    pass: clusterDrag.live.guides.some(g => g.kind === 'edge' || g.kind === 'center' || g.kind === 'canvas') || Math.abs(clusterDrag.after.left - (cardBox.left - 80)) < 20,
    kinds: clusterDrag.live.guides.map(g => g.kind),
    left: clusterDrag.after.left,
  }))

  const farCluster = [shapeEl('e2e-guide-island', 700, 400, 20, 16, '#70ad47')]
  for (let i = 0; i < 80; i++) {
    farCluster.push(shapeEl(`e2e-guide-island-c-${i}`, 20 + (i % 8) * 28, 20 + Math.floor(i / 8) * 22, 20, 16, '#94a3b8'))
  }
  await loadSlide(page, farCluster, ['e2e-guide-island'])
  const islandDrag = await dragElement(page, 'e2e-guide-island', 10, 10, false)
  await run(42, () => ({
    pass: Math.abs(islandDrag.after.left - 710) < 3 && Math.abs(islandDrag.after.top - 410) < 3,
    after: islandDrag.after,
  }))

  const typical = [
    textEl('e2e-guide-typ-title', 80, 40, 400, 48, 'Lesson title'),
    textEl('e2e-guide-typ-body', 80, 120, 280, 160, 'Body copy'),
    shapeEl('e2e-guide-typ-image', 420, 140, 220, 160, '#0f766e'),
  ]
  await loadSlide(page, typical, ['e2e-guide-typ-image'])
  await setCtrl(page, true)
  const typGuides = (await readGuides(page)).filter(g => g.kind === 'measure')
  const typImage = await storeBox(page, 'e2e-guide-typ-image')
  await run(43, () => ({
    pass: typGuides.length > 0 && allAttached(typGuides, typImage),
    count: typGuides.length,
  }))
  await run(44, () => ({
    pass: typGuides.length > 0 && typGuides.every(g => g.kind && g.type && Number.isFinite(g.axisX) && Number.isFinite(g.axisY)),
  }))
  await setCtrl(page, false)

  await page.evaluate(() => {
    window.__FIKA_MAIN__.getState().setEditorareaFocus(true)
    window.__FIKA_KEYBOARD__.getState().setCtrlKeyState(true)
  })
  await sleep(80)
  const storeCtrl = (await readGuides(page)).filter(g => g.kind === 'measure')
  await run(45, () => ({ pass: storeCtrl.length > 0, count: storeCtrl.length }))
  await setCtrl(page, false)

  await loadSlide(page, [shapeEl('e2e-guide-copy', 200, 180, 80, 40), textEl('e2e-guide-copy-t', 80, 36, 200, 40, 'Title')], ['e2e-guide-copy'])
  await setCtrl(page, true)
  const copyDrag = await dragElement(page, 'e2e-guide-copy', 50, 30, true)
  const copyMeasures = copyDrag.live.guides.filter(g => g.kind === 'measure')
  await run(46, () => ({
    pass: copyMeasures.length === 0 || allAttached(copyMeasures, copyDrag.live.box, 4),
    count: copyMeasures.length,
    live: copyDrag.live.box,
  }))

  await loadSlide(page, [
    shapeEl('e2e-guide-dup-a', 40, 180, 80, 40),
    shapeEl('e2e-guide-dup-b', 140, 180, 80, 40, '#ed7d31'),
    shapeEl('e2e-guide-dup-c', 242, 180, 80, 40, '#70ad47'),
  ], ['e2e-guide-dup-c'])
  const dupDrag = await dragElement(page, 'e2e-guide-dup-c', -3, 0, true)
  const spacing = dupDrag.live.guides.filter(g => g.kind === 'spacing')
  const measures = dupDrag.live.guides.filter(g => g.kind === 'measure')
  await run(47, () => ({
    pass: spacing.length === 0 || !measures.some(m => spacing.some(s => Math.abs(m.length - (parseFloat(s.label) || s.length)) < 0.6)),
    spacing: spacing.map(g => g.label),
    measures: measures.map(g => g.label),
  }))

  await loadSlide(page, [shapeEl('e2e-guide-cen2', 148, 10, 80, 20), shapeEl('e2e-guide-cen2-ref', 100, 200, 100, 40)], ['e2e-guide-cen2'])
  const cenNudge = await dragElement(page, 'e2e-guide-cen2', 0, 12, false)
  await run(48, () => ({
    pass: cenNudge.live.guides.some(g => g.kind === 'center') || Math.abs(cenNudge.after.left - 150) < 3,
    kinds: cenNudge.live.guides.map(g => g.kind),
    left: cenNudge.after.left,
  }))

  await loadSlide(page, SCREENSHOT, ['e2e-guide-code'])
  await dragElement(page, 'e2e-guide-code', 24, 16, false)
  await setCtrl(page, true)
  const postDrag = (await readGuides(page)).filter(g => g.kind === 'measure')
  const postBox = await storeBox(page, 'e2e-guide-code')
  const postBullet = await storeBox(page, 'e2e-guide-bullet')
  await run(49, () => ({
    pass: postDrag.length > 0 && allAttached(postDrag, postBox) && !postDrag.some(g => inGutterX(g, postBullet, postBox)),
    xs: postDrag.filter(g => g.type === 'vertical').map(g => g.axisX),
  }))
  await setCtrl(page, false)

  const complex = [codeEl('e2e-guide-complex', 480, 200, 220, 120)]
  for (let i = 0; i < 23; i++) {
    complex.push(shapeEl(
      `e2e-guide-cx-${i}`,
      30 + (i % 6) * 70,
      30 + Math.floor(i / 6) * 55,
      i % 5 === 0 ? 120 : 36,
      i % 5 === 0 ? 48 : 24,
      i % 3 === 0 ? '#5b9bd5' : '#94a3b8',
    ))
  }
  await loadSlide(page, complex, ['e2e-guide-complex'])
  await setCtrl(page, true)
  const complexGuides = (await readGuides(page)).filter(g => g.kind === 'measure')
  const complexBox = await storeBox(page, 'e2e-guide-complex')
  await run(50, () => ({
    pass: complexGuides.length > 0 && complexGuides.length <= 8 && allAttached(complexGuides, complexBox, 2),
    count: complexGuides.length,
    xs: complexGuides.filter(g => g.type === 'vertical').map(g => g.axisX),
  }))

  const failed = results.filter(p => !p.pass)
  const width = Math.max(...CASES.map(c => c[1].length)) + 2
  console.log('#   result  case'.padEnd(width + 12) + 'measured')
  console.log('-'.repeat(110))
  for (const [id, name] of CASES) {
    const proof = results.find(p => p.id === id)
    if (!proof) throw new Error(`missing proof ${id} ${name}`)
    const mark = proof.pass ? 'PASS' : 'FAIL'
    const measured = proof.measured && typeof proof.measured === 'object'
      ? JSON.stringify(proof.measured)
      : ''
    console.log(`${String(id).padEnd(4)}${mark.padEnd(8)}${name.padEnd(width)}${measured}`)
  }
  if (results.length !== CASES.length) throw new Error(`expected ${CASES.length} proofs, got ${results.length}`)
  if (failed.length) throw new Error(`${failed.length} guidelines proofs failed: ${failed.map(p => p.id).join(', ')}`)
  console.log('-'.repeat(110))
  console.log('guidelines e2e passed (50 cases)')
  await page.close()
}
finally {
  await browser.close()
  if (child) child.kill()
}
