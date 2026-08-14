/**
 * Text-fit E2E: CSS zoom shrink-to-fit against real Chromium layout, plus the
 * running editor (synthetic boxes and the Rizika PPTX when present).
 *
 *   node scripts/e2e-text-fit.mjs
 *
 * Starts `npm run dev` on :5173 if it is not already up.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const DEV_URL = 'http://127.0.0.1:5173/'
const SAMPLE = join(homedir(), 'Desktop', 'Rizika použití EF s ohledem na výkonnost.pptx')
const CLIP_TOL = 1.5
const JUMP_TOL = 2

const failures = []
function assert(condition, message) {
  if (!condition) {
    failures.push(message)
    throw new Error(message)
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function waitForDev(timeoutMs = 60000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(DEV_URL)
      if (res.ok) return true
    }
    catch {  }
    await sleep(400)
  }
  return false
}

const LIST_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, 'Segoe UI', sans-serif; }
  .box {
    position: relative;
    overflow: hidden;
    line-height: 0.86;
    letter-spacing: 0;
    --paragraphSpace: 13px;
  }
  .host { width: 100%; min-width: 0; }
  .ProseMirror {
    outline: 0;
    font-size: 37px;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  ul {
    margin: 0;
    list-style-position: outside;
    padding-inline-start: 24px;
  }
  li {
    margin: 0;
    padding-inline-start: 0.4em;
  }
  li + li { margin-top: var(--paragraphSpace); }
`

const OBS_AH_ITEMS = [
  'ToList() - Hladovy zacatecnik + AsNoTracking',
  'Prilis mnoho parametru v selektu',
  'N+1 - loading FK relationship',
  'N+1 zanoreny',
  'Bulk insert (kdy volat SaveChanges() + AutoDetectChangesEnabled)',
  'Bulk update/delete',
  'Filtrovani - make query as simple as possible',
  'MARS',
  'Enlist',
  'Indexes, bad parametr sniffing and execution plans, skip/take lambda (too long to fit one line)',
]

function listHtml(items, fontPx = 37) {
  const lis = items.map(text =>
    `<li><p><span style="font-size: ${fontPx}px; font-family: Arial;">${text}</span></p></li>`
  ).join('')
  return `<ul style="padding-inline-start: 24px; font-size: ${fontPx}px;">${lis}</ul>`
}

function boxHtml({ width, height, padding, html }) {
  return `<!DOCTYPE html><html><head><style>${LIST_CSS}
    .box { width: ${width}px; height: ${height}px; padding: ${padding}px; }
  </style></head><body>
    <div class="box" data-fit-box>
      <div class="host" data-text-fit-host>
        <div class="ProseMirror ProseMirror-static">${html}</div>
      </div>
    </div>
  </body></html>`
}

function injectFitFns() {
  return `
    window.__fitScaleFromContentHeight = function(contentHeight, innerHeight, options) {
      var minScale = (options && options.minScale) || 0.2
      if (!(contentHeight > 0) || !(innerHeight > 0)) return 1
      if (contentHeight <= innerHeight) return 1
      return Math.round(Math.max(minScale, innerHeight / contentHeight) * 10000) / 10000
    }
    window.__measureUnzoomedScrollHeight = function(host, innerWidth) {
      var content = host.querySelector('.ProseMirror, .ProseMirror-static, .prosemirror-editor')
      var target = content || host
      var prevZoom = host.style.zoom
      var prevWidth = host.style.width
      host.style.zoom = '1'
      host.style.width = Math.max(1, innerWidth) + 'px'
      var height = Math.max(target.scrollHeight, target.offsetHeight)
      host.style.zoom = prevZoom
      host.style.width = prevWidth
      return height
    }
  `
}

async function applyDomFit(page, innerWidth, innerHeight) {
  return page.evaluate(({ innerWidth, innerHeight }) => {
    const host = document.querySelector('[data-text-fit-host]')
    const height = window.__measureUnzoomedScrollHeight(host, innerWidth)
    const scale = window.__fitScaleFromContentHeight(height, innerHeight)
    host.style.zoom = scale < 1 ? String(scale) : '1'
    return { height, scale, innerHeight }
  }, { innerWidth, innerHeight })
}

async function clipMetrics(page) {
  return page.evaluate(() => {
    const box = document.querySelector('[data-fit-box]')
    const last = box.querySelector('li:last-child, p:last-child')
    const first = box.querySelector('li:first-child, p:first-child')
    const boxRect = box.getBoundingClientRect()
    const lastRect = last.getBoundingClientRect()
    const firstRect = first.getBoundingClientRect()
    const host = document.querySelector('[data-text-fit-host]')
    return {
      clipBottom: lastRect.bottom - boxRect.bottom,
      clipTop: boxRect.top - lastRect.top,
      firstTop: firstRect.top,
      lastTop: lastRect.top,
      lastBottom: lastRect.bottom,
      lastHeight: lastRect.height,
      boxBottom: boxRect.bottom,
      zoom: host.style.zoom || '1',
      lastText: (last.textContent || '').trim().slice(0, 80),
    }
  })
}

async function runIsolated(browser) {
  const page = await browser.newPage()

  const load = async html => {
    await page.setContent(html)
    await page.addScriptTag({ content: injectFitFns() })
  }

  const pad = 8
  const width = 640
  const height = 280
  await load(boxHtml({
    width,
    height,
    padding: pad,
    html: listHtml(OBS_AH_ITEMS),
  }))
  const innerW = width - pad * 2
  const innerH = height - pad * 2
  const fit = await applyDomFit(page, innerW, innerH)
  assert(fit.scale < 1, `isolated overflow must shrink, scale=${fit.scale} height=${fit.height} inner=${fit.innerHeight}`)
  assert(fit.height * fit.scale <= innerH + 0.5, `isolated scaled height must fit (${fit.height}*${fit.scale} vs ${innerH})`)
  const overflowMetrics = await clipMetrics(page)
  assert(overflowMetrics.clipBottom <= CLIP_TOL, `isolated overflow last line clipped by ${overflowMetrics.clipBottom.toFixed(2)}px: ${overflowMetrics.lastText}`)
  assert(overflowMetrics.lastHeight > 8, 'isolated last line has a real glyph box')
  const beforeClick = overflowMetrics.lastTop
  await page.click('[data-fit-box]')
  await sleep(80)
  const afterClick = await clipMetrics(page)
  assert(Math.abs(afterClick.lastTop - beforeClick) <= JUMP_TOL, `isolated click jumped ${Math.abs(afterClick.lastTop - beforeClick).toFixed(2)}px`)
  assert(afterClick.zoom === overflowMetrics.zoom, `isolated click changed zoom ${overflowMetrics.zoom} → ${afterClick.zoom}`)

  await load(boxHtml({
    width: 640,
    height: 500,
    padding: pad,
    html: listHtml(['MARS', 'Enlist'], 28),
  }))
  const shortFit = await applyDomFit(page, 640 - pad * 2, 500 - pad * 2)
  assert(shortFit.scale === 1, `short content must stay 100%, got ${shortFit.scale}`)
  const shortMetrics = await clipMetrics(page)
  assert(shortMetrics.clipBottom <= CLIP_TOL, `short list clipped by ${shortMetrics.clipBottom.toFixed(2)}px`)

  await load(boxHtml({
    width: 320,
    height: 90,
    padding: pad,
    html: `<p><span style="font-size: 28px;">Indexes, bad parametr sniffing and execution plans, skip/take lambda (too long)</span></p>`,
  }))
  const wrapFit = await applyDomFit(page, 320 - pad * 2, 90 - pad * 2)
  const wrapMetrics = await clipMetrics(page)
  assert(wrapFit.scale <= 1, 'wrapping paragraph scale is <= 1')
  assert(wrapMetrics.clipBottom <= CLIP_TOL, `wrapping paragraph clipped by ${wrapMetrics.clipBottom.toFixed(2)}px`)

  await page.close()
  console.log('isolated layout cases passed')
}

async function runApp(browser) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  page.setDefaultTimeout(30000)
  await page.goto(DEV_URL, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForSelector('#app', { timeout: 30000 })
  await sleep(1200)

  const injected = await page.evaluate(async ({ overflowHtml, shortHtml }) => {
    const slidesMod = await import('/src/store/slides.ts')
    const slides = slidesMod.useSlidesStore.getState()
      const overflow = {
        id: 'e2e-fit-overflow',
        type: 'text',
        left: 40,
        top: 40,
        width: 720,
        height: 260,
        rotate: 0,
        content: overflowHtml,
        defaultFontName: 'Arial',
        defaultColor: '#111111',
        fill: '#ffffff',
        fixedHeight: true,
        lineHeight: 0.86,
        paragraphSpace: 13,
        inset: [8, 8, 8, 8],
      }
      const short = {
        id: 'e2e-fit-short',
        type: 'text',
        left: 40,
        top: 320,
        width: 400,
        height: 220,
        rotate: 0,
        content: shortHtml,
        defaultFontName: 'Arial',
        defaultColor: '#111111',
        fill: '#ffffff',
        fixedHeight: true,
        lineHeight: 1.2,
        paragraphSpace: 8,
        inset: [8, 8, 8, 8],
      }
      const auto = {
        id: 'e2e-fit-auto',
        type: 'text',
        left: 460,
        top: 320,
        width: 300,
        height: 80,
        rotate: 0,
        content: shortHtml,
        defaultFontName: 'Arial',
        defaultColor: '#111111',
        fill: '#ffffff',
        fixedHeight: false,
        lineHeight: 1.2,
        paragraphSpace: 8,
        inset: [8, 8, 8, 8],
      }
      slides.addElement([overflow, short, auto])
      return { ok: true, slide: slides.slideIndex }
  }, {
    overflowHtml: listHtml(OBS_AH_ITEMS, 32),
    shortHtml: listHtml(['MARS', 'Enlist'], 22),
  })
  assert(injected?.ok, `inject elements failed: ${JSON.stringify(injected)}`)
  await page.waitForSelector('#editable-element-e2e-fit-overflow [data-text-fit-host]', { timeout: 15000 })
  await sleep(400)

  const appMetrics = await page.evaluate(() => {
    const read = id => {
      const root = document.querySelector(`#editable-element-${id}`)
      const box = root?.querySelector('.element-content')
      const host = root?.querySelector('[data-text-fit-host]')
      const content = host?.querySelector('.ProseMirror, .ProseMirror-static, .prosemirror-editor')
      if (!root || !box || !host || !content) return { missing: true, id }
      const zoom = parseFloat(getComputedStyle(host).zoom) || 1
      const prev = host.style.zoom
      host.style.zoom = '1'
      const natural = Math.max(content.scrollHeight, content.offsetHeight)
      host.style.zoom = prev
      const cs = getComputedStyle(box)
      const innerHeight = box.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0)
      const visual = natural * zoom
      return {
        id,
        zoom,
        natural,
        innerHeight,
        visual,
        overflow: visual - innerHeight,
        lastText: (content.textContent || '').trim().slice(-50),
      }
    }
    return {
      overflow: read('e2e-fit-overflow'),
      short: read('e2e-fit-short'),
      auto: read('e2e-fit-auto'),
    }
  })

  assert(!appMetrics.overflow.missing, 'overflow box missing in editor')
  assert(appMetrics.overflow.overflow <= 2, `editor overflow clipped by ${appMetrics.overflow.overflow?.toFixed?.(2)}px (${appMetrics.overflow.lastText})`)
  assert(appMetrics.overflow.zoom < 0.999, `editor overflow must zoom, got ${appMetrics.overflow.zoom}`)
  assert(appMetrics.overflow.overflow >= -20, `editor overflow over-shrunk by ${(-appMetrics.overflow.overflow).toFixed(2)}px`)

  assert(!appMetrics.short.missing, 'short box missing in editor')
  assert(appMetrics.short.overflow <= 2, `editor short list clipped by ${appMetrics.short.overflow?.toFixed?.(2)}px`)
  assert(Math.abs(appMetrics.short.zoom - 1) < 0.02, `short box should stay ~100%, got ${appMetrics.short.zoom}`)

  assert(!appMetrics.auto.missing, 'auto-height box missing in editor')
  assert(appMetrics.auto.overflow <= 2, `auto-height last line clipped by ${appMetrics.auto.overflow?.toFixed?.(2)}px`)

  console.log(`editor overflow: zoom=${appMetrics.overflow.zoom} overflow=${appMetrics.overflow.overflow.toFixed(2)}px natural=${appMetrics.overflow.natural} inner=${appMetrics.overflow.innerHeight}`)
  const before = appMetrics.overflow
  await page.locator('#editable-element-e2e-fit-overflow').click({ force: true, position: { x: 24, y: 24 } })
  await sleep(400)
  const afterClick = await page.evaluate(() => {
    const root = document.querySelector('#editable-element-e2e-fit-overflow')
    const box = root.querySelector('.element-content')
    const host = root.querySelector('[data-text-fit-host]')
    const content = host.querySelector('.ProseMirror, .ProseMirror-static, .prosemirror-editor')
    const zoom = parseFloat(getComputedStyle(host).zoom) || 1
    const prev = host.style.zoom
    host.style.zoom = '1'
    const natural = Math.max(content.scrollHeight, content.offsetHeight)
    host.style.zoom = prev
    const cs = getComputedStyle(box)
    const innerHeight = box.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0)
    return { zoom, natural, innerHeight, visual: natural * zoom, overflow: natural * zoom - innerHeight }
  })
  assert(Math.abs(afterClick.zoom - before.zoom) < 0.01, `editor click changed zoom ${before.zoom} → ${afterClick.zoom}`)
  assert(Math.abs(afterClick.overflow - before.overflow) <= 4, `editor click changed overflow ${before.overflow.toFixed(2)} → ${afterClick.overflow.toFixed(2)}`)
  assert(afterClick.overflow <= 2, `editor still clipped after click by ${afterClick.overflow.toFixed(2)}px`)

  if (existsSync(SAMPLE)) {
    const { copyFileSync, unlinkSync, mkdirSync } = await import('node:fs')
    const publicCopy = join(root, 'public', '_e2e-text-fit.pptx')
    copyFileSync(SAMPLE, publicCopy)
    try {
    const imported = await page.evaluate(async () => {
      const [{ getImportApi }, slidesMod] = await Promise.all([
        import('/src/hooks/useImport.ts'),
        import('/src/store/slides.ts'),
      ])
      const resp = await fetch('/_e2e-text-fit.pptx')
      const buf = await resp.arrayBuffer()
      const file = new File([buf], 'rizika.pptx', {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      })
      const { importPPTXFile } = getImportApi()
      const ok = await importPPTXFile([file], { cover: true, fixedViewport: false })
      const slidesStore = slidesMod.useSlidesStore.getState()
      slidesStore.updateSlideIndex(1)
      return { ok, slides: slidesStore.slides.length, title: slidesStore.slides[1]?.elements?.find(el => el.type === 'text')?.content?.slice(0, 40) }
    })
    assert(imported?.ok, `pptx import failed: ${JSON.stringify(imported)}`)
    await sleep(800)
    const obsah = await page.evaluate(() => {
      const boxes = [...document.querySelectorAll('.editable-element-text')]
      const body = boxes.find(box => (box.querySelectorAll('li').length >= 8))
      if (!body) return { missing: true, counts: boxes.map(b => b.querySelectorAll('li').length) }
      const box = body.querySelector('.element-content')
      const host = body.querySelector('[data-text-fit-host]')
      const content = host?.querySelector('.ProseMirror, .ProseMirror-static, .prosemirror-editor')
      if (!box || !host || !content) return { missing: true }
      const zoom = parseFloat(getComputedStyle(host).zoom) || 1
      const prev = host.style.zoom
      host.style.zoom = '1'
      const natural = Math.max(content.scrollHeight, content.offsetHeight)
      host.style.zoom = prev
      const cs = getComputedStyle(box)
      const innerHeight = box.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0)
      const last = body.querySelector('li:last-child')
      return {
        missing: false,
        zoom,
        natural,
        innerHeight,
        overflow: natural * zoom - innerHeight,
        lastText: (last?.textContent || '').trim().slice(0, 80),
        liCount: body.querySelectorAll('li').length,
      }
    })
    assert(!obsah.missing, `Obsah body list not found (li counts ${JSON.stringify(obsah.counts)})`)
    assert(obsah.liCount >= 8, `Obsah should have many bullets, got ${obsah.liCount}`)
    assert(obsah.overflow <= 2, `Obsah clipped by ${obsah.overflow.toFixed(2)}px (${obsah.lastText})`)
    assert(obsah.zoom < 0.999 || obsah.overflow <= 2, 'Obsah either fits at 100% or must shrink')
    if (obsah.zoom < 0.999) {
      assert(obsah.overflow >= -20, `Obsah over-shrunk by ${(-obsah.overflow).toFixed(2)}px`)
    }

    const obsahBox = page.locator('.editable-element-text').filter({ has: page.locator('li') })
    await obsahBox.first().click({ force: true, position: { x: 24, y: 24 } })
    await sleep(400)
    const obsahAfter = await page.evaluate(() => {
      const boxes = [...document.querySelectorAll('.editable-element-text')]
      const body = boxes.find(box => (box.querySelectorAll('li').length >= 8))
      const box = body.querySelector('.element-content')
      const host = body.querySelector('[data-text-fit-host]')
      const content = host.querySelector('.ProseMirror, .ProseMirror-static, .prosemirror-editor')
      const zoom = parseFloat(getComputedStyle(host).zoom) || 1
      const prev = host.style.zoom
      host.style.zoom = '1'
      const natural = Math.max(content.scrollHeight, content.offsetHeight)
      host.style.zoom = prev
      const cs = getComputedStyle(box)
      const innerHeight = box.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0)
      return { zoom, overflow: natural * zoom - innerHeight }
    })
    assert(Math.abs(obsahAfter.zoom - obsah.zoom) < 0.01, `Obsah click changed zoom ${obsah.zoom} → ${obsahAfter.zoom}`)
    assert(Math.abs(obsahAfter.overflow - obsah.overflow) <= 4, `Obsah click changed overflow ${obsah.overflow.toFixed(2)} → ${obsahAfter.overflow.toFixed(2)}`)
    assert(obsahAfter.overflow <= 2, `Obsah still clipped after click by ${obsahAfter.overflow.toFixed(2)}px`)
    console.log(`Obsah: zoom=${obsah.zoom} overflow=${obsah.overflow.toFixed(2)}px items=${obsah.liCount}`)
    const shotDir = join(root, 'scripts', 'e2e-text-fit-out')
    mkdirSync(shotDir, { recursive: true })
    const bodyHandle = await page.locator('.editable-element-text').filter({ has: page.locator('li') }).first()
    await bodyHandle.screenshot({ path: join(shotDir, 'obsah-body.png') })
    await page.screenshot({ path: join(shotDir, 'obsah-slide.png') })
    }
    finally {
      try { unlinkSync(publicCopy) } catch {  }
    }
  }
  else {
    console.warn('skipping Rizika PPTX cases: sample not on Desktop')
  }

  await page.close()
  console.log('editor cases passed')
}

const browser = await chromium.launch({ headless: true })
let child = null
try {
  await runIsolated(browser)

  let serverReady = await waitForDev(1500)
  if (!serverReady) {
    child = spawn('npm', ['run', 'dev'], { cwd: root, shell: true, stdio: 'pipe' })
    serverReady = await waitForDev(90000)
    if (!serverReady) throw new Error('dev server did not start on http://127.0.0.1:5173/')
  }
  await runApp(browser)
}
finally {
  await browser.close()
  if (child) {
    child.kill()
  }
}

if (failures.length) {
  console.error('text-fit e2e failed:\n' + failures.map(f => ` - ${f}`).join('\n'))
  process.exit(1)
}
console.log('text-fit e2e passed')
