/**
 * Real-browser insert/delete on a 120-slide deck.
 *
 * Reproduces the large-deck clone+identity thrash, measures store / React /
 * raster time, then asserts the identity-preserving path stays cheap.
 *
 *   node scripts/e2e-slide-mutate.mjs
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const DEV_PORTS = [5173, 5174, 5175, 5176]
const DECK_SIZE = 120
const STORE_MS_BUDGET = 20
const UI_MS_BUDGET = 400
const ADD_PAINT_BUDGET = 8
const DELETE_PAINT_BUDGET = 4
const AGENTIC_MS_BUDGET = 80
const AGENTIC_BATCH_MS_BUDGET = 400
const RASTER_IDLE_MS = 2500

const CASES = [
  [1, `Seed a ${DECK_SIZE}-slide deck`],
  [2, 'Seeded rail virtualizes instead of mounting every thumb'],
  [3, 'Store addSlide keeps every existing slide object identity'],
  [4, `Store addSlide on ${DECK_SIZE} slides finishes within ${STORE_MS_BUDGET}ms`],
  [5, 'Store addSlide only paints the new current slide'],
  [6, 'Store deleteSlide keeps every remaining slide object identity'],
  [7, `Store deleteSlide on ${DECK_SIZE} slides finishes within ${STORE_MS_BUDGET}ms`],
  [8, 'Store deleteSlide does not full-repaint surviving visible thumbs'],
  [9, 'Deleting a sectioned slide hands the tag to the next slide only'],
  [10, 'clonePlain+setSlides insert is not what the store add/delete path does'],
  [11, 'UI Add slide on a large deck keeps other slide identities'],
  [12, `UI Add slide on a large deck finishes within ${UI_MS_BUDGET}ms`],
  [13, 'UI Delete rewrites at most the section-handoff neighbor'],
  [14, `UI Delete slide on a large deck finishes within ${UI_MS_BUDGET}ms`],
  [15, 'Rail count matches the store after the UI insert/delete pair'],
  [16, 'Visible thumbs still have raster canvases after mutate'],
  [17, 'Inserting in the middle shifts later ids without rewriting them'],
  [18, 'Deleting two slides at once keeps the other 118 identities'],
  [19, 'History snapshot after delete does not clone the whole deck into patches'],
  [20, 'Selecting a far slide after mutate still paints that thumb'],
  [21, 'Agentic bridge hook is available'],
  [22, `Agentic slides.create on a large deck finishes within ${AGENTIC_MS_BUDGET}ms`],
  [23, 'Agentic slides.create keeps every existing slide identity'],
  [24, `Agentic slides.update patch finishes within ${AGENTIC_MS_BUDGET}ms`],
  [25, 'Agentic slides.update keeps every other slide identity'],
  [26, `Agentic elements.update patch finishes within ${AGENTIC_MS_BUDGET}ms`],
  [27, `Agentic slides.delete finishes within ${AGENTIC_MS_BUDGET}ms and keeps remaining identities`],
  [28, `Agentic executeBatch stream of 8 create/update/delete finishes within ${AGENTIC_BATCH_MS_BUDGET}ms`],
]

const results = []
function rec(id, pass, measured) {
  results.push({ id, name: CASES[id - 1][1], pass: !!pass, measured: measured ?? null })
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
  const override = process.env.FIKA_DEV_URL
  if (override) return override.endsWith('/') ? override : `${override}/`
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

async function waitForHooks(page) {
  const start = Date.now()
  while (Date.now() - start < 20000) {
    if (await page.evaluate(() => !!(window.__FIKA_SLIDES__ && window.__FIKA_RASTER__ && window.__FIKA_AGENTIC__))) return
    await sleep(250)
  }
  throw new Error('fika store / raster / agentic hooks did not appear')
}

async function raster(page) {
  return page.evaluate(() => window.__FIKA_RASTER__.read())
}

async function resetRaster(page) {
  await page.evaluate(() => window.__FIKA_RASTER__.reset())
}

async function waitIdle(page, requirePaint = false) {
  const start = Date.now()
  let last = -1
  let stable = 0
  while (Date.now() - start < RASTER_IDLE_MS) {
    const stats = await raster(page)
    const token = stats.fullPaints + stats.patchPaints + stats.elementInvalidations
    if (token === last) {
      stable += 1
      if (stable >= 3 && (!requirePaint || stats.fullPaints + stats.patchPaints > 0)) return stats
    }
    else {
      stable = 0
      last = token
    }
    await sleep(50)
  }
  return raster(page)
}

function fatSlide(index) {
  const body = Array.from({ length: 8 }, (_, line) => (
    `<p style="font-size: 18px">Slide ${index + 1} line ${line + 1} ${'content '.repeat(12)}</p>`
  )).join('')
  return {
    id: `fat-${index}`,
    elements: [
      {
        id: `fat-title-${index}`,
        type: 'text',
        left: 48,
        top: 36,
        width: 880,
        height: 72,
        rotate: 0,
        content: `<p style="font-size: 32px"><strong>Large deck slide ${index + 1}</strong></p>`,
        defaultFontName: 'Arial',
        defaultColor: '#18181b',
      },
      {
        id: `fat-body-${index}`,
        type: 'text',
        left: 48,
        top: 120,
        width: 880,
        height: 360,
        rotate: 0,
        content: body,
        defaultFontName: 'Arial',
        defaultColor: '#18181b',
      },
    ],
    background: { type: 'solid', color: '#ffffff' },
    ...(index === 0 ? { sectionTag: { id: 'sec-intro', title: 'Intro' } } : {}),
  }
}

async function seedDeck(page, count) {
  const slides = Array.from({ length: count }, (_, index) => fatSlide(index))
  return page.evaluate((next) => {
    const t0 = performance.now()
    window.__FIKA_SLIDES__.getState().setSlides(next, undefined, { clone: false })
    window.__FIKA_SLIDES__.getState().updateSlideIndex(0)
    return {
      count: window.__FIKA_SLIDES__.getState().slides.length,
      seedMs: Math.round(performance.now() - t0),
    }
  }, slides)
}

async function measureStoreOp(page, op) {
  return page.evaluate((kind) => {
    const store = window.__FIKA_SLIDES__.getState()
    const before = store.slides
    const beforeIds = before.map(slide => slide.id)
    const beforeRefs = new Map(before.map(slide => [slide.id, slide]))
    const rasterBefore = window.__FIKA_RASTER__.read()
    const incoming = {
      id: `probe-${kind}-${Date.now()}`,
      elements: [{
        id: `probe-el-${kind}`,
        type: 'text',
        left: 40,
        top: 40,
        width: 400,
        height: 64,
        rotate: 0,
        content: `<p style="font-size: 22px">${kind}</p>`,
        defaultFontName: 'Arial',
        defaultColor: '#18181b',
      }],
      background: { type: 'solid', color: '#f8fafc' },
    }

    const t0 = performance.now()
    if (kind === 'add') {
      store.addSlide(incoming)
    }
    else if (kind === 'delete') {
      const target = before[Math.min(80, before.length - 1)]
      store.deleteSlide(target.id)
    }
    else if (kind === 'clone-set') {
      const next = JSON.parse(JSON.stringify(before))
      next.splice(Math.min(80, next.length), 0, incoming)
      store.setSlides(next)
    }
    const storeMs = performance.now() - t0

    const after = window.__FIKA_SLIDES__.getState().slides
    const kept = after.filter(slide => beforeRefs.get(slide.id) === slide).length
    const rewritten = after.filter(slide => beforeRefs.has(slide.id) && beforeRefs.get(slide.id) !== slide).length
    const dropped = beforeIds.filter(id => !after.some(slide => slide.id === id)).length

    return {
      storeMs: Math.round(storeMs * 10) / 10,
      before: before.length,
      after: after.length,
      kept,
      rewritten,
      dropped,
      paintsBefore: rasterBefore.fullPaints + rasterBefore.patchPaints,
    }
  }, op)
}

async function waitRafPair(page) {
  return page.evaluate(() => new Promise(resolve => {
    const t0 = performance.now()
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve(Math.round(performance.now() - t0)))
    })
  }))
}

async function thumbState(page) {
  return page.evaluate(() => {
    const hosts = [...document.querySelectorAll('[data-thumbnail-slide]')]
    return {
      mounted: hosts.length,
      pending: hosts.filter(host => host.hasAttribute('data-raster-pending')).length,
      canvases: hosts.filter(host => host.querySelector('[data-preview-raster], canvas')).length,
    }
  })
}

async function clickThumb(page, index) {
  const thumb = page.locator('[data-thumbnail-slide]').nth(index)
  await thumb.waitFor({ state: 'visible' })
  const box = await thumb.boundingBox()
  if (!box) throw new Error(`no box for thumb ${index}`)
  await page.mouse.click(box.x + box.width / 2, box.y + 16)
}

async function run(page) {
  await page.getByText('Add slide').waitFor({ timeout: 90000 })
  await stripScan(page)
  await waitForHooks(page)

  const seeded = await seedDeck(page, DECK_SIZE)
  await waitIdle(page, true)
  const thumbs = await thumbState(page)
  rec(1, seeded.count === DECK_SIZE, { ...seeded, thumbs })
  rec(2, thumbs.mounted > 0 && thumbs.mounted < DECK_SIZE, thumbs)

  await resetRaster(page)
  const add = await measureStoreOp(page, 'add')
  const addRaf = await waitRafPair(page)
  const addIdle = await waitIdle(page, false)
  const addPaints = addIdle.fullPaints + addIdle.patchPaints
  rec(3, add.rewritten === 0 && add.kept === add.before, add)
  rec(4, add.storeMs < STORE_MS_BUDGET, { ...add, rafMs: addRaf })
  rec(5, addPaints <= ADD_PAINT_BUDGET, { paints: addPaints, full: addIdle.fullPaints, patch: addIdle.patchPaints })

  await resetRaster(page)
  const del = await measureStoreOp(page, 'delete')
  const delRaf = await waitRafPair(page)
  const delIdle = await waitIdle(page, false)
  const delPaints = delIdle.fullPaints + delIdle.patchPaints
  rec(6, del.rewritten === 0 && del.kept === del.after, del)
  rec(7, del.storeMs < STORE_MS_BUDGET, { ...del, rafMs: delRaf })
  rec(8, delPaints <= DELETE_PAINT_BUDGET, { paints: delPaints, full: delIdle.fullPaints, patch: delIdle.patchPaints })

  const section = await page.evaluate(() => {
    const store = window.__FIKA_SLIDES__.getState()
    const slides = store.slides
    const headed = {
      id: 'section-head',
      elements: [],
      background: { type: 'solid', color: '#fff' },
      sectionTag: { id: 'sec-mid', title: 'Mid' },
    }
    const body = { id: 'section-body', elements: [], background: { type: 'solid', color: '#fff' } }
    const tail = slides[slides.length - 1]
    store.addSlide([headed, body])
    store.updateSlide({ sectionTag: { id: 'sec-mid', title: 'Mid' } }, 'section-head')
    const beforeBody = store.slides.find(slide => slide.id === 'section-body')
    const beforeTail = store.slides.find(slide => slide.id === tail.id)
    store.deleteSlide('section-head')
    const after = window.__FIKA_SLIDES__.getState().slides
    const next = after.find(slide => slide.id === 'section-body')
    const sameTail = after.find(slide => slide.id === tail.id)
    return {
      tagMoved: next?.sectionTag?.id === 'sec-mid',
      bodySame: next === beforeBody || next?.sectionTag?.id === 'sec-mid',
      tailSame: sameTail === beforeTail,
      headGone: !after.some(slide => slide.id === 'section-head'),
    }
  })
  rec(9, section.tagMoved && section.tailSame && section.headGone, section)

  const cloneSet = await measureStoreOp(page, 'clone-set')
  rec(10, add.rewritten === 0 && del.rewritten === 0 && cloneSet.rewritten > 0, {
    addRewritten: add.rewritten,
    deleteRewritten: del.rewritten,
    cloneSetRewritten: cloneSet.rewritten,
    cloneSetMs: cloneSet.storeMs,
  })

  const uiAdd = await page.evaluate(() => {
    const before = window.__FIKA_SLIDES__.getState().slides
    window.__FIKA_MUTATE_REFS = new Map(before.map(slide => [slide.id, slide]))
    return { before: before.length }
  })
  const addBtn = page.getByText('Add slide', { exact: true })
  const uiAddT0 = Date.now()
  await addBtn.click()
  await page.waitForFunction(prev => window.__FIKA_SLIDES__.getState().slides.length === prev + 1, uiAdd.before, { timeout: 5000 })
  const uiAddMs = Date.now() - uiAddT0
  const uiAddAfter = await page.evaluate(() => {
    const after = window.__FIKA_SLIDES__.getState().slides
    return { after: after.length }
  })
  const uiAddIdentity = await page.evaluate(() => {
    const after = window.__FIKA_SLIDES__.getState().slides
    const marked = window.__FIKA_MUTATE_REFS
    let kept = 0
    let rewritten = 0
    for (const slide of after) {
      if (!marked.has(slide.id)) continue
      if (marked.get(slide.id) === slide) kept += 1
      else rewritten += 1
    }
    return { kept, rewritten, after: after.length, prev: marked.size }
  })
  rec(11, uiAddIdentity.rewritten === 0 && uiAddAfter.after === uiAdd.before + 1, { ...uiAddIdentity, ms: uiAddMs })
  rec(12, uiAddMs < UI_MS_BUDGET, { ms: uiAddMs })

  await clickThumb(page, 2)
  await waitIdle(page, false)
  await page.evaluate(() => {
    const slides = window.__FIKA_SLIDES__.getState().slides
    window.__FIKA_MUTATE_REFS = new Map(slides.map(slide => [slide.id, slide]))
  })
  const beforeDeleteCount = await page.evaluate(() => {
    window.__FIKA_MAIN__.getState().setThumbnailsFocus(true)
    return window.__FIKA_SLIDES__.getState().slides.length
  })
  const uiDelT0 = Date.now()
  await page.keyboard.press('Delete')
  await page.waitForFunction(prev => window.__FIKA_SLIDES__.getState().slides.length === prev - 1, beforeDeleteCount, { timeout: 5000 })
  const uiDelMs = Date.now() - uiDelT0
  const uiDelIdentity = await page.evaluate(() => {
    const after = window.__FIKA_SLIDES__.getState().slides
    const marked = window.__FIKA_MUTATE_REFS
    let kept = 0
    let rewritten = 0
    for (const slide of after) {
      if (!marked.has(slide.id)) continue
      if (marked.get(slide.id) === slide) kept += 1
      else rewritten += 1
    }
    return { kept, rewritten, after: after.length }
  })
  rec(13, uiDelIdentity.rewritten <= 1 && uiDelIdentity.kept + uiDelIdentity.rewritten === uiDelIdentity.after, { ...uiDelIdentity, ms: uiDelMs })
  rec(14, uiDelMs < UI_MS_BUDGET, { ms: uiDelMs })

  const rail = await page.evaluate(() => ({
    store: window.__FIKA_SLIDES__.getState().slides.length,
    thumbs: document.querySelectorAll('[data-sortable-id]').length,
  }))
  rec(15, rail.store === uiDelIdentity.after && rail.thumbs > 0 && rail.thumbs < rail.store, rail)

  const afterThumbs = await thumbState(page)
  rec(16, afterThumbs.canvases >= Math.min(3, afterThumbs.mounted) && afterThumbs.pending === 0, afterThumbs)

  const middle = await page.evaluate(() => {
    const store = window.__FIKA_SLIDES__.getState()
    const before = store.slides
    const refs = new Map(before.map(slide => [slide.id, slide]))
    const mid = Math.min(40, before.length)
    const idAt = before[mid].id
    const laterId = before[mid + 5].id
    store.updateSlideIndex(mid)
    store.addSlide({
      id: 'mid-insert',
      elements: [],
      background: { type: 'solid', color: '#fff' },
    })
    const after = window.__FIKA_SLIDES__.getState().slides
    return {
      insertedAt: after.findIndex(slide => slide.id === 'mid-insert'),
      laterSame: after.find(slide => slide.id === laterId) === refs.get(laterId),
      originSame: after.find(slide => slide.id === idAt) === refs.get(idAt),
      laterIndex: after.findIndex(slide => slide.id === laterId),
    }
  })
  rec(17, middle.laterSame && middle.originSame && middle.laterIndex === middle.insertedAt + 5, middle)

  const multi = await page.evaluate(() => {
    const store = window.__FIKA_SLIDES__.getState()
    const before = store.slides
    const refs = new Map(before.map(slide => [slide.id, slide]))
    const a = before[70].id
    const b = before[71].id
    store.deleteSlide([a, b])
    const after = window.__FIKA_SLIDES__.getState().slides
    let kept = 0
    let rewritten = 0
    for (const slide of after) {
      if (!refs.has(slide.id)) continue
      if (refs.get(slide.id) === slide) kept += 1
      else rewritten += 1
    }
    return { kept, rewritten, after: after.length, before: before.length }
  })
  rec(18, multi.rewritten === 0 && multi.after === multi.before - 2 && multi.kept === multi.after, multi)

  const snap = await page.evaluate(async () => {
    const snapStore = window.__FIKA_SNAPSHOT__
    if (!snapStore) return { skipped: true }
    const t0 = performance.now()
    await snapStore.getState().addSnapshot()
    return { ms: Math.round(performance.now() - t0), skipped: false }
  })
  rec(19, snap.skipped || snap.ms < 80, snap)

  await resetRaster(page)
  const farCount = await page.locator('[data-sortable-id]').count()
  if (farCount > 4) {
    await page.locator('[data-sortable-id]').nth(farCount - 1).click()
  }
  else {
    await page.evaluate(() => {
      const store = window.__FIKA_SLIDES__.getState()
      store.updateSlideIndex(store.slides.length - 1)
    })
  }
  const farIdle = await waitIdle(page, false)
  const farThumb = await thumbState(page)
  rec(20, farThumb.canvases > 0 && farIdle.fullPaints + farIdle.patchPaints < 12, {
    thumbs: farThumb,
    paints: farIdle.fullPaints + farIdle.patchPaints,
  })

  const agenticReady = await page.evaluate(() => !!(window.__FIKA_AGENTIC__?.execute && window.__FIKA_AGENTIC__?.executeBatch))
  rec(21, agenticReady)

  const agenticCreate = await page.evaluate(async () => {
    const before = window.__FIKA_SLIDES__.getState().slides
    const refs = new Map(before.map(slide => [slide.id, slide]))
    const t0 = performance.now()
    const result = await window.__FIKA_AGENTIC__.execute('slides.create', {
      select: false,
      slide: {
        elements: [{
          type: 'text',
          left: 40,
          top: 40,
          width: 400,
          height: 64,
          rotate: 0,
          content: '<p style="font-size: 22px">Agentic stream</p>',
          defaultFontName: 'Arial',
          defaultColor: '#18181b',
        }],
      },
    })
    const after = window.__FIKA_SLIDES__.getState().slides
    let kept = 0
    let rewritten = 0
    for (const slide of after) {
      if (!refs.has(slide.id)) continue
      if (refs.get(slide.id) === slide) kept += 1
      else rewritten += 1
    }
    return {
      ok: !!result?.ok,
      ms: Math.round((performance.now() - t0) * 10) / 10,
      kept,
      rewritten,
      before: before.length,
      after: after.length,
      slideId: result?.data?.id,
      elementId: result?.data?.elements?.[0]?.id,
    }
  })
  rec(22, agenticCreate.ok && agenticCreate.ms < AGENTIC_MS_BUDGET, agenticCreate)
  rec(23, agenticCreate.rewritten === 0 && agenticCreate.kept === agenticCreate.before, agenticCreate)

  const agenticUpdate = await page.evaluate(async (slideId) => {
    const before = window.__FIKA_SLIDES__.getState().slides
    const refs = new Map(before.map(slide => [slide.id, slide]))
    const t0 = performance.now()
    const result = await window.__FIKA_AGENTIC__.execute('slides.update', {
      slideId,
      patch: { remark: 'stream-patch' },
    })
    const after = window.__FIKA_SLIDES__.getState().slides
    let kept = 0
    let rewritten = 0
    for (const slide of after) {
      if (slide.id === slideId) continue
      if (!refs.has(slide.id)) continue
      if (refs.get(slide.id) === slide) kept += 1
      else rewritten += 1
    }
    const patched = after.find(slide => slide.id === slideId)
    return {
      ok: !!result?.ok,
      ms: Math.round((performance.now() - t0) * 10) / 10,
      kept,
      rewritten,
      remark: patched?.remark,
    }
  }, agenticCreate.slideId)
  rec(24, agenticUpdate.ok && agenticUpdate.ms < AGENTIC_MS_BUDGET, agenticUpdate)
  rec(25, agenticUpdate.rewritten === 0 && agenticUpdate.remark === 'stream-patch', agenticUpdate)

  const agenticElement = await page.evaluate(async ({ slideId, elementId }) => {
    const before = window.__FIKA_SLIDES__.getState().slides
    const refs = new Map(before.map(slide => [slide.id, slide]))
    const t0 = performance.now()
    const result = await window.__FIKA_AGENTIC__.execute('elements.update', {
      slideId,
      elementId,
      patch: { content: '<p style="font-size: 22px">Patched body</p>' },
    })
    const after = window.__FIKA_SLIDES__.getState().slides
    let rewritten = 0
    for (const slide of after) {
      if (slide.id === slideId) continue
      if (refs.has(slide.id) && refs.get(slide.id) !== slide) rewritten += 1
    }
    return {
      ok: !!result?.ok,
      ms: Math.round((performance.now() - t0) * 10) / 10,
      rewritten,
    }
  }, { slideId: agenticCreate.slideId, elementId: agenticCreate.elementId })
  rec(26, agenticElement.ok && agenticElement.ms < AGENTIC_MS_BUDGET && agenticElement.rewritten === 0, agenticElement)

  const agenticDelete = await page.evaluate(async (slideId) => {
    const before = window.__FIKA_SLIDES__.getState().slides
    const refs = new Map(before.map(slide => [slide.id, slide]))
    const t0 = performance.now()
    const result = await window.__FIKA_AGENTIC__.execute('slides.delete', { slideId })
    const after = window.__FIKA_SLIDES__.getState().slides
    let kept = 0
    let rewritten = 0
    for (const slide of after) {
      if (!refs.has(slide.id)) continue
      if (refs.get(slide.id) === slide) kept += 1
      else rewritten += 1
    }
    return {
      ok: !!result?.ok,
      ms: Math.round((performance.now() - t0) * 10) / 10,
      kept,
      rewritten,
      after: after.length,
      before: before.length,
    }
  }, agenticCreate.slideId)
  rec(27, agenticDelete.ok && agenticDelete.ms < AGENTIC_MS_BUDGET && agenticDelete.rewritten === 0 && agenticDelete.after === agenticDelete.before - 1, agenticDelete)

  const agenticBatch = await page.evaluate(async () => {
    const before = window.__FIKA_SLIDES__.getState().slides
    const refs = new Map(before.map(slide => [slide.id, slide]))
    const creates = Array.from({ length: 8 }, (_, index) => ({
      type: 'slides.create',
      payload: {
        select: false,
        slide: {
          id: `stream-${index}`,
          elements: [{
            type: 'text',
            left: 40,
            top: 40,
            width: 400,
            height: 64,
            rotate: 0,
            content: `<p>Stream ${index}</p>`,
            defaultFontName: 'Arial',
            defaultColor: '#18181b',
          }],
        },
      },
    }))
    const updates = creates.map((command, index) => ({
      type: 'slides.update',
      payload: {
        slideId: `stream-${index}`,
        patch: { remark: `batch-${index}` },
      },
    }))
    const deletes = creates.map((_, index) => ({
      type: 'slides.delete',
      payload: { slideId: `stream-${index}` },
    }))
    const t0 = performance.now()
    const results = await window.__FIKA_AGENTIC__.executeBatch([...creates, ...updates, ...deletes], { commit: true })
    const after = window.__FIKA_SLIDES__.getState().slides
    let rewritten = 0
    for (const slide of after) {
      if (refs.has(slide.id) && refs.get(slide.id) !== slide) rewritten += 1
    }
    return {
      ms: Math.round(performance.now() - t0),
      ok: results.every(result => result.ok),
      count: results.length,
      rewritten,
      after: after.length,
      before: before.length,
    }
  })
  rec(28, agenticBatch.ok && agenticBatch.ms < AGENTIC_BATCH_MS_BUDGET && agenticBatch.rewritten === 0 && agenticBatch.after === agenticBatch.before, agenticBatch)
}

function printTable() {
  const pad = (s, n) => String(s).padEnd(n)
  console.log(`${pad('#', 4)}${pad('result', 8)}${pad('case', 72)}measured`)
  console.log('-'.repeat(110))
  for (const row of results) {
    const measured = row.measured ? JSON.stringify(row.measured) : ''
    console.log(`${pad(row.id, 4)}${pad(row.pass ? 'PASS' : 'FAIL', 8)}${pad(row.name, 72)}${measured}`)
  }
  const failed = results.filter(r => !r.pass)
  console.log('-'.repeat(110))
  console.log(`${results.filter(r => r.pass).length}/${results.length} passed`)
  return failed
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
  await run(page)
  await page.close()
  const failed = printTable()
  if (failed.length || results.length < CASES.length) {
    console.error(failed.length ? `${failed.length} cases failed` : `expected ${CASES.length} cases, got ${results.length}`)
    process.exitCode = 1
  }
  else {
    console.log('slide-mutate e2e passed')
  }
}
catch (err) {
  console.error(err)
  printTable()
  process.exitCode = 1
}
finally {
  await browser.close()
  if (child) child.kill()
}
