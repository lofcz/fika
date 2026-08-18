/**
 * Alt+Click layer cycling and the ink layer-stack picker.
 *
 * Each clean Alt+Click steps the selection one layer down the stack under the
 * pointer (wrapping past the bottom), skipping locked elements and collapsing
 * groups into one entry. The picker panel anchors at the click point, lists
 * the stack top->bottom, allows direct row picks, and closes on Escape or a
 * plain click elsewhere.
 *
 *   node scripts/e2e-layer-cycle.mjs
 */
import { chromium } from 'playwright'

const sleep = ms => new Promise(r => setTimeout(r, ms))
const DEV_PORTS = [5173, 5174, 5175, 5176]

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
  const override = process.env.FIKA_DEV_URL
  if (override) return override.endsWith('/') ? override : `${override}/`
  for (const port of DEV_PORTS) {
    const url = `http://127.0.0.1:${port}/`
    if (await isFikaDev(url)) return url
  }
  return null
}

async function waitForHooks(page) {
  const start = Date.now()
  while (Date.now() - start < 20000) {
    if (await page.evaluate(() => !!(window.__FIKA_SLIDES__ && window.__FIKA_MAIN__))) return
    await sleep(250)
  }
  throw new Error('fika store hooks did not appear')
}

const rectShape = (id, left, top, width, height, fill, extra = {}) => ({
  id,
  type: 'shape',
  left,
  top,
  width,
  height,
  rotate: 0,
  viewBox: [200, 200],
  path: 'M 0 0 L 200 0 L 200 200 L 0 200 Z',
  fill,
  fixedRatio: false,
  opacity: 1,
  ...extra,
})

async function seed(page) {
  await page.evaluate(() => {
    const slides = [{
      id: 'layer-cycle-slide',
      background: { type: 'solid', color: '#ffffff' },
      elements: window.__FIKA_E2E_ELEMENTS__,
    }]
    window.__FIKA_SLIDES__.getState().setSlides(slides, undefined, { clone: false })
    window.__FIKA_SLIDES__.getState().updateSlideIndex(0)
    window.__FIKA_MAIN__.getState().setActiveElementIdList([])
  })
  await sleep(600)
}

/** Client coords for a canvas-space point inside the editor viewport. */
async function clientPoint(page, canvasX, canvasY) {
  return page.evaluate(({ canvasX, canvasY }) => {
    const wrappers = [...document.querySelectorAll('.viewport-wrapper')]
    let best = null
    for (const el of wrappers) {
      const rect = el.getBoundingClientRect()
      if (!best || rect.width > best.rect.width) best = { el, rect }
    }
    if (!best) throw new Error('no viewport-wrapper')
    const scale = window.__FIKA_MAIN__.getState().canvasScale
    return {
      x: best.rect.left + canvasX * scale,
      y: best.rect.top + canvasY * scale,
    }
  }, { canvasX, canvasY })
}

async function activeIds(page) {
  return page.evaluate(() => window.__FIKA_MAIN__.getState().activeElementIdList.slice().sort())
}

async function altClickCanvas(page, canvasX, canvasY) {
  const pt = await clientPoint(page, canvasX, canvasY)
  await page.keyboard.down('Alt')
  await page.mouse.move(pt.x, pt.y)
  await page.mouse.down()
  await sleep(50)
  await page.mouse.up()
  await page.keyboard.up('Alt')
  await sleep(200)
}

async function panelState(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('[data-layer-stack]')
    if (!panel) return { visible: false }
    const rows = [...panel.querySelectorAll('button')]
    return {
      visible: true,
      rows: rows.length,
      disabled: rows.map((row, index) => (row.disabled ? index : -1)).filter(index => index >= 0),
    }
  })
}

const results = []
function check(name, pass, detail) {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${detail ? JSON.stringify(detail) : ''}`)
}

const browser = await chromium.launch({ headless: true })
try {
  const devUrl = await findFikaDev()
  if (!devUrl) throw new Error('no dev server found')
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(devUrl, { waitUntil: 'networkidle' })
  await waitForHooks(page)

  await page.evaluate((elements) => { window.__FIKA_E2E_ELEMENTS__ = elements }, [
    rectShape('big-card', 60, 60, 700, 420, '#5b7f4b'),
    rectShape('grp-a', 220, 140, 260, 180, '#7a9cc6', { groupId: 'g1' }),
    rectShape('grp-b', 260, 170, 260, 180, '#8fb5d9', { groupId: 'g1' }),
    rectShape('locked-shape', 240, 160, 220, 140, '#c65b5b', { lock: true }),
    {
      id: 'top-text',
      type: 'text',
      left: 250,
      top: 180,
      width: 200,
      height: 60,
      rotate: 0,
      content: '<p style="font-size: 18px">Top text</p>',
      defaultFontName: 'Arial',
      defaultColor: '#18181b',
    },
  ])
  await seed(page)

  // Probe point inside every element: stack = top-text, locked, group(g1), big-card.
  const PX = 320
  const PY = 210

  // 1. First Alt+Click selects the topmost layer and opens the picker.
  await altClickCanvas(page, PX, PY)
  let panel = await panelState(page)
  check('alt+click selects topmost layer', (await activeIds(page)).join(',') === 'top-text', await activeIds(page))
  check('picker opens with the full stack', panel.visible && panel.rows === 4, panel)
  check('locked layer row is disabled', (panel.disabled || []).join(',') === '1', panel)

  // 2. Next Alt+Click steps below, skipping the locked layer and selecting the whole group.
  await altClickCanvas(page, PX, PY)
  check('alt+click skips locked and selects the group', (await activeIds(page)).join(',') === 'grp-a,grp-b', await activeIds(page))

  // 3. Next step reaches the bottom card.
  await altClickCanvas(page, PX, PY)
  check('alt+click reaches the bottom layer', (await activeIds(page)).join(',') === 'big-card', await activeIds(page))

  // 4. Cycling wraps back to the top.
  await altClickCanvas(page, PX, PY)
  check('alt+click wraps back to the top layer', (await activeIds(page)).join(',') === 'top-text', await activeIds(page))

  // 5. Clicking a picker row selects that layer directly.
  await page.locator('[data-layer-stack] button').nth(3).click()
  await sleep(200)
  check('picker row click selects that layer', (await activeIds(page)).join(',') === 'big-card', await activeIds(page))
  panel = await panelState(page)
  check('picker stays open after a row pick', panel.visible === true, panel)

  // 6. Escape closes the picker.
  await page.keyboard.press('Escape')
  await sleep(150)
  panel = await panelState(page)
  check('escape closes the picker', panel.visible === false, panel)

  // 7. Alt+Click on empty canvas does not open the picker.
  await altClickCanvas(page, 900, 520)
  panel = await panelState(page)
  check('alt+click on blank canvas keeps the picker closed', panel.visible === false, panel)

  // 8. A plain click elsewhere closes a reopened picker.
  await altClickCanvas(page, PX, PY)
  panel = await panelState(page)
  check('picker reopens on alt+click', panel.visible === true, panel)
  const away = await clientPoint(page, 900, 520)
  await page.mouse.click(away.x, away.y)
  await sleep(200)
  panel = await panelState(page)
  check('plain click elsewhere closes the picker', panel.visible === false, panel)

  await page.close()
}
catch (err) {
  console.error(err)
  process.exitCode = 1
}
finally {
  await browser.close()
}

if (results.some(r => !r.pass)) process.exitCode = 1
