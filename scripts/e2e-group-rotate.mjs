/**
 * Hypothesis: a grouped curved line cannot be rotated even though
 * rotateLineElement already rebuilds curve/cubic/broken controls.
 *
 *   node scripts/e2e-group-rotate.mjs
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const DEV_PORTS = [5173, 5174, 5175, 5176, 5188]

const CASES = [
  [1, 'Grouped box + straight line shows a rotate handle'],
  [2, 'Grouped box + curved line shows a rotate handle'],
  [3, 'Grouped box + cubic line shows a rotate handle'],
  [4, 'Grouped box + broken line shows a rotate handle'],
  [5, 'Ungrouped box + curve does not show a group rotate handle'],
]

const BOX = (id, left, top, width, height) => ({
  id,
  type: 'shape',
  left,
  top,
  width,
  height,
  rotate: 0,
  viewBox: [width, height],
  path: `M 0 0 L ${width} 0 L ${width} ${height} L 0 ${height} Z`,
  fixedRatio: false,
  fill: '#d4d4d8',
})

const STRAIGHT = {
  id: 'e2e-rot-straight',
  type: 'line',
  left: 420,
  top: 200,
  start: [0, 0],
  end: [200, 0],
  width: 4,
  style: 'solid',
  color: '#2563eb',
  points: ['', ''],
}

const CURVE = {
  id: 'e2e-rot-curve',
  type: 'line',
  left: 420,
  top: 320,
  start: [0, 0],
  end: [240, 0],
  curve: [-80, -150],
  width: 4,
  style: 'solid',
  color: '#2563eb',
  points: ['', 'arrow'],
}

const CUBIC = {
  id: 'e2e-rot-cubic',
  type: 'line',
  left: 400,
  top: 280,
  start: [0, 0],
  end: [220, 0],
  cubic: [[40, -120], [180, 90]],
  width: 4,
  style: 'solid',
  color: '#16a34a',
  points: ['', ''],
}

const BROKEN = {
  id: 'e2e-rot-broken',
  type: 'line',
  left: 380,
  top: 240,
  start: [0, 0],
  end: [180, 80],
  broken: [90, -60],
  width: 4,
  style: 'solid',
  color: '#dc2626',
  points: ['', ''],
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

async function loadGrouped(page, elements, groupId) {
  await page.keyboard.press('Escape').catch(() => {})
  const ids = elements.map(el => el.id)
  const ok = await page.evaluate(({ els, gid, elIds }) => {
    const slides = window.__FIKA_SLIDES__
    const main = window.__FIKA_MAIN__
    if (!slides || !main) return false
    slides.getState().updateSlide({
      elements: els.map(el => ({ ...el, groupId: gid })),
    })
    main.getState().setEditingElementId('')
    main.getState().setActiveElementIdList(elIds)
    main.getState().setActiveGroupElementId('')
    main.getState().setEditorareaFocus(true)
    return true
  }, { els: elements, gid: groupId, elIds: ids })
  if (!ok) throw new Error('fika store hook missing')
  await page.waitForSelector(`#editable-element-${ids[0]}`, { state: 'attached', timeout: 8000 })
  await sleep(160)
}

async function rotateHandleCount(page) {
  return page.locator('[data-rotate-handle]').filter({ visible: true }).count()
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

  const boxA = BOX('e2e-rot-box-a', 80, 90, 200, 110)
  await loadGrouped(page, [boxA, STRAIGHT], 'e2e-rot-g-straight')
  rec(1, (await rotateHandleCount(page)) > 0, { handles: await rotateHandleCount(page) })

  const boxB = BOX('e2e-rot-box-b', 80, 90, 200, 110)
  await loadGrouped(page, [boxB, CURVE], 'e2e-rot-g-curve')
  rec(2, (await rotateHandleCount(page)) > 0, { handles: await rotateHandleCount(page) })

  const boxC = BOX('e2e-rot-box-c', 80, 90, 200, 110)
  await loadGrouped(page, [boxC, CUBIC], 'e2e-rot-g-cubic')
  rec(3, (await rotateHandleCount(page)) > 0, { handles: await rotateHandleCount(page) })

  const boxD = BOX('e2e-rot-box-d', 80, 90, 200, 110)
  await loadGrouped(page, [boxD, BROKEN], 'e2e-rot-g-broken')
  rec(4, (await rotateHandleCount(page)) > 0, { handles: await rotateHandleCount(page) })

  const boxE = BOX('e2e-rot-box-e', 80, 90, 200, 110)
  await loadGrouped(page, [boxE, CURVE], '')
  rec(5, (await rotateHandleCount(page)) === 0, { handles: await rotateHandleCount(page) })

  const failed = results.filter(p => !p.pass)
  const width = 68
  console.log('#   result  case'.padEnd(width + 12) + 'measured')
  console.log('-'.repeat(120))
  for (const [id, name] of CASES) {
    const proof = results.find(p => p.id === id)
    if (!proof) throw new Error(`missing proof ${id} ${name}`)
    const mark = proof.pass ? 'PASS' : 'FAIL'
    console.log(`${String(id).padEnd(4)}${mark.padEnd(8)}${name.padEnd(width)}${JSON.stringify(proof.measured)}`)
  }
  if (results.length !== CASES.length) throw new Error(`expected ${CASES.length} proofs, got ${results.length}`)
  if (failed.length) throw new Error(`${failed.length} group-rotate proofs failed: ${failed.map(p => p.id).join(', ')}`)
  console.log('-'.repeat(120))
  console.log(`group-rotate e2e passed (${CASES.length} cases)`)
  await page.close()
}
finally {
  await browser.close()
  if (child) child.kill()
}
