/**
 * Real-browser resize: every box element must live-preview width AND height
 * while the pointer is down, then persist both axes on mouseup.
 *
 *   node scripts/e2e-resize-elements.mjs
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const DEV_PORTS = [5173, 5174, 5175, 5176]
const LIVE_PX = 28
const PNG_1X1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const CASES = [
  [1, 'Text exposes a bottom resize handle'],
  [2, 'Text live-previews width while dragging right'],
  [3, 'Text width persists after mouseup'],
  [4, 'Text live-previews height while dragging bottom'],
  [5, 'Text height persists after mouseup'],
  [6, 'Shape exposes a bottom resize handle'],
  [7, 'Shape live-previews width while dragging right'],
  [8, 'Shape width persists after mouseup'],
  [9, 'Shape live-previews height while dragging bottom'],
  [10, 'Shape height persists after mouseup'],
  [11, 'Table exposes a bottom resize handle'],
  [12, 'Table cells live-shrink with the bounding box'],
  [13, 'Table shrink width persists after mouseup'],
  [14, 'Table cells live-grow height with the bounding box'],
  [15, 'Table height persists after mouseup'],
  [16, 'Image exposes a bottom resize handle'],
  [17, 'Image live-previews width while dragging right'],
  [18, 'Image width persists after mouseup'],
  [19, 'Image live-previews height while dragging bottom'],
  [20, 'Image height persists after mouseup'],
  [21, 'Chart exposes a bottom resize handle'],
  [22, 'Chart live-previews width while dragging right'],
  [23, 'Chart width persists after mouseup'],
  [24, 'Chart live-previews height while dragging bottom'],
  [25, 'Chart height persists after mouseup'],
  [26, 'Latex exposes a bottom resize handle'],
  [27, 'Latex live-previews width while dragging right'],
  [28, 'Latex width persists after mouseup'],
  [29, 'Latex live-previews height while dragging bottom'],
  [30, 'Latex height persists after mouseup'],
  [31, '3-column table exposes a bottom resize handle'],
  [32, '3-column table cells live-grow width with the box'],
  [33, '3-column table grow width persists after mouseup'],
  [34, '3-column table cells live-shrink height with the box'],
  [35, '3-column table shrink height persists after mouseup'],
  [36, 'Mermaid exposes a bottom resize handle'],
  [37, 'Mermaid live-previews width while dragging right'],
  [38, 'Mermaid width persists after mouseup'],
  [39, 'Mermaid live-previews height while dragging bottom'],
  [40, 'Mermaid height persists after mouseup'],
  [41, 'Video exposes a bottom resize handle'],
  [42, 'Video live-previews width while dragging right'],
  [43, 'Video width persists after mouseup'],
  [44, 'Video live-previews height while dragging bottom'],
  [45, 'Video height persists after mouseup'],
  [46, 'Audio exposes a bottom resize handle'],
  [47, 'Audio live-previews width while dragging right'],
  [48, 'Audio width persists after mouseup'],
  [49, 'Audio live-previews height while dragging bottom'],
  [50, 'Audio height persists after mouseup'],
]

const ELEMENTS = [
  {
    id: 'e2e-resize-text',
    type: 'text',
    left: 80,
    top: 80,
    width: 220,
    height: 120,
    rotate: 0,
    content: '<p>Resize text</p>',
    defaultFontName: 'Arial',
    defaultColor: '#111111',
    fill: '#ffffff',
    fixedHeight: true,
    lineHeight: 1.4,
    inset: [8, 8, 8, 8],
  },
  {
    id: 'e2e-resize-shape',
    type: 'shape',
    left: 80,
    top: 80,
    width: 200,
    height: 130,
    rotate: 0,
    viewBox: [100, 100],
    path: 'M 0 0 L 100 0 L 100 100 L 0 100 Z',
    fixedRatio: false,
    fill: '#4472c4',
    text: {
      content: '<p>Shape</p>',
      defaultFontName: 'Arial',
      defaultColor: '#ffffff',
      align: 'middle',
    },
  },
  {
    id: 'e2e-resize-table',
    type: 'table',
    left: 80,
    top: 80,
    width: 280,
    height: 100,
    rotate: 0,
    outline: { width: 1, color: '#333333', style: 'solid' },
    colWidths: [0.5, 0.5],
    cellMinHeight: 48,
    data: [
      [
        { id: 'c1', colspan: 1, rowspan: 1, text: 'A1' },
        { id: 'c2', colspan: 1, rowspan: 1, text: 'B1' },
      ],
      [
        { id: 'c3', colspan: 1, rowspan: 1, text: 'A2' },
        { id: 'c4', colspan: 1, rowspan: 1, text: 'B2' },
      ],
    ],
  },
  {
    id: 'e2e-resize-image',
    type: 'image',
    left: 80,
    top: 80,
    width: 180,
    height: 120,
    rotate: 0,
    fixedRatio: false,
    src: PNG_1X1,
  },
  {
    id: 'e2e-resize-chart',
    type: 'chart',
    left: 80,
    top: 80,
    width: 260,
    height: 220,
    rotate: 0,
    chartType: 'bar',
    data: { labels: ['A', 'B'], legends: ['S'], series: [[10, 20]] },
    themeColors: ['#5b9bd5'],
    textColor: '#333333',
    lineColor: '#dddddd',
  },
  {
    id: 'e2e-resize-latex',
    type: 'latex',
    left: 80,
    top: 80,
    width: 180,
    height: 90,
    rotate: 0,
    latex: 'E=mc^2',
    path: 'M 0 0 L 100 0',
    color: '#111111',
    strokeWidth: 2,
    viewBox: [100, 40],
    fixedRatio: false,
  },
  {
    id: 'e2e-resize-table-3col',
    type: 'table',
    resizeMode: 'grow-width-shrink-height',
    left: 80,
    top: 80,
    width: 320,
    height: 160,
    rotate: 0,
    outline: { width: 1, color: '#333333', style: 'solid' },
    colWidths: [1 / 3, 1 / 3, 1 / 3],
    cellMinHeight: 48,
    data: [
      [
        { id: 't1', colspan: 1, rowspan: 1, text: 'A' },
        { id: 't2', colspan: 1, rowspan: 1, text: 'B' },
        { id: 't3', colspan: 1, rowspan: 1, text: 'C' },
      ],
      [
        { id: 't4', colspan: 1, rowspan: 1, text: 'D' },
        { id: 't5', colspan: 1, rowspan: 1, text: 'E' },
        { id: 't6', colspan: 1, rowspan: 1, text: 'F' },
      ],
    ],
  },
  {
    id: 'e2e-resize-mermaid',
    type: 'mermaid',
    left: 80,
    top: 80,
    width: 240,
    height: 140,
    rotate: 0,
    code: 'graph TD;A-->B',
  },
  {
    id: 'e2e-resize-video',
    type: 'video',
    left: 80,
    top: 80,
    width: 280,
    height: 200,
    rotate: 0,
    src: 'https://example.test/video.mp4',
    autoplay: false,
    poster: PNG_1X1,
    ext: 'mp4',
  },
  {
    id: 'e2e-resize-audio',
    type: 'audio',
    left: 80,
    top: 80,
    width: 96,
    height: 96,
    rotate: 0,
    fixedRatio: false,
    src: 'https://example.test/audio.mp3',
    ext: 'mp3',
  },
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
    const ready = await page.evaluate(() => !!(window.__FIKA_SLIDES__ && window.__FIKA_MAIN__))
    if (ready) return
    await sleep(250)
  }
  throw new Error('window.__FIKA_SLIDES__ hook did not appear (is the fika dev server on a current build?)')
}

async function dismissUi(page) {
  await page.keyboard.press('Escape').catch(() => {})
  await page.evaluate(() => {
    const main = window.__FIKA_MAIN__
    if (!main) return
    main.getState().setEditingElementId('')
    main.getState().setScalingState?.(false)
    main.getState().setGesturingState?.(false)
  })
  await sleep(80)
}

async function selectElement(page, id) {
  for (let i = 0; i < 8; i++) {
    await page.evaluate((elId) => {
      const main = window.__FIKA_MAIN__
      main.getState().setEditingElementId('')
      main.getState().setActiveElementIdList([elId])
      main.getState().setEditorareaFocus(true)
    }, id)
    await sleep(80)
    const n = await page.locator(`#operate-element-${id} [data-resize-handle]`).count()
    if (n > 0) return
  }
  const debug = await page.evaluate((elId) => ({
    operate: !!document.getElementById(`operate-element-${elId}`),
    root: !!document.getElementById(`editable-element-${elId}`),
    handles: document.querySelectorAll('[data-resize-handle]').length,
    active: window.__FIKA_MAIN__?.getState().activeElementIdList,
    types: window.__FIKA_SLIDES__?.getState().slides[window.__FIKA_SLIDES__.getState().slideIndex]?.elements.map(el => el.type),
  }), id)
  throw new Error(`could not select ${id}: ${JSON.stringify(debug)}`)
}

async function injectElement(page, element) {
  return page.evaluate((el) => {
    const slides = window.__FIKA_SLIDES__
    const main = window.__FIKA_MAIN__
    if (!slides || !main) return false
    slides.getState().addSlide({
      id: `e2e-slide-${el.id}-${Date.now()}`,
      elements: [el],
    })
    main.getState().setActiveElementIdList([el.id])
    main.getState().setEditorareaFocus(true)
    return true
  }, element)
}

async function loadElement(page, element) {
  const ok = await injectElement(page, element)
  if (!ok) throw new Error('fika store hook missing')
  const appeared = await page.waitForSelector(`#editable-element-${element.id}`, { state: 'attached', timeout: 4000 }).then(() => true).catch(() => false)
  if (!appeared) {
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByText('Add slide').waitFor({ timeout: 15000 })
    await stripScan(page)
    await waitForStoreHook(page)
    if (!await injectElement(page, element)) throw new Error('fika store hook missing after reload')
    await page.waitForSelector(`#editable-element-${element.id}`, { state: 'attached', timeout: 15000 })
  }
  if (element.type === 'code' || element.type === 'mermaid' || element.type === 'video' || element.type === 'audio') {
    await sleep(600)
  }
  else await sleep(80)
  await selectElement(page, element.id)
  await page.waitForSelector(`#operate-element-${element.id} [data-resize-handle="bottom"]`, { timeout: 15000 })
}

async function measure(page, id) {
  return page.evaluate((elId) => {
    const root = document.getElementById(`editable-element-${elId}`)
    const box = root?.firstElementChild
    const live = root?.querySelector('[data-live-box]')
    const operate = document.getElementById(`operate-element-${elId}`)
    const svg = live?.querySelector(':scope > svg')
    const tableWrap = live?.querySelector('[data-live-table]')
    const table = tableWrap?.querySelector('table') || live?.querySelector('table')
    const row = table?.querySelector('tr')
    const parse = (value) => {
      const n = parseFloat(value || '')
      return Number.isFinite(n) ? n : 0
    }
    const tableRect = (tableWrap || table)?.getBoundingClientRect()
    const cell = table?.querySelector('td, th')
    return {
      boxW: parse(box?.style.width) || box?.getBoundingClientRect().width || 0,
      boxH: parse(box?.style.height) || box?.getBoundingClientRect().height || 0,
      liveW: parse(live?.style.width) || live?.getBoundingClientRect().width || 0,
      liveH: parse(live?.style.height) || live?.getBoundingClientRect().height || 0,
      opW: parse(operate?.style.width) || operate?.getBoundingClientRect().width || 0,
      opH: parse(operate?.style.height) || operate?.getBoundingClientRect().height || 0,
      tableW: tableRect?.width || 0,
      tableH: tableRect?.height || 0,
      cellW: cell ? cell.getBoundingClientRect().width : 0,
      svgH: svg ? svg.getBoundingClientRect().height : 0,
      rowH: row ? row.getBoundingClientRect().height : 0,
    }
  }, id)
}

async function storeSize(page, id) {
  return page.evaluate((elId) => {
    const state = window.__FIKA_SLIDES__?.getState()
    const el = state?.slides[state.slideIndex]?.elements.find(item => item.id === elId)
    return { width: el?.width || 0, height: el?.height || 0 }
  }, id)
}

async function handleBox(page, id, direction) {
  const handle = page.locator(`#operate-element-${id} [data-resize-handle="${direction}"]`).first()
  await handle.waitFor({ state: 'attached', timeout: 8000 })
  await handle.scrollIntoViewIfNeeded()
  const box = await handle.boundingBox()
  if (!box) throw new Error(`resize handle ${direction} on ${id} has no box`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function dragLive(page, id, direction, dx, dy) {
  await selectElement(page, id)
  const before = await measure(page, id)
  const start = await handleBox(page, id, direction)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + dx, start.y + dy, { steps: 10 })
  await sleep(40)
  const live = await measure(page, id)
  await page.mouse.up()
  await sleep(180)
  const after = await measure(page, id)
  const store = await storeSize(page, id)
  return { before, live, after, store }
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
  await page.getByText('Add slide').waitFor({ timeout: 15000 })
  await stripScan(page)
  await waitForStoreHook(page)

  let caseId = 1
  for (const element of ELEMENTS) {
    const groupStart = caseId
    try {
      await dismissUi(page)
      await loadElement(page, element)
      const id = element.id
      const authored = await storeSize(page, id)
      const bottomCount = await page.locator(`#operate-element-${id} [data-resize-handle="bottom"]`).count()
      rec(caseId, CASES[caseId - 1][1], bottomCount >= 1, { bottomCount })
      caseId += 1

      const shrinkWidth = element.type === 'table' && element.resizeMode !== 'grow-width-shrink-height'
      const widthDelta = shrinkWidth ? -80 : 80
      const widthDrag = await dragLive(page, id, 'right', widthDelta, 0)
      const liveWidthOk = element.type === 'table'
        ? (shrinkWidth
          ? widthDrag.before.tableW - widthDrag.live.tableW >= LIVE_PX
            && widthDrag.before.opW - widthDrag.live.opW >= LIVE_PX
            && widthDrag.before.cellW - widthDrag.live.cellW >= 8
          : widthDrag.live.tableW - widthDrag.before.tableW >= LIVE_PX
            && widthDrag.live.opW - widthDrag.before.opW >= LIVE_PX
            && widthDrag.live.cellW - widthDrag.before.cellW >= 8)
          && Math.abs(widthDrag.live.tableW - widthDrag.live.opW) < 36
        : widthDrag.live.opW - widthDrag.before.opW >= LIVE_PX
      rec(caseId, CASES[caseId - 1][1], liveWidthOk, widthDrag)
      caseId += 1
      const persistWidthOk = shrinkWidth
        ? authored.width - widthDrag.store.width >= LIVE_PX
        : widthDrag.store.width - authored.width >= LIVE_PX
      rec(caseId, CASES[caseId - 1][1], persistWidthOk, widthDrag.store)
      caseId += 1

      const afterWidth = await storeSize(page, id)
      const shrinkHeight = element.resizeMode === 'grow-width-shrink-height'
      const heightDrag = await dragLive(page, id, 'bottom', 0, shrinkHeight ? -80 : 80)
      const liveHeightOk = shrinkHeight
        ? heightDrag.before.opH - heightDrag.live.opH >= LIVE_PX
          && heightDrag.before.tableH - heightDrag.live.tableH >= LIVE_PX * 0.6
          && heightDrag.before.rowH - heightDrag.live.rowH >= 8
        : heightDrag.live.opH - heightDrag.before.opH >= LIVE_PX
          && heightDrag.live.boxH - heightDrag.before.boxH >= LIVE_PX * 0.6
          && (element.type !== 'table' || (
            heightDrag.live.tableH - heightDrag.before.tableH >= LIVE_PX * 0.6
            && heightDrag.live.rowH - heightDrag.before.rowH >= 8
          ))
      rec(caseId, CASES[caseId - 1][1], liveHeightOk, heightDrag)
      caseId += 1
      const persistHeightOk = shrinkHeight
        ? afterWidth.height - heightDrag.store.height >= LIVE_PX
        : heightDrag.store.height - afterWidth.height >= LIVE_PX
      rec(caseId, CASES[caseId - 1][1], persistHeightOk, {
        store: heightDrag.store,
        before: afterWidth,
      })
      caseId += 1
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      while (caseId < groupStart + 5 && caseId <= CASES.length) {
        rec(caseId, CASES[caseId - 1][1], false, { error: message })
        caseId += 1
      }
    }
  }

  const failed = results.filter(p => !p.pass)
  const width = 58
  console.log('#   result  case'.padEnd(width + 12) + 'measured')
  console.log('-'.repeat(96))
  for (const [id, name] of CASES) {
    const proof = results.find(p => p.id === id)
    if (!proof) throw new Error(`missing proof ${id} ${name}`)
    const mark = proof.pass ? 'PASS' : 'FAIL'
    const measured = proof.measured && typeof proof.measured === 'object'
      ? JSON.stringify({
        opW: proof.measured.live?.opW ?? proof.measured.opW,
        opH: proof.measured.live?.opH ?? proof.measured.opH,
        boxH: proof.measured.live?.boxH ?? proof.measured.boxH,
        tableW: proof.measured.live?.tableW ?? proof.measured.tableW,
        tableH: proof.measured.live?.tableH ?? proof.measured.tableH,
        cellW: proof.measured.live?.cellW ?? proof.measured.cellW,
        rowH: proof.measured.live?.rowH ?? proof.measured.rowH,
        width: proof.measured.width ?? proof.measured.store?.width,
        height: proof.measured.height ?? proof.measured.store?.height,
        bottomCount: proof.measured.bottomCount,
        error: proof.measured.error,
      })
      : ''
    console.log(`${String(id).padEnd(4)}${mark.padEnd(8)}${name.padEnd(width)}${measured}`)
  }
  if (results.length !== CASES.length) throw new Error(`expected ${CASES.length} proofs, got ${results.length}`)
  if (failed.length) throw new Error(`${failed.length} resize-elements proofs failed: ${failed.map(p => p.id).join(', ')}`)
  console.log('-'.repeat(96))
  console.log('resize-elements e2e passed (50 cases)')
  await page.close()
}
finally {
  await browser.close()
  if (child) child.kill()
}
