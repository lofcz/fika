/**
 * Placeholder slot semantics — the ONE uniform rule:
 *   auto boxes track their text but never shrink below their slot floor
 *   (empty slots + content-slide titles keep the slot; filled bodies hug);
 *   toggling FIXED restores a placeholder to its slot instead of locking the
 *   last hugged height; shrink-to-fit never squeezes text that fits the slot.
 *
 *   node scripts/e2e-placeholder-slot.mjs
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

const results = []
const rec = (name, pass, measured) => results.push({ name, pass: !!pass, measured })

const browser = await chromium.launch({ headless: true })
let child = null
try {
  let devUrl = await waitForDev(1500)
  if (!devUrl) {
    child = spawn('npm', ['run', 'dev'], { cwd: root, shell: true, stdio: 'ignore' })
    devUrl = await waitForDev(90000)
    if (!devUrl) throw new Error('fika dev server did not start')
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  await page.goto(devUrl, { waitUntil: 'networkidle' })
  await page.getByText('Add slide').waitFor({ timeout: 90000 })
  await page.evaluate(() => document.querySelectorAll('[data-react-scan], #react-scan-root').forEach(el => el.remove()))
  await sleep(300)

  const snapshot = (textType, slideIdx) => page.evaluate(({ tt, idx }) => {
    const slides = window.__FIKA_SLIDES__.getState()
    const slide = slides.slides[idx ?? slides.slideIndex]
    const el = slide.elements.find(e => e.type === 'text' && e.textType === tt)
    const root = document.getElementById(`editable-element-${el.id}`)
    const content = root?.querySelector('[data-live-box]')
    const pm = root?.querySelector('.ProseMirror, .ProseMirror-static')
    const host = root?.querySelector('[data-text-fit-host]')
    if (!content || !pm) return { error: 'no dom' }
    const scale = content.getBoundingClientRect().width / el.width
    const cRect = content.getBoundingClientRect()
    const range = document.createRange()
    range.selectNodeContents(pm)
    const rects = [...range.getClientRects()].filter(r => r.height > 0.5)
    range.detach()
    const textTop = rects.length ? (Math.min(...rects.map(r => r.top)) - cRect.top) / scale : null
    const textBottom = rects.length ? (Math.max(...rects.map(r => r.bottom)) - cRect.top) / scale : null
    return {
      fixedHeight: !!el.fixedHeight,
      storeH: el.height,
      slotH: el.placeholderLayoutHeight ?? null,
      boxH: cRect.height / scale,
      styleHeight: content.style.height,
      minH: content.style.minHeight,
      mode: content.getAttribute('data-text-box-mode'),
      fitScale: host ? getComputedStyle(host).getPropertyValue('--text-fit-scale').trim() || null : null,
      textTop,
      textBottom,
      empty: !(el.content || '').replace(/<[^>]+>/g, '').trim(),
    }
  }, { tt: textType, idx: slideIdx })

  const settle = async (textType, slideIdx) => {
    let prev = null
    let cur = null
    for (let i = 0; i < 25; i++) {
      await sleep(100)
      cur = await snapshot(textType, slideIdx)
      if (prev && prev.storeH === cur.storeH && prev.boxH === cur.boxH) break
      prev = cur
    }
    return cur
  }

  const focusElement = (textType, slideIdx, edit) => page.evaluate(({ tt, idx, ed }) => {
    const slides = window.__FIKA_SLIDES__.getState()
    const slide = slides.slides[idx ?? slides.slideIndex]
    const el = slide.elements.find(e => e.type === 'text' && e.textType === tt)
    const main = window.__FIKA_MAIN__.getState()
    main.setActiveElementIdList([el.id])
    if (ed) main.setEditingElementId(el.id)
    else main.setEditingElementId('')
    main.setEditorareaFocus(true)
  }, { tt: textType, idx: slideIdx, edit })

  const typeInto = async (textType, slideIdx, text) => {
    await focusElement(textType, slideIdx, true)
    await sleep(300)
    const ok = await page.evaluate(({ tt, idx, txt }) => {
      const slides = window.__FIKA_SLIDES__.getState()
      const slide = slides.slides[idx ?? slides.slideIndex]
      const el = slide.elements.find(e => e.type === 'text' && e.textType === tt)
      const root = document.getElementById(`editable-element-${el.id}`)
      const pm = root?.querySelector('.ProseMirror')
      const view = pm?.__pmView
      if (!view) return false
      view.focus()
      const { state } = view
      view.dispatch(state.tr.delete(0, state.doc.content.size).insertText(txt))
      return true
    }, { tt: textType, idx: slideIdx, txt: text })
    if (!ok) throw new Error(`no pm view for ${textType}`)
    await sleep(200)
    await page.keyboard.press('Escape')
    await page.evaluate(({ tt, idx }) => {
      const slides = window.__FIKA_SLIDES__.getState()
      const slide = slides.slides[idx ?? slides.slideIndex]
      const el = slide.elements.find(e => e.type === 'text' && e.textType === tt)
      const pm = document.getElementById(`editable-element-${el.id}`)?.querySelector('.ProseMirror')
      if (pm instanceof HTMLElement) pm.blur()
    }, { tt: textType, idx: slideIdx })
    await focusElement(textType, slideIdx, false)
    await sleep(250)
  }

  const clickPanel = async sel => {
    await page.locator(sel).first().click({ force: true })
    await sleep(350)
  }

  // ---------- Slide 2 (content) ----------
  await page.getByText('Add slide').click()
  await sleep(500)
  const S2 = null

  // 1) Content title keeps its slot and centers when typed (auto).
  await typeInto('title', S2, 'Proč se máme špatně?')
  const t1 = await settle('title', S2)
  rec('content title stays in its slot when typed', t1.storeH === 88 && t1.boxH > 80 && t1.boxH < 96, t1)
  rec('content title centers text in the slot', t1.textTop > 20 && t1.textBottom < 68 && Math.abs(t1.textTop - (88 - t1.textBottom)) < 2.5, t1)
  rec('content title auto mode paints slot via min-height', t1.styleHeight === 'auto' && t1.minH === '88px' && t1.mode === 'grow', t1)
  rec('store height equals painted box (hit honesty)', Math.abs(t1.boxH - t1.storeH) <= 1.5, t1)

  // 2) Long title grows past the slot.
  await typeInto('title', S2, 'Proč se máme špatně? A very long second part of the title that must wrap across multiple lines for sure, plus a third wrapping line to overflow the two-line slot generously')
  const t2 = await settle('title', S2)
  rec('long content title grows past the slot', t2.storeH > 110 && t2.textBottom <= t2.boxH - 4, t2)

  // 3) Shortened title shrinks back to the slot (not below).
  await typeInto('title', S2, 'krátký titul')
  const t3 = await settle('title', S2)
  rec('shortened title settles back at the slot', Math.abs(t3.storeH - 88) <= 1, t3)

  // 4) Title fixed round trip keeps the slot; no shrink-to-fit squeeze.
  await clickPanel('[data-height-mode="fixed"]')
  const t4 = await settle('title', S2)
  await clickPanel('[data-height-mode="auto"]')
  const t5 = await settle('title', S2)
  rec('title fixed keeps slot without squeezing type', t4.storeH >= 88 && t4.fitScale === null, t4)
  rec('title auto round trip is stable', Math.abs(t5.storeH - t4.storeH) <= 1 && t5.fitScale === null, t5)

  // 5) Body: fixed default, typed one line — slot intact, text on top, no fit shrink.
  await typeInto('content', S2, 'one body line')
  const b1 = await settle('content', S2)
  rec('body fixed keeps its slot while typing', b1.storeH === 284 && b1.fitScale === null, b1)
  rec('body fixed text sits at the top', b1.textTop < 12 && b1.textBottom < 70, b1)

  // 6) Body vAlign middle centers inside the slot.
  await clickPanel('button:has(svg.lucide-align-vertical-justify-center)')
  const b2 = await settle('content', S2)
  const centered = Math.abs(b2.textTop - (284 - b2.textBottom)) < 2.5
  await clickPanel('button:has(svg.lucide-align-vertical-justify-start)')
  rec('body vAlign middle centers in the slot', centered && b2.textTop > 100, b2)

  // 7) Body auto hugs; auto->fixed restores the slot.
  await clickPanel('[data-height-mode="auto"]')
  const b3 = await settle('content', S2)
  rec('body auto hugs the text', b3.storeH < 100 && b3.styleHeight === 'auto', b3)
  await clickPanel('[data-height-mode="fixed"]')
  const b4 = await settle('content', S2)
  rec('body auto->fixed restores the slot (284)', b4.storeH === 284 && b4.fitScale === null, b4)

  // ---------- Slide 1 (cover) — must stay unchanged ----------
  const S1 = 0
  await page.evaluate(() => {
    const main = window.__FIKA_MAIN__.getState()
    main.setActiveElementIdList([])
    window.__FIKA_SLIDES__.getState().updateSlideIndex(0)
  })
  await sleep(400)
  await typeInto('title', S1, 'Hlavní titul')
  const c1 = await settle('title', S1)
  rec('cover title auto grows with text', c1.storeH > 80 && c1.styleHeight === 'auto', c1)
  await clickPanel('[data-height-mode="fixed"]')
  const c2 = await settle('title', S1)
  rec('cover title fixed restores its slot (~100)', Math.abs(c2.storeH - 100) <= 2, c2)
  await clickPanel('[data-height-mode="auto"]')
  const c3 = await settle('title', S1)
  rec('cover title back to auto still fits its text', c3.textBottom <= c3.boxH + 1 && c3.styleHeight === 'auto', c3)

  // ---------- No clip flash when a line is added while editing ----------
  await page.evaluate(() => {
    const main = window.__FIKA_MAIN__.getState()
    main.setActiveElementIdList([])
    window.__FIKA_SLIDES__.getState().updateSlideIndex(1)
  })
  await sleep(400)
  await focusElement('title', null, true)
  await sleep(300)
  const clipWatch = await page.evaluate(() => {
    const st = window.__FIKA_SLIDES__.getState()
    const el = st.slides[st.slideIndex].elements.find(e => e.type === 'text' && e.textType === 'title')
    const root = document.getElementById(`editable-element-${el.id}`)
    const content = root.querySelector('[data-live-box]')
    const pm = root.querySelector('.ProseMirror')
    window.__clipLog = []
    let frames = 0
    const tick = () => {
      if (frames++ < 240) {
        const clipPx = pm.getBoundingClientRect().bottom - content.getBoundingClientRect().bottom
        window.__clipLog.push(Math.round(clipPx * 10) / 10)
        requestAnimationFrame(tick)
      }
    }
    requestAnimationFrame(tick)
    return true
  })
  if (clipWatch) {
    await page.evaluate(() => {
      const st = window.__FIKA_SLIDES__.getState()
      const el = st.slides[st.slideIndex].elements.find(e => e.type === 'text' && e.textType === 'title')
      const pm = document.getElementById(`editable-element-${el.id}`)?.querySelector('.ProseMirror')
      const view = pm?.__pmView
      if (view) view.focus()
    })
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await page.keyboard.type('další řádek za titulkem', { delay: 4 })
    await sleep(700)
    const clip = await page.evaluate(() => {
      const worst = window.__clipLog.reduce((a, b) => (b > (a ?? -1e9) ? b : a), null)
      return { worst, clippedFrames: window.__clipLog.filter(x => x > 0.5).length, total: window.__clipLog.length }
    })
    rec('no clipped frame while a line is added', clip.worst <= 0.5, clip)
    await page.keyboard.press('Escape')
    await focusElement('title', null, false)
    await sleep(250)
  }

  // ---------- Click into text activates nothing underneath ----------
  // Plain text box OVERLAPPING the body placeholder: after typing, a click
  // on the last line must keep the editor selected (no fall-through to the
  // element below through a stale hit occluder).
  const overlapId = await page.evaluate(() => {
    const st = window.__FIKA_SLIDES__.getState().getState?.() ?? window.__FIKA_SLIDES__.getState()
    const el = {
      type: 'text',
      id: 'slot-overlap-box',
      left: 85,
      top: 200,
      width: 400,
      height: 90,
      content: '',
      rotate: 0,
      defaultFontName: st.theme.fontName,
      defaultColor: '#111111',
    }
    st.addElement(el)
    const main = window.__FIKA_MAIN__.getState()
    main.setActiveElementIdList([el.id])
    main.setEditingElementId(el.id)
    main.setEditorareaFocus(true)
    return el.id
  })
  await sleep(300)
  await page.evaluate(() => {
    const pm = document.getElementById('editable-element-slot-overlap-box')?.querySelector('.ProseMirror')
    const view = pm?.__pmView
    if (view) {
      view.focus()
      view.dispatch(view.state.tr.insertText('první řádek'))
    }
  })
  await page.keyboard.press('Enter')
  await page.keyboard.type('druhá řádek', { delay: 4 })
  await sleep(400)
  const overlapState = await page.evaluate(() => {
    const st = window.__FIKA_SLIDES__.getState()
    const el = st.slides[st.slideIndex].elements.find(e => e.id === 'slot-overlap-box')
    const root = document.getElementById('editable-element-slot-overlap-box')
    const content = root?.querySelector('[data-live-box]')
    const pm = root?.querySelector('.ProseMirror')
    const scale = content.getBoundingClientRect().width / el.width
    return {
      storeH: el.height,
      paintH: content.getBoundingClientRect().height / scale,
      pmRect: pm.getBoundingClientRect().toJSON(),
    }
  })
  rec('overlap box: store equals painted height', Math.abs(overlapState.storeH - overlapState.paintH) <= 1.5, overlapState)
  // click at the very bottom of the last text line
  await page.mouse.click(
    overlapState.pmRect.x + overlapState.pmRect.width / 2,
    overlapState.pmRect.bottom - 3,
  )
  await sleep(300)
  const afterOverlapClick = await page.evaluate(() => {
    const m = window.__FIKA_MAIN__.getState()
    return { active: m.activeElementIdList, editing: m.editingElementId }
  })
  rec(
    'click on last line keeps the editor active (no fall-through)',
    afterOverlapClick.active.includes('slot-overlap-box') && afterOverlapClick.editing === 'slot-overlap-box',
    afterOverlapClick,
  )
}
finally {
  await browser.close()
  if (child) child.kill()
}

const failed = results.filter(r => !r.pass)
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}`)
  if (!r.pass && r.measured) console.log('   ', JSON.stringify(r.measured))
}
if (failed.length) { console.error(`\n${failed.length}/${results.length} failed`); process.exit(1) }
console.log(`\n${results.length}/${results.length} passed`)
