/**
 * Regression (user repro): slide-2 TITLE typed then MOVED INTO the body
 * placeholder area — title index 0 sits UNDER the body index 1, so raw
 * z-order let the empty body placeholder steal every click. Empty
 * placeholders must yield to visible content regardless of z-order. Also
 * checks the placeholder's own empty prompt area still selects it.
 *
 *   node scripts/e2e-hit-placeholder-yield.mjs
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const DEV_PORTS = [5173, 5174, 5175, 5176]

async function isFikaDev(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) return false
    const html = await res.text()
    return html.includes('fika-shell') || html.includes('>fika<')
  }
  catch { return false }
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

const browser = await chromium.launch({ headless: true })
let child = null
try {
  let devUrl = await waitForDev(1500)
  if (!devUrl) {
    child = spawn('npm', ['run', 'dev'], { cwd: root, shell: true, stdio: 'ignore' })
    devUrl = await waitForDev(90000)
    if (!devUrl) throw new Error('dev server did not start')
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  await page.goto(devUrl, { waitUntil: 'networkidle' })
  await page.getByText('Add slide').waitFor({ timeout: 90000 })
  await page.evaluate(() => document.querySelectorAll('[data-react-scan], #react-scan-root').forEach(el => el.remove()))
  await page.getByText('Add slide').click()
  await sleep(500)

  // 1) Type into the TITLE placeholder.
  await page.evaluate(() => {
    const st = window.__FIKA_SLIDES__.getState()
    const slide = st.slides[st.slideIndex]
    const title = slide.elements.find(el => el.type === 'text' && el.textType === 'title')
    const m = window.__FIKA_MAIN__.getState()
    m.setActiveElementIdList([title.id])
    m.setEditingElementId(title.id)
    m.setEditorareaFocus(true)
  })
  await sleep(350)
  await page.evaluate(() => {
    const st = window.__FIKA_SLIDES__.getState()
    const slide = st.slides[st.slideIndex]
    const title = slide.elements.find(el => el.type === 'text' && el.textType === 'title')
    const pm = document.getElementById(`editable-element-${title.id}`)?.querySelector('.ProseMirror')
    const view = pm?.__pmView
    if (view) view.dispatch(view.state.tr.delete(0, view.state.doc.content.size).insertText('Muj presuneny titulek'))
  })
  await sleep(250)
  await page.keyboard.press('Escape')
  await page.evaluate(() => window.__FIKA_MAIN__.getState().setEditingElementId(''))
  await sleep(300)

  // 2) MOVE the title INTO the body placeholder area (real drag).
  const titleGeom = await page.evaluate(() => {
    const st = window.__FIKA_SLIDES__.getState()
    const slide = st.slides[st.slideIndex]
    const title = slide.elements.find(el => el.type === 'text' && el.textType === 'title')
    const body = slide.elements.find(e => e.type === 'text' && e.textType === 'content')
    const pm = document.getElementById(`editable-element-${title.id}`)?.querySelector('.ProseMirror')
    const r = pm.getBoundingClientRect()
    return {
      titleId: title.id,
      bodyId: body.id,
      titleIndex: slide.elements.findIndex(e => e.id === title.id),
      bodyIndex: slide.elements.findIndex(e => e.id === body.id),
      bodyRect: { top: body.top, left: body.left },
      pm: { x: r.x, y: r.y, w: r.width, h: r.height },
    }
  })
  console.log('setup:', JSON.stringify({ titleIndex: titleGeom.titleIndex, bodyIndex: titleGeom.bodyIndex }))

  // Drag the title so its text lands inside the body slot (165..449 vertical).
  // Store move: the geometry/z-order is what matters (title index 0 UNDER body).
  await page.evaluate(() => {
    const st = window.__FIKA_SLIDES__.getState()
    const slide = st.slides[st.slideIndex]
    const title = slide.elements.find(el => el.type === 'text' && el.textType === 'title')
    st.updateElement({ id: title.id, props: { top: 240 } })
  })
  await sleep(400)

  const moved = await page.evaluate(() => {
    const st = window.__FIKA_SLIDES__.getState()
    const slide = st.slides[st.slideIndex]
    const title = slide.elements.find(el => el.type === 'text' && el.textType === 'title')
    const body = slide.elements.find(e => e.type === 'text' && e.textType === 'content')
    const pm = document.getElementById(`editable-element-${title.id}`)?.querySelector('.ProseMirror')
    const content = document.getElementById(`editable-element-${title.id}`)?.querySelector('[data-live-box]')
    const r = pm.getBoundingClientRect()
    const inside = title.top + title.height > body.top && title.top < body.top + body.height
    return {
      titleId: title.id,
      bodyId: body.id,
      titleTop: title.top,
      bodyTop: body.top,
      titleH: title.height,
      overlap: inside,
      storeH: title.height,
      paintH: content.getBoundingClientRect().height,
      pm: { x: r.x, y: r.y, w: r.width, h: r.height },
    }
  })
  console.log('moved:', JSON.stringify({ titleTop: moved.titleTop, bodyTop: moved.bodyTop, overlap: moved.overlap, storeH: moved.storeH, paintH: Math.round(moved.paintH) }))
  if (!moved.overlap) throw new Error('drag did not move title into the body area')

  const state = () => page.evaluate(ids => {
    const m = window.__FIKA_MAIN__.getState()
    return {
      active: m.activeElementIdList,
      editing: m.editingElementId,
      editorFocused: !!document.querySelector('.ProseMirror-focused'),
      titleId: ids.titleId,
      bodyId: ids.bodyId,
    }
  }, { titleId: moved.titleId, bodyId: moved.bodyId })

  const clickTitle = async (fx, fy) => {
    const g = await page.evaluate(id => {
      const pm = document.getElementById(`editable-element-${id}`)?.querySelector('.ProseMirror')
      const r = pm.getBoundingClientRect()
      return { x: r.x, y: r.y, w: r.width, h: r.height }
    }, moved.titleId)
    await page.mouse.click(g.x + g.w * fx, g.y + g.h * fy)
    await sleep(250)
    return state()
  }

  const results = []
  // Deselect everything first.
  await page.evaluate(() => window.__FIKA_MAIN__.getState().setActiveElementIdList([]))
  await sleep(250)

  const s1 = await clickTitle(0.5, 0.5)
  results.push({ step: 'click UNSELECTED title (inside body area)', ok: s1.active.includes(s1.titleId) && !s1.active.includes(s1.bodyId), ...s1 })
  const s2 = await clickTitle(0.5, 0.5)
  results.push({ step: 'click SELECTED title', ok: s2.active.includes(s2.titleId) && !s2.active.includes(s2.bodyId), ...s2 })
  const s3 = await clickTitle(0.4, 0.4)
  results.push({ step: 'click EDITING title', ok: s3.editing === s3.titleId, ...s3 })
  await page.keyboard.press('Escape')
  await sleep(250)
  const s4 = await clickTitle(0.6, 0.7)
  results.push({ step: 'click after Escape (selected)', ok: s4.active.includes(s4.titleId) && !s4.active.includes(s4.bodyId), ...s4 })

  // The body placeholder's own EMPTY prompt area (above the moved title)
  // must still select the body.
  await page.keyboard.press('Escape')
  await page.evaluate(() => window.__FIKA_MAIN__.getState().setActiveElementIdList([]))
  await sleep(250)
  const promptPoint = await page.evaluate(ids => {
    const st = window.__FIKA_SLIDES__.getState()
    const slide = st.slides[st.slideIndex]
    const body = slide.elements.find(e => e.id === ids.bodyId)
    const title = slide.elements.find(e => e.id === ids.titleId)
    const vp = document.querySelector('[class*=viewport-wrapper]')
    const r = vp.getBoundingClientRect()
    const scale = r.height / 562.5
    // a point inside the body slot ABOVE the title box (title.top = 240)
    const slideY = Math.max(body.top + 20, Math.min(title.top - 15, body.top + 40))
    return { x: r.x + (body.left + 100) * (r.width / 1000), y: r.y + slideY * scale }
  }, { bodyId: moved.bodyId, titleId: moved.titleId })
  await page.mouse.click(promptPoint.x, promptPoint.y)
  await sleep(300)
  const s5 = await state()
  results.push({ step: 'click empty prompt area selects the placeholder', ok: s5.active.includes(s5.bodyId), ...s5 })

  const bad = results.filter(r => !r.ok)
  console.log(JSON.stringify(results.map(({ active, editing, ok, step }) => ({ step, ok, active, editing })), null, 1))
  console.log(bad.length ? `FAILING: ${bad.length}` : 'ALL STATES SELECT THE TITLE')
  process.exitCode = bad.length ? 1 : 0
}
finally {
  await browser.close()
  if (child) child.kill()
}
