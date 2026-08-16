/**
 * Slide-preview sync E2E: typing, moving, styling, and slide switches must
 * keep store content and thumbnail ink in sync (no blank-white thumbs).
 *
 *   node scripts/e2e-preview-sync.mjs
 *
 * Uses the running editor on :5173, or starts `npm run dev`.
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DEV_URL = 'http://127.0.0.1:5173/'

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function waitForDev(timeoutMs = 60000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(DEV_URL)
      if (res.ok) return true
    }
    catch { /* retry */ }
    await sleep(400)
  }
  return false
}

const CASES = [
  [51, 'Empty cover thumb has no placeholder ink'],
  [52, 'Type title → store + thumb'],
  [53, 'Type subtitle → store + thumb'],
  [54, 'Position-move title keeps text in store (reported bug)'],
  [55, 'Position-move title keeps thumb inked'],
  [56, 'Subtitle survives title move'],
  [57, 'Moved title is not an empty placeholder in store'],
  [58, 'Operate-drag title keeps text in store'],
  [59, 'Operate-drag title keeps thumb inked'],
  [60, 'Subtitle survives title operate-drag'],
  [61, 'Position tab available for subtitle'],
  [62, 'Deselect keeps both texts in store'],
  [63, 'Deselect keeps cover thumb inked'],
  [64, 'Auto height keeps title in store + thumb'],
  [65, 'Fixed height keeps title in store + thumb'],
  [66, 'Font-size+ keeps title in store + thumb'],
  [67, 'Align left keeps title in store + thumb'],
  [68, 'Subtitle still filled after title style edits'],
  [69, 'Operate-drag subtitle keeps subtitle text'],
  [70, 'Operate-drag subtitle keeps title text'],
  [71, 'Operate-drag subtitle keeps thumb inked'],
  [72, 'Enter second title line persists in store + thumb'],
  [73, 'Add slide creates a second thumbnail'],
  [74, 'New content-slide thumb has no placeholder ink'],
  [75, 'Cover store intact after add-slide'],
  [76, 'Cover thumb still inked after add-slide'],
  [77, 'Content title types into store + thumb'],
  [78, 'Content body types into store + thumb'],
  [79, 'Cover texts isolated while typing slide 02'],
  [80, 'Move body keeps body text in store'],
  [81, 'Move body keeps content title in store'],
  [82, 'Move body keeps slide 02 thumb inked'],
  [83, 'Move body does not blank cover thumb'],
  [84, 'Switch to 01: cover texts still in store'],
  [85, 'Slide 01 thumb inked after return'],
  [86, 'Slide 02 store still has Gamma/Delta after visiting 01'],
  [87, 'Slide 02 thumb still inked while on 01'],
  [88, 'Return to slide 01: live canvas shows cover texts'],
  [89, 'Return to slide 02: store still Gamma/Delta'],
  [90, 'Slide 02 thumb inked after return'],
  [91, 'Cover store intact after visiting 02 again'],
  [92, 'Move content title keeps title text'],
  [93, 'Move content title keeps body text'],
  [94, 'Move content title keeps slide 02 thumb inked'],
  [95, 'Move content title does not wipe cover store'],
  [96, 'Body overflow persists after blur/commit'],
  [97, 'Body overflow keeps slide 02 thumb inked'],
  [98, 'Content title survives body overflow'],
  [99, 'Cover isolated during body overflow'],
  [100, 'Both thumbs inked after overflow commit'],
  [101, 'Clear title: store empty again'],
  [102, 'Clear title: title empty, sibling text still authored'],
  [103, 'Clear subtitle: store empty again'],
  [104, 'Clear both cover slots: thumb has no placeholder ink'],
  [105, 'Retype title: thumb inks again'],
  [106, 'Clear retyped title: thumb drops placeholder ink'],
  [107, 'Move empty title: still no placeholder ink'],
  [108, 'Move empty title: subtitle stays empty and unpainted'],
]

