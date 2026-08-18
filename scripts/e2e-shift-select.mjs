/**
 * Shift+click selection toggling with overlapping elements.
 *
 * A selected element leaves the HitLayer and its Operate chrome (z above the
 * hit layer) owns its whole box. Shift/ctrl toggle clicks over that box must
 * still be z-order arbitrated: foreground elements get added/removed, the
 * selected element itself toggles out, and text never enters edit mode on a
 * toggle click.
 *
 *   node scripts/e2e-shift-select.mjs
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

const BIG_ID = 'big-card'
const TEXT_ID = 'fg-text'
const SHAPE_ID = 'fg-shape'
const OFF_TEXT_ID = 'off-text'

async function seed(page) {
  await page.evaluate(({ BIG_ID, TEXT_ID, SHAPE_ID, OFF_TEXT_ID }) => {
    const slides = [{
      id: 'repro-slide',
      background: { type: 'solid', color: '#ffffff' },
      elements: [
        {
          id: BIG_ID,
          type: 'shape',
          left: 60,
          top: 60,
          width: 700,
          height: 420,
          rotate: 0,
          viewBox: [200, 200],
          path: 'M 0 0 L 200 0 L 200 200 L 0 200 Z',
          fill: '#5b7f4b',
          fixedRatio: false,
          opacity: 1,
        },
        {
          id: TEXT_ID,
          type: 'text',
          left: 140,
          top: 140,
          width: 260,
          height: 60,
          rotate: 0,
          content: '<p style="font-size: 20px">Foreground text</p>',
          defaultFontName: 'Arial',
          defaultColor: '#18181b',
        },
        {
          id: SHAPE_ID,
          type: 'shape',
          left: 460,
          top: 260,
          width: 160,
          height: 120,
          rotate: 0,
          viewBox: [200, 200],
          path: 'M 0 0 L 200 0 L 200 200 L 0 200 Z',
          fill: '#d98a3d',
          fixedRatio: false,
          opacity: 1,
        },
        {
          id: OFF_TEXT_ID,
          type: 'text',
          left: 780,
          top: 480,
          width: 180,
          height: 50,
          rotate: 0,
          content: '<p style="font-size: 18px">Off-card text</p>',
          defaultFontName: 'Arial',
          defaultColor: '#18181b',
        },
      ],
    }]
    window.__FIKA_SLIDES__.getState().setSlides(slides, undefined, { clone: false })
    window.__FIKA_SLIDES__.getState().updateSlideIndex(0)
    window.__FIKA_MAIN__.getState().setActiveElementIdList([])
  }, { BIG_ID, TEXT_ID, SHAPE_ID, OFF_TEXT_ID })
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

async function clickCanvas(page, canvasX, canvasY, { shift = false } = {}) {
  const pt = await clientPoint(page, canvasX, canvasY)
  if (shift) await page.keyboard.down('Shift')
  await page.mouse.move(pt.x, pt.y)
  await page.mouse.down()
  await sleep(60)
  await page.mouse.up()
  if (shift) await page.keyboard.up('Shift')
  await sleep(200)
}

const results = []
function check(name, pass, detail) {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${detail ? JSON.stringify(detail) : ''}`)
}

const browser = await chromium.launch({ headless: true })
try {
  const devUrl = await findFikaDev()
  if (!devUrl) throw new Error('no dev server found')
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(devUrl, { waitUntil: 'networkidle' })
  await waitForHooks(page)
  await seed(page)

  // 1. Plain click on the big card (point clear of foreground elements).
  await clickCanvas(page, 100, 100)
  check('click big card selects it', (await activeIds(page)).join(',') === BIG_ID, await activeIds(page))

  // 2. Shift+click the foreground TEXT sitting over the big card -> add.
  await clickCanvas(page, 270, 170, { shift: true })
  check('shift+click fg text adds it', (await activeIds(page)).join(',') === [BIG_ID, TEXT_ID].sort().join(','), await activeIds(page))

  // 3. Shift+click the foreground SHAPE over the big card -> add.
  await clickCanvas(page, 540, 320, { shift: true })
  check('shift+click fg shape adds it', (await activeIds(page)).join(',') === [BIG_ID, TEXT_ID, SHAPE_ID].sort().join(','), await activeIds(page))

  // 4. Shift+click the foreground TEXT again -> remove.
  await clickCanvas(page, 270, 170, { shift: true })
  check('shift+click fg text removes it', (await activeIds(page)).join(',') === [BIG_ID, SHAPE_ID].sort().join(','), await activeIds(page))

  // 5. Shift+click a text OUTSIDE the big card -> add (HitLayer path), no edit mode.
  await clickCanvas(page, 870, 505, { shift: true })
  const editing = await page.evaluate(() => window.__FIKA_MAIN__.getState().editingElementId)
  check('shift+click off-card text adds it', (await activeIds(page)).join(',') === [BIG_ID, SHAPE_ID, OFF_TEXT_ID].sort().join(','), await activeIds(page))
  check('shift+click off-card text does not enter edit', !editing, { editing })

  // 6. Shift+click the big card itself -> remove it (click clear of fg elements).
  await clickCanvas(page, 100, 100, { shift: true })
  check('shift+click big card removes it', (await activeIds(page)).join(',') === [SHAPE_ID, OFF_TEXT_ID].sort().join(','), await activeIds(page))

  // 7. Plain click on the big card again reselects only it (chrome untouched for plain clicks).
  await clickCanvas(page, 100, 100)
  check('plain click reselects big card only', (await activeIds(page)).join(',') === BIG_ID, await activeIds(page))

  // 8. With big card selected, plain click on its interior over no fg element keeps chrome behavior (edit surface).
  //    (Just assert selection did not change unexpectedly.)
  await clickCanvas(page, 100, 100)
  check('plain click inside selected card keeps it selected', (await activeIds(page)).includes(BIG_ID), await activeIds(page))

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
