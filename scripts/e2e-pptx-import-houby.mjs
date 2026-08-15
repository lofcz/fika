/**
 * E2E: import Houby-Skryty-svet-nasich-lesu.pptx into the running fika editor.
 *
 * Asserts the deck applies (10 slides, title text) and that pptxtojson
 * `{ name, blob }` usedFonts are registered as FontFace instead of crashing
 * loadGoogleFonts.
 *
 *   node scripts/e2e-pptx-import-houby.mjs
 */
import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { HOUBY_PPTX } from '../tests/fixtures/paths.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DEV_URL = 'http://127.0.0.1:5173/'
const SAMPLE = HOUBY_PPTX
const PUBLIC_COPY = join(root, 'public', '_e2e-houby.pptx')

const failures = []
function assert(condition, message) {
  if (!condition) failures.push(message)
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

if (!existsSync(SAMPLE)) {
  console.error('Missing fixture:', SAMPLE)
  process.exit(1)
}

copyFileSync(SAMPLE, PUBLIC_COPY)

const browser = await chromium.launch({ headless: true })
let child = null
try {
  let serverReady = await waitForDev(1500)
  if (!serverReady) {
    child = spawn('npm', ['run', 'dev'], { cwd: root, shell: true, stdio: 'ignore' })
    serverReady = await waitForDev(90000)
    if (!serverReady) throw new Error('dev server did not start on http://127.0.0.1:5173/')
  }

  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  page.setDefaultTimeout(180000)
  const consoleErrors = []
  const pageErrors = []
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', err => pageErrors.push(err.message))

  await page.goto(DEV_URL, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForSelector('#app', { timeout: 30000 })
  await sleep(800)

  const imported = await page.evaluate(async () => {
    const errors = []
    const orig = console.error
    console.error = (...args) => {
      errors.push(args.map(a => (a instanceof Error ? `${a.name}: ${a.message}\n${a.stack}` : String(a))).join(' '))
      orig.apply(console, args)
    }
    try {
      const [{ getImportApi }, slidesMod] = await Promise.all([
        import('/src/hooks/useImport.ts'),
        import('/src/store/slides.ts'),
      ])
      const resp = await fetch('/_e2e-houby.pptx')
      const buf = await resp.arrayBuffer()
      const file = new File([buf], 'Houby-Skryty-svet-nasich-lesu.pptx', {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      })
      const { importPPTXFile } = getImportApi()
      const ok = await importPPTXFile([file], { cover: true, fixedViewport: false })
      const slidesStore = slidesMod.useSlidesStore.getState()
      const slides = slidesStore.slides
      const titleHtml = (slides[0]?.elements || []).map(el => {
        if (el.type === 'text') return el.content || ''
        if (el.type === 'shape') return el.text?.content || el.content || ''
        return ''
      }).join(' ')
      return {
        ok,
        slides: slides.length,
        firstElTypes: (slides[0]?.elements || []).map(el => el.type),
        titleHtml: String(titleHtml).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80),
        conversionErrors: errors,
        fontFamilies: [...document.fonts].map(f => f.family),
      }
    }
    catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? `${error.name}: ${error.message}\n${error.stack}` : String(error),
        conversionErrors: errors,
      }
    }
    finally {
      console.error = orig
    }
  })

  console.log('import result', JSON.stringify(imported, null, 2))
  console.log('page console errors', consoleErrors)
  console.log('pageerrors', pageErrors)

  assert(imported?.ok === true, `Houby import must succeed, got ${JSON.stringify({ ok: imported?.ok, error: imported?.error, conversionErrors: imported?.conversionErrors })}`)
  assert(imported?.slides === 10, `Houby must apply 10 slides, got ${imported?.slides}`)
  assert(
    /Houby/i.test(imported?.titleHtml || ''),
    `slide 1 must keep the Houby title, got ${JSON.stringify(imported?.titleHtml)}`,
  )
  assert(
    !(imported?.conversionErrors || []).some(e => /font\.replace is not a function|usedFonts/i.test(e)),
    `conversion must not throw on usedFonts objects: ${JSON.stringify(imported?.conversionErrors)}`,
  )
  assert(
    (imported?.fontFamilies || []).some(f => /Brygada/i.test(f)),
    `embedded Brygada FontFace must be registered, got ${JSON.stringify(imported?.fontFamilies)}`,
  )

  const walk = await page.evaluate(async () => {
    const { parse } = await import('/node_modules/pptxtojson/dist/index.js')
    const { pptxPictureSource } = await import('/src/utils/pptxImportPicture.ts')
    const { getSvgPathRange } = await import('/src/utils/svgPathParser.ts')
    const { htmlToStructuredText } = await import('/src/utils/pptxStructuredText.ts')
    const { extractPptxImportExtras } = await import('/src/utils/pptxImportFidelity.ts')
    const resp = await fetch('/_e2e-houby.pptx')
    const buf = await resp.arrayBuffer()
    let json
    try {
      json = await parse(buf, { imageMode: 'base64', videoMode: 'blob', audioMode: 'blob' })
    }
    catch (error) {
      return { parseError: error instanceof Error ? error.message : String(error) }
    }
    const extrasError = await extractPptxImportExtras(buf).then(() => null).catch(e => e instanceof Error ? e.message : String(e))
    const throws = []
    let pictures = 0
    let texts = 0
    const visit = (el, path) => {
      try {
        if (pptxPictureSource(el)) pictures += 1
        if (typeof el.content === 'string' && el.content) {
          texts += 1
          htmlToStructuredText(el.content)
        }
        if (el.path) getSvgPathRange(el.path)
        if (el.elements) el.elements.forEach((c, i) => visit(c, `${path}/${i}`))
      }
      catch (error) {
        throws.push({ path, message: error instanceof Error ? error.message : String(error) })
      }
    }
    for (const [i, slide] of json.slides.entries()) {
      for (const [j, el] of [...slide.elements, ...(slide.layoutElements || [])].entries()) {
        visit(el, `s${i}#${j}`)
      }
    }
    return {
      slides: json.slides.length,
      usedFontsType: json.usedFonts?.map(f => typeof f === 'string' ? 'string' : `${typeof f}:${f?.name}`),
      extrasError,
      pictures,
      texts,
      throws,
    }
  })
  console.log('conversion walk', JSON.stringify(walk, null, 2))
  assert(!walk.parseError, `pptxtojson parse must succeed: ${walk.parseError}`)
  assert(!walk.extrasError, `extractPptxImportExtras must succeed: ${walk.extrasError}`)
  assert((walk.throws || []).length === 0, `conversion walk threw: ${JSON.stringify(walk.throws)}`)
  assert(walk.slides === 10, `walk expected 10 slides, got ${walk.slides}`)

  await page.close()
}
finally {
  await browser.close()
  if (child) child.kill()
  try { unlinkSync(PUBLIC_COPY) } catch {  }
}

if (failures.length) {
  console.error('\nHouby import e2e FAILED:\n' + failures.map(f => ` - ${f}`).join('\n'))
  process.exit(1)
}
console.log('Houby import e2e passed')
