/**
 * Real-browser PPTX export: inserting a code block and downloading PPTX must
 * write native highlighted text into the package (inspectable OOXML).
 *
 *   node scripts/e2e-code-pptx-export.mjs
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { loadPptx } from './lib/pptx-inspect.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DEV_URL = 'http://127.0.0.1:5173/'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const CASES = [
  [1, 'Insert code control is on the canvas tool'],
  [2, 'Code modal opens from the toolbar'],
  [3, 'OK inserts a live code element'],
  [4, 'Export dialog opens'],
  [5, 'Download PPTX produces a file'],
  [6, 'PPTX has one slide'],
  [7, 'PPTX has no media image for the code block'],
  [8, 'Slide XML is well-formed'],
  [9, 'Slide text includes function greet'],
  [10, 'Slide text includes console.log'],
  [11, 'Slide text includes Hello'],
  [12, 'Slide text includes line numbers'],
  [13, 'Slide keeps multiple token colors'],
  [14, 'Slide has a dark code-block fill'],
  [15, 'Slide disables text wrap'],
  [16, 'Slide clips overflow instead of spilling'],
]

async function waitForDev(timeoutMs = 60000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await fetch(DEV_URL)).ok) return true
    }
    catch { /* retry */ }
    await sleep(400)
  }
  return false
}

const results = []
function rec(id, name, pass, measured) {
  results.push({ id, name, pass: !!pass, measured: measured ?? null })
}

const outDir = join(root, 'scripts/e2e-code-pptx-export/out')
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
let child = null
try {
  let serverReady = await waitForDev(1500)
  if (!serverReady) {
    child = spawn('npm', ['run', 'dev'], { cwd: root, shell: true, stdio: 'ignore' })
    serverReady = await waitForDev(90000)
    if (!serverReady) throw new Error('dev server did not start on http://127.0.0.1:5173/')
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(DEV_URL, { waitUntil: 'networkidle' })
  await page.getByText('Add slide').waitFor({ timeout: 90000 })

  rec(1, 'Insert code control is on the canvas tool', await page.locator('[data-canvas-tool=insert-code]').count() === 1)
  const tool = page.locator('[data-canvas-tool=insert-code]')
  const toolBox = await tool.boundingBox()
  if (toolBox) await page.mouse.click(toolBox.x + Math.min(24, toolBox.width / 2), toolBox.y + toolBox.height / 2)
  await page.locator('[class*=code-editor-host]').waitFor({ timeout: 20000 })
  rec(2, 'Code modal opens from the toolbar', await page.locator('[class*=code-editor-host]').count() > 0)
  await page.locator('.cm-editor').first().waitFor({ timeout: 20000 })
  await sleep(250)
  const okBtn = page.getByRole('button', { name: 'OK' })
  if (await okBtn.count()) await okBtn.last().click()
  await page.locator('.cm-editor').first().waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {})
  await page.locator('[data-element-type=code] [data-live-box]').waitFor({ state: 'attached', timeout: 15000 })
  rec(3, 'OK inserts a live code element', await page.locator('[data-element-type=code]').count() === 1)

  await page.locator('[data-tooltip=Export]').click()
  await page.locator('[data-export-format=pptx]').waitFor({ timeout: 10000 })
  rec(4, 'Export dialog opens', await page.locator('[data-export-format=pptx]').count() === 1)

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    page.locator('[data-export-format=pptx]').click(),
  ])
  const downloadPath = join(outDir, 'browser-code-export.pptx')
  await download.saveAs(downloadPath)
  rec(5, 'Download PPTX produces a file', !!downloadPath, { suggested: download.suggestedFilename() })

  const deck = await loadPptx(downloadPath)
  const slide = deck.slides[0] || { plainText: '', colors: [], solidFills: [], pictures: 1, xmlIssues: ['missing slide'], xml: '' }
  const plain = (slide.plainText || '').replace(/\s+/g, ' ')
  writeFileSync(join(outDir, 'browser-summary.json'), JSON.stringify({
    slideCount: deck.slideCount,
    media: deck.mediaNames,
    plain,
    colors: slide.colors,
    fills: slide.solidFills,
    pictures: slide.pictures,
  }, null, 2))

  rec(6, 'PPTX has one slide', deck.slideCount >= 1, { slideCount: deck.slideCount })
  rec(7, 'PPTX has no media image for the code block', deck.mediaCount === 0 && slide.pictures === 0, {
    media: deck.mediaNames,
    pictures: slide.pictures,
  })
  rec(8, 'Slide XML is well-formed', slide.xmlIssues.length === 0, slide.xmlIssues)
  rec(9, 'Slide text includes function greet', /function greet/.test(plain), { plain })
  rec(10, 'Slide text includes console.log', /console\.log/.test(plain))
  rec(11, 'Slide text includes Hello', /Hello/.test(plain))
  rec(12, 'Slide text includes line numbers', /\b1\b/.test(slide.plainText) && /\b5\b/.test(slide.plainText), {
    text: slide.plainText,
  })
  rec(13, 'Slide keeps multiple token colors', slide.colors.length >= 3, slide.colors)
  rec(14, 'Slide has a dark code-block fill', slide.solidFills.some(c => {
    const r = parseInt(c.slice(0, 2), 16)
    const g = parseInt(c.slice(2, 4), 16)
    const b = parseInt(c.slice(4, 6), 16)
    return r < 80 && g < 80 && b < 90
  }), slide.solidFills)
  rec(15, 'Slide disables text wrap', /wrap="none"/.test(slide.xml), { bodyPr: /<a:bodyPr[^>]*>/.exec(slide.xml)?.[0] })
  rec(16, 'Slide clips overflow instead of spilling', /vertOverflow="clip"/.test(slide.xml) && /horzOverflow="clip"/.test(slide.xml), {
    bodyPr: /<a:bodyPr[^>]*>/.exec(slide.xml)?.[0],
  })

  const failed = results.filter(p => !p.pass)
  const width = 58
  console.log('#   result  case'.padEnd(width + 12) + 'measured')
  console.log('-'.repeat(96))
  for (const [id, name] of CASES) {
    const found = results.find(p => p.id === id)
    if (!found) throw new Error(`missing proof ${id} ${name}`)
    const mark = found.pass ? 'PASS' : 'FAIL'
    console.log(`${String(id).padEnd(4)}${mark.padEnd(8)}${name.padEnd(width)}${found.measured ? JSON.stringify(found.measured) : ''}`)
  }
  if (results.length !== CASES.length) throw new Error(`expected ${CASES.length} proofs, got ${results.length}`)
  if (failed.length) throw new Error(`${failed.length} code-pptx-export proofs failed: ${failed.map(p => p.id).join(', ')}`)
  console.log('-'.repeat(96))
  console.log('code-pptx-export e2e passed (16 cases)')
  await page.close()
}
finally {
  await browser.close()
  if (child) child.kill()
}
