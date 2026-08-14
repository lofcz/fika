/**
 * PPTX → Fika (fixContrast) → PPTX round-trip via the running editor.
 *
 * Usage:
 *   node scripts/roundtrip-contrast.mjs <input.pptx> <output.pptx>
 *
 * Expects `npm run dev` on http://127.0.0.1:5173/ (starts it if needed).
 */
import { copyFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const input = resolve(process.argv[2] || '')
const output = resolve(process.argv[3] || '')
if (!input || !output || !existsSync(input)) {
  console.error('Usage: node scripts/roundtrip-contrast.mjs <input.pptx> <output.pptx>')
  process.exit(1)
}

const DEV_URL = 'http://127.0.0.1:5173/'
const publicCopy = join(root, 'public', '_roundtrip-input.pptx')

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function waitForDev(timeoutMs = 60000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(DEV_URL)
      if (res.ok) return true
    }
    catch {  }
    await sleep(500)
  }
  return false
}

if (!(await waitForDev(2000))) {
  console.error(`Fika dev server not reachable at ${DEV_URL}. Run \`npm run dev\` first.`)
  process.exit(1)
}

copyFileSync(input, publicCopy)

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()

try {
  await page.goto(DEV_URL, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForSelector('#app', { timeout: 30000 })
  await sleep(1500)

  const importResult = await page.evaluate(async () => {
    const [{ getImportApi }, slidesMod] = await Promise.all([
      import('/src/hooks/useImport.ts'),
      import('/src/store/slides.ts'),
    ])

    const resp = await fetch('/_roundtrip-input.pptx')
    const buf = await resp.arrayBuffer()
    const file = new File([buf], 'test_contrast.pptx', {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    })

    const { importPPTXFile } = getImportApi()
    const ok = await importPPTXFile([file], { cover: true, fixContrast: true })
    const slidesStore = slidesMod.useSlidesStore.getState()
    return {
      ok,
      slides: slidesStore.slides.length,
      sample: slidesStore.slides[0]?.elements?.length || 0,
    }
  })

  console.log('import:', importResult)
  if (!importResult?.ok) throw new Error(`import failed: ${JSON.stringify(importResult)}`)

  await sleep(1000)

  const downloadPromise = page.waitForEvent('download', { timeout: 180000 })

  const exportStarted = await page.evaluate(async () => {
    const [React, { createRoot }, useExportMod, slidesMod, pkgMod] = await Promise.all([
      import('react'),
      import('react-dom/client'),
      import('/src/hooks/useExport.ts'),
      import('/src/store/slides.ts'),
      import('/src/utils/pptxSourcePackage.ts'),
    ])

    pkgMod.markSourcePackageDirty()
    const slidesStore = slidesMod.useSlidesStore.getState()
    slidesStore.setTitle('test_contrast_doctored')

    const host = document.createElement('div')
    document.body.appendChild(host)
    return await new Promise((resolve, reject) => {
      function Runner() {
        const { exportPPTX } = useExportMod.default()
        React.useEffect(() => {
          void exportPPTX(slidesStore.slides, true)
            .then(() => resolve({ ok: true, slides: slidesStore.slides.length }))
            .catch(reject)
        }, [])
        return null
      }
      createRoot(host).render(React.createElement(Runner))
    })
  })

  console.log('export started:', exportStarted)
  const download = await downloadPromise
  mkdirSync(dirname(output), { recursive: true })
  await download.saveAs(output)
  console.log('wrote', output)
}
finally {
  await browser.close()
  try { unlinkSync(publicCopy) }
  catch {  }
}