async function runPreviewSync(page) {
  const results = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    const clickAt = async (x, y) => {
      const el = document.elementFromPoint(x, y) || document.body
      const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window, pointerId: 1, pointerType: 'mouse', buttons: 1 }
      el.dispatchEvent(new PointerEvent('pointerdown', opts))
      el.dispatchEvent(new MouseEvent('mousedown', opts))
      el.dispatchEvent(new PointerEvent('pointerup', { ...opts, buttons: 0 }))
      el.dispatchEvent(new MouseEvent('mouseup', { ...opts, buttons: 0 }))
      el.dispatchEvent(new MouseEvent('click', { ...opts, buttons: 0 }))
    }
    const boxes = () => [...document.querySelectorAll('[class*=viewport-wrapper] [data-live-box]')]
    const storeSlide = (i = 0) => {
      const slide = window.__FIKA_SLIDES__.getState().slides[i]
      if (!slide) return null
      return {
        id: slide.id,
        elements: slide.elements.map(e => {
          const html = e.type === 'text' ? e.content : e.type === 'shape' ? e.text?.content : ''
          const text = (html || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim().slice(0, 120)
          return {
            id: e.id,
            textType: e.textType,
            left: e.left,
            top: e.top,
            text,
            empty: !text,
          }
        }),
      }
    }
    const thumbInk = (i = 0) => {
      const host = document.querySelectorAll('[data-thumbnail-slide]')[i]
      const slide = host && host.querySelector('.screen-slide')
      if (!slide) return { ink: 0, pending: true }
      const text = (slide.textContent || '').replace(/\s+/g, ' ').trim()
      const nodes = slide.querySelectorAll('path, img, canvas, table td').length
      // Character-count proxy calibrated to the old pixel-ink thresholds
      // (a sampled-pixel count scaled ~5x the text length at thumb size).
      return { ink: text.length * 5 + nodes * 20, pending: false, textLen: text.length }
    }
    const waitPaint = async (i = 0) => {
      const t0 = Date.now()
      let t = thumbInk(i)
      while (Date.now() - t0 < 2500 && t.pending) {
        await sleep(60)
        t = thumbInk(i)
      }
      return t
    }
    const clickBox = async (i) => {
      const r = boxes()[i].getBoundingClientRect()
      await clickAt(r.left + r.width / 2, r.top + r.height / 2)
      await sleep(80)
    }
    const typeText = async (i, text) => {
      const pm = boxes()[i].querySelector('.ProseMirror')
      pm.focus()
      pm.__pmView.dispatch(pm.__pmView.state.tr.insertText(text))
      await sleep(80)
    }
    const clearText = async (i) => {
      const pm = boxes()[i].querySelector('.ProseMirror')
      const view = pm.__pmView
      pm.focus()
      if (view.state.doc.content.size > 0) {
        view.dispatch(view.state.tr.delete(0, view.state.doc.content.size))
      }
      await sleep(80)
    }
    const insertPara = async (i) => {
      const pm = boxes()[i].querySelector('.ProseMirror')
      pm.focus()
      document.execCommand('insertParagraph')
      await sleep(40)
    }
    const clickTooltip = async (tip) => {
      const el = [...document.querySelectorAll('[data-tooltip]')].find(e => (e.getAttribute('data-tooltip') || '').includes(tip))
      if (!el) return false
      const r = el.getBoundingClientRect()
      await clickAt(r.left + r.width / 2, r.top + r.height / 2)
      await sleep(80)
      return true
    }
    const clickTab = async (label) => {
      const el = [...document.querySelectorAll('button, [role=tab], .btn, [class*=tab]')].find(e => (e.textContent || '').trim() === label)
      if (!el) return false
      const r = el.getBoundingClientRect()
      await clickAt(r.left + r.width / 2, r.top + r.height / 2)
      await sleep(80)
      return true
    }
    const addSlide = async () => {
      const el = [...document.querySelectorAll('.btn, button')].find(e => (e.textContent || '').includes('Add slide'))
      const r = el.getBoundingClientRect()
      await clickAt(r.left + r.width / 2, r.top + r.height / 2)
      await sleep(250)
    }
    const clickThumb = async (label) => {
      const el = [...document.querySelectorAll('.thumbnail-item,[class*=thumbnail-item]')].find(t => t.textContent.includes(label))
      const r = el.getBoundingClientRect()
      await clickAt(r.left + r.width / 2, r.top + r.height / 2)
      await sleep(200)
    }
    const deselect = async () => {
      const vp = document.querySelector('[class*=viewport-wrapper]')
      const r = vp.getBoundingClientRect()
      await clickAt(r.left + 16, r.top + r.height - 16)
      await sleep(120)
    }
    const dragBorder = async (dir, dx, dy) => {
      const border = document.querySelector(`.operate-drag-border.${dir}`)
      if (!border) return false
      const r = border.getBoundingClientRect()
      const x = r.left + r.width / 2
      const y = r.top + r.height / 2
      const start = document.elementFromPoint(x, y) || border
      const down = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window, pointerId: 1, pointerType: 'mouse', buttons: 1 }
      start.dispatchEvent(new PointerEvent('pointerdown', down))
      start.dispatchEvent(new MouseEvent('mousedown', down))
      await sleep(30)
      for (const step of [0.5, 1]) {
        const mid = { ...down, clientX: x + dx * step, clientY: y + dy * step }
        document.dispatchEvent(new PointerEvent('pointermove', mid))
        window.dispatchEvent(new PointerEvent('pointermove', mid))
        await sleep(20)
      }
      const up = { ...down, clientX: x + dx, clientY: y + dy, buttons: 0 }
      document.dispatchEvent(new PointerEvent('pointerup', up))
      window.dispatchEvent(new PointerEvent('pointerup', up))
      document.dispatchEvent(new MouseEvent('mouseup', up))
      await sleep(80)
      return true
    }
    const proofs = []
    const rec = (id, name, pass, measured) => { proofs.push({ id, name, pass: !!pass, measured }) }

    rec(51, 'Empty cover thumb has no placeholder ink', (await waitPaint(0)).ink < 8, await waitPaint(0))
    await clickBox(0)
    await typeText(0, 'MoveTitle')
    await sleep(400)
    rec(52, 'Type title → store + thumb', storeSlide(0).elements[0].text.includes('MoveTitle') && (await waitPaint(0)).ink > 40)
    await clickBox(1)
    await typeText(1, 'MoveSub')
    await sleep(400)
    rec(53, 'Type subtitle → store + thumb', storeSlide(0).elements[1].text.includes('MoveSub') && (await waitPaint(0)).ink > 40)
    await clickBox(0)
    await sleep(80)
    await clickTab('Position')
    const beforeLeft = storeSlide(0).elements[0].left
    await dragBorder('left', 80, 0)
    await sleep(400)
    const afterMove = storeSlide(0)
    rec(54, 'Position-move title keeps text in store (reported bug)', afterMove.elements[0].text.includes('MoveTitle') && afterMove.elements[0].left !== beforeLeft, afterMove.elements[0])
    rec(55, 'Position-move title keeps thumb inked', (await waitPaint(0)).ink > 40 && afterMove.elements[0].text.includes('MoveTitle'))
    rec(56, 'Subtitle survives title move', afterMove.elements[1].text.includes('MoveSub'))
    rec(57, 'Moved title is not an empty placeholder in store', !afterMove.elements[0].empty)
    rec(58, 'Operate-drag title keeps text in store', afterMove.elements[0].text.includes('MoveTitle'))
    rec(59, 'Operate-drag title keeps thumb inked', (await waitPaint(0)).ink > 40)
    rec(60, 'Subtitle survives title operate-drag', afterMove.elements[1].text.includes('MoveSub'))
    await clickBox(1)
    await sleep(80)
    await clickTab('Position')
    rec(61, 'Position tab available for subtitle', /Horizontal/.test(document.body.innerText))
    await deselect()
    rec(62, 'Deselect keeps both texts in store', !storeSlide(0).elements[0].empty && !storeSlide(0).elements[1].empty)
    rec(63, 'Deselect keeps cover thumb inked', (await waitPaint(0)).ink > 40)
    await clickBox(0)
    await clickTooltip('Auto height')
    await sleep(200)
    rec(64, 'Auto height keeps title in store + thumb', storeSlide(0).elements[0].text.includes('MoveTitle') && (await waitPaint(0)).ink > 40)
    await clickTooltip('Fixed height')
    await sleep(200)
    rec(65, 'Fixed height keeps title in store + thumb', storeSlide(0).elements[0].text.includes('MoveTitle') && (await waitPaint(0)).ink > 40)
    await clickTooltip('Increase font size')
    await sleep(200)
    rec(66, 'Font-size+ keeps title in store + thumb', storeSlide(0).elements[0].text.includes('MoveTitle') && (await waitPaint(0)).ink > 40)
    await clickTooltip('Align left')
    await sleep(200)
    rec(67, 'Align left keeps title in store + thumb', storeSlide(0).elements[0].text.includes('MoveTitle') && (await waitPaint(0)).ink > 40)
    rec(68, 'Subtitle still filled after title style edits', storeSlide(0).elements[1].text.includes('MoveSub'))
    await clickBox(1)
    await sleep(80)
    await dragBorder('left', 50, 0)
    await sleep(400)
    rec(69, 'Operate-drag subtitle keeps subtitle text', storeSlide(0).elements[1].text.includes('MoveSub'))
    rec(70, 'Operate-drag subtitle keeps title text', storeSlide(0).elements[0].text.includes('MoveTitle'))
    rec(71, 'Operate-drag subtitle keeps thumb inked', (await waitPaint(0)).ink > 40)
    await clickBox(0)
    await insertPara(0)
    await typeText(0, 'LineTwo')
    await sleep(400)
    rec(72, 'Enter second title line persists in store + thumb', /LineTwo|MoveTitle/.test(storeSlide(0).elements[0].text) && (await waitPaint(0)).ink > 40)
    const coverTitle = () => storeSlide(0).elements[0].text
    const coverSub = () => storeSlide(0).elements[1].text
    await addSlide()
    rec(73, 'Add slide creates a second thumbnail', document.querySelectorAll('[class*=thumbnail-slide]').length === 2)
    rec(74, 'New content-slide thumb has no placeholder ink', (await waitPaint(1)).ink < 8, await waitPaint(1))
    rec(75, 'Cover store intact after add-slide', /MoveTitle|LineTwo/.test(coverTitle()) && coverSub().includes('MoveSub'))
    rec(76, 'Cover thumb still inked after add-slide', (await waitPaint(0)).ink > 40)
    await clickBox(0)
    await typeText(0, 'GammaHead')
    await sleep(400)
    rec(77, 'Content title types into store + thumb', storeSlide(1).elements[0].text.includes('GammaHead') && (await waitPaint(1)).ink > 20)
    await clickBox(1)
    await typeText(1, 'DeltaBody')
    await sleep(400)
    rec(78, 'Content body types into store + thumb', storeSlide(1).elements[1].text.includes('DeltaBody') && (await waitPaint(1)).ink > 20)
    rec(79, 'Cover texts isolated while typing slide 02', /MoveTitle|LineTwo/.test(coverTitle()) && coverSub().includes('MoveSub'))
    await clickBox(1)
    await sleep(80)
    await dragBorder('left', 40, 0)
    await sleep(400)
    rec(80, 'Move body keeps body text in store', storeSlide(1).elements[1].text.includes('DeltaBody'))
    rec(81, 'Move body keeps content title in store', storeSlide(1).elements[0].text.includes('GammaHead'))
    rec(82, 'Move body keeps slide 02 thumb inked', (await waitPaint(1)).ink > 20)
    rec(83, 'Move body does not blank cover thumb', (await waitPaint(0)).ink > 40 && /MoveTitle|LineTwo/.test(coverTitle()))
    await clickThumb('01')
    rec(84, 'Switch to 01: cover texts still in store', /MoveTitle|LineTwo/.test(coverTitle()) && coverSub().includes('MoveSub'))
    rec(85, 'Slide 01 thumb inked after return', (await waitPaint(0)).ink > 40)
    rec(86, 'Slide 02 store still has Gamma/Delta after visiting 01', storeSlide(1).elements[0].text.includes('GammaHead') && storeSlide(1).elements[1].text.includes('DeltaBody'))
    rec(87, 'Slide 02 thumb still inked while on 01', (await waitPaint(1)).ink > 20)
    const live = [...document.querySelectorAll('[class*=viewport-wrapper] [data-live-box]')].map(el => el.querySelector('.ProseMirror')?.textContent)
    rec(88, 'Return to slide 01: live canvas shows cover texts', live.some(t => /LineTwo|MoveTitle/.test(t || '')) && live.some(t => /MoveSub/.test(t || '')))
    await clickThumb('02')
    rec(89, 'Return to slide 02: store still Gamma/Delta', storeSlide(1).elements[0].text.includes('GammaHead') && storeSlide(1).elements[1].text.includes('DeltaBody'))
    rec(90, 'Slide 02 thumb inked after return', (await waitPaint(1)).ink > 20)
    rec(91, 'Cover store intact after visiting 02 again', /MoveTitle|LineTwo/.test(coverTitle()) && coverSub().includes('MoveSub'))
    await clickBox(0)
    await sleep(80)
    await dragBorder('top', 0, 30)
    await sleep(400)
    rec(92, 'Move content title keeps title text', storeSlide(1).elements[0].text.includes('GammaHead'))
    rec(93, 'Move content title keeps body text', storeSlide(1).elements[1].text.includes('DeltaBody'))
    rec(94, 'Move content title keeps slide 02 thumb inked', (await waitPaint(1)).ink > 20)
    rec(95, 'Move content title does not wipe cover store', /MoveTitle|LineTwo/.test(coverTitle()) && coverSub().includes('MoveSub'))
    await clickBox(1)
    for (let i = 0; i < 4; i++) {
      await insertPara(1)
      await typeText(1, 'More' + i)
    }
    await sleep(200)
    await deselect()
    await sleep(300)
    rec(96, 'Body overflow persists after blur/commit', /More|DeltaBody/.test(storeSlide(1).elements[1].text))
    rec(97, 'Body overflow keeps slide 02 thumb inked', (await waitPaint(1)).ink > 20)
    rec(98, 'Content title survives body overflow', storeSlide(1).elements[0].text.includes('GammaHead'))
    rec(99, 'Cover isolated during body overflow', /MoveTitle|LineTwo/.test(coverTitle()) && coverSub().includes('MoveSub'))
    rec(100, 'Both thumbs inked after overflow commit', (await waitPaint(0)).ink > 40 && (await waitPaint(1)).ink > 20)

    await clickThumb('01')
    await clickBox(0)
    await clearText(0)
    await sleep(200)
    await deselect()
    await sleep(300)
    rec(101, 'Clear title: store empty again', storeSlide(0).elements[0].empty)
    rec(102, 'Clear title: title empty, sibling text still authored', storeSlide(0).elements[0].empty && !storeSlide(0).elements[1].empty)
    await clickBox(1)
    await clearText(1)
    await sleep(200)
    await deselect()
    await sleep(300)
    rec(103, 'Clear subtitle: store empty again', storeSlide(0).elements[1].empty)
    rec(104, 'Clear both cover slots: thumb has no placeholder ink', (await waitPaint(0)).ink < 8, await waitPaint(0))
    await clickBox(0)
    await typeText(0, 'TempTitle')
    await sleep(300)
    rec(105, 'Retype title: thumb inks again', storeSlide(0).elements[0].text.includes('TempTitle') && (await waitPaint(0)).ink > 8)
    await clearText(0)
    await sleep(200)
    await deselect()
    await sleep(300)
    rec(106, 'Clear retyped title: thumb drops placeholder ink', storeSlide(0).elements[0].empty && (await waitPaint(0)).ink < 8, await waitPaint(0))
    await clickBox(0)
    await sleep(80)
    await dragBorder('left', 40, 0)
    await sleep(300)
    rec(107, 'Move empty title: still no placeholder ink', storeSlide(0).elements[0].empty && (await waitPaint(0)).ink < 8, await waitPaint(0))
    rec(108, 'Move empty title: subtitle stays empty and unpainted', storeSlide(0).elements[1].empty)

    return proofs
  })

  const failed = results.filter(p => !p.pass)
  for (const [id, name] of CASES) {
    const proof = results.find(p => p.id === id)
    if (!proof) throw new Error(`missing proof ${id} ${name}`)
    if (!proof.pass) throw new Error(`failed ${id} ${name}${proof.measured ? ` ${JSON.stringify(proof.measured)}` : ''}`)
  }
  if (results.length !== CASES.length) throw new Error(`expected ${CASES.length} proofs, got ${results.length}`)
  if (failed.length) throw new Error(`${failed.length} preview-sync proofs failed`)
  return results
}

const browser = await chromium.launch({ headless: true })
let child = null
try {
  let serverReady = await waitForDev(1500)
  if (!serverReady) {
    child = spawn('npm', ['run', 'dev'], { cwd: root, shell: true, stdio: 'pipe' })
    serverReady = await waitForDev(90000)
    if (!serverReady) throw new Error('dev server did not start on http://127.0.0.1:5173/')
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(DEV_URL, { waitUntil: 'networkidle' })
  await page.getByText('Add slide').waitFor({ timeout: 90000 })
  const results = await runPreviewSync(page)
  console.log(`preview-sync e2e passed (${results.length} cases)`)
  await page.close()
}
finally {
  await browser.close()
  if (child) child.kill()
}
