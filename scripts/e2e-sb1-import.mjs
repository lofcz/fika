/**
 * E2E: importing tests/fixtures sb1.pptx must not crash the editor.
 *
 *   node scripts/e2e-sb1-import.mjs
 *
 * Starts `npm run dev` on :5173 if it is not already up.
 */
import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { SB1_PPTX } from '../tests/fixtures/paths.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DEV_URL = 'http://127.0.0.1:5173/'
const sb1Path = SB1_PPTX

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

if (!existsSync(sb1Path)) {
  console.error(`sb1.pptx not found at ${sb1Path}`)
  process.exit(1)
}

const publicCopy = join(root, 'public', '_e2e-sb1.pptx')
copyFileSync(sb1Path, publicCopy)

const browser = await chromium.launch({ headless: true })
let child = null
try {
  let serverReady = await waitForDev(1500)
  if (!serverReady) {
    child = spawn('npm', ['run', 'dev'], { cwd: root, shell: true, stdio: 'pipe' })
    serverReady = await waitForDev(90000)
    if (!serverReady) throw new Error('dev server did not start on http://127.0.0.1:5173/')
  }

  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  page.setDefaultTimeout(60000)
  const pageErrors = []
  const consoleErrors = []
  page.on('pageerror', err => pageErrors.push(String(err)))
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })

  await page.goto(DEV_URL, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForSelector('#app', { timeout: 30000 })
  await sleep(800)

  const imported = await page.evaluate(async () => {
    const [{ getImportApi }, slidesMod] = await Promise.all([
      import('/src/hooks/useImport.ts'),
      import('/src/store/slides.ts'),
    ])
    const resp = await fetch('/_e2e-sb1.pptx')
    const buf = await resp.arrayBuffer()
    const file = new File([buf], 'sb1.pptx', {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    })
    const { importPPTXFile } = getImportApi()
    const ok = await importPPTXFile([file], { cover: true, fixedViewport: false })
    await Promise.resolve()
    const slidesStore = slidesMod.useSlidesStore.getState()
    const texts = slidesStore.slides.flatMap(slide =>
      slide.elements.map(el => {
        const html = el.type === 'shape' ? el.text?.content : el.content
        return String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')
      }),
    ).join(' ')
    let currentSlideAccess = 'ok'
    try {
      void slidesStore.currentSlide.background
    }
    catch (error) {
      currentSlideAccess = error instanceof Error ? error.message : String(error)
    }
    return {
      ok,
      slides: slidesStore.slides.length,
      elements: slidesStore.slides.reduce((n, s) => n + s.elements.length, 0),
      currentSlide: slidesStore.currentSlide ? { id: slidesStore.currentSlide.id } : null,
      currentSlideAccess,
      hasJanHus: /Jan Hus/i.test(texts),
      overlay: !!document.querySelector('vite-error-overlay'),
      thumbnails: document.querySelectorAll('.thumbnail-item').length,
    }
  })

  await sleep(500)

  console.log('import result', imported)
  console.log('pageErrors', pageErrors)
  console.log('consoleErrors', consoleErrors.slice(0, 8))

  assert(imported?.ok, `importPPTXFile returned failure: ${JSON.stringify(imported)}`)
  assert(imported.slides === 7, `editor must keep all 7 slides, got ${imported.slides}`)
  assert(imported.currentSlide, 'currentSlide must remain defined after import (empty deck crashes the toolbar)')
  assert(imported.currentSlideAccess === 'ok', `currentSlide.background must be readable after import, got ${imported.currentSlideAccess}`)
  assert(imported.hasJanHus, 'imported deck must retain Jan Hus title text')
  assert(imported.elements > 0, `imported deck must have elements, got ${imported.elements}`)
  assert(!imported.overlay, 'error overlay must not appear')
  assert(pageErrors.length === 0, `pageerror after import: ${pageErrors.join(' | ')}`)

  await page.close()
}
finally {
  await browser.close()
  if (child) child.kill()
  try { unlinkSync(publicCopy) } catch {  }
}

if (failures.length) {
  console.error('sb1 import e2e failed:\n' + failures.map(f => ` - ${f}`).join('\n'))
  process.exit(1)
}
console.log('sb1 import e2e passed')
