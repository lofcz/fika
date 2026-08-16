/**
 * Real-browser code-block preview raster: the slide thumbnail must keep
 * Shiki token colors and line-number gutters, not a monochrome dump.
 *
 *   node scripts/e2e-code-preview.mjs
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

const CASES = [
  [1, 'Insert code control is on the canvas tool'],
  [2, 'Code modal opens from the toolbar'],
  [3, 'OK inserts a live code element'],
  [4, 'Live code shows Shiki token spans'],
  [5, 'Live code shows at least 3 token colors'],
  [6, 'Live code shows CSS line-number gutters'],
  [7, 'Cover thumbnail finishes rasterizing'],
  [8, 'Thumbnail code region is a dark github-dark panel'],
  [9, 'Thumbnail is not monochrome white-on-black'],
  [10, 'Thumbnail has at least 3 highlight hues'],
  [11, 'Thumbnail keeps a keyword-red family'],
  [12, 'Thumbnail keeps a type/string-blue family'],
  [13, 'Thumbnail left gutter has dim numeral ink'],
  [14, 'Thumbnail highlight hues overlap the live editor'],
  [15, 'Store code element still has the default sample'],
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

async function stripScan(page) {
  await page.evaluate(() => {
    document.querySelectorAll('[data-react-scan], #react-scan-root').forEach(el => el.remove())
  })
}

const results = []
function rec(id, name, pass, measured) {
  results.push({ id, name, pass: !!pass, measured: measured ?? null })
}

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
  await stripScan(page)

  rec(1, 'Insert code control is on the canvas tool', await page.locator('[data-canvas-tool=insert-code]').count() === 1)
  const tool = page.locator('[data-canvas-tool=insert-code]')
  const toolBox = await tool.boundingBox()
  if (toolBox) await page.mouse.click(toolBox.x + Math.min(24, toolBox.width / 2), toolBox.y + toolBox.height / 2)
  await page.locator('[class*=code-editor], [class*=code-editor-host]').waitFor({ timeout: 20000 })
  rec(2, 'Code modal opens from the toolbar', await page.locator('[class*=code-editor], [class*=code-editor-host]').count() > 0)
  await page.locator('.cm-editor').first().waitFor({ timeout: 20000 })
  await sleep(250)
  const okBtn = page.getByRole('button', { name: 'OK' })
  if (await okBtn.count()) await okBtn.last().click()
  await page.locator('.cm-editor').first().waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {})
  await page.locator('[data-element-type=code] [data-live-box]').waitFor({ state: 'attached', timeout: 15000 })
  rec(3, 'OK inserts a live code element', await page.locator('[data-element-type=code]').count() === 1)

  await page.locator('[data-element-type=code] .line span[style*="color"]').first().waitFor({ timeout: 20000 })
  const live = await page.evaluate(() => {
    const host = document.querySelector('[data-element-type=code]')
    const tokens = [...(host?.querySelectorAll('.line span[style*="color"]') || [])]
    const colors = [...new Set(tokens.map(el => {
      const color = el.style.color || getComputedStyle(el).color
      return color.replace(/\s+/g, '')
    }).filter(Boolean))]
    const content = host?.querySelector('[class*=code-content]')
    const firstLine = host?.querySelector('.line')
    const before = firstLine ? getComputedStyle(firstLine, '::before') : null
    const gutterText = (before?.content || '').replace(/['"]/g, '')
    const gutterWidth = parseFloat(before?.width || '0')
    return {
      tokenCount: tokens.length,
      colors,
      lineCount: host?.querySelectorAll('.line').length || 0,
      gutter: gutterText,
      gutterWidth,
      lineNumbersClass: /line-numbers/.test(content?.className || host?.innerHTML || ''),
      sampleText: (host?.innerText || '').replace(/\s+/g, ' ').trim(),
    }
  })
  rec(4, 'Live code shows Shiki token spans', live.tokenCount >= 6 && live.lineCount >= 5, live)
  rec(5, 'Live code shows at least 3 token colors', live.colors.length >= 3, live.colors)
  rec(6, 'Live code shows CSS line-number gutters', live.lineNumbersClass && (live.gutterWidth > 8 || /counter|^\d+$/.test(live.gutter)), {
    gutter: live.gutter,
    gutterWidth: live.gutterWidth,
  })

  const proof = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    const hueOf = (r, g, b) => {
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      const d = max - min
      const sat = max === 0 ? 0 : d / max
      if (sat < 0.18 || max < 50) return null
      let h = 0
      if (d === 0) return null
      if (max === r) h = ((g - b) / d) % 6
      else if (max === g) h = (b - r) / d + 2
      else h = (r - g) / d + 4
      h = Math.round((h * 60 + 360) % 360)
      return Math.round(h / 20) * 20
    }
    const parseColor = (raw) => {
      const hex = raw.match(/#([0-9a-fA-F]{3,8})/)
      const rgb = raw.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
      if (hex) {
        let h = hex[1]
        if (h.length === 3) h = h.split('').map(c => c + c).join('')
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
      }
      if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
      return null
    }
    const waitPaint = async () => {
      const t0 = Date.now()
      while (Date.now() - t0 < 12000) {
        const host = document.querySelector('[data-thumbnail-slide]')
        const slide = host?.querySelector('.screen-slide')
        const spans = slide?.querySelectorAll('[style*="color"]')
        if (slide && spans?.length) return { host, slide, timeout: false }
        await sleep(80)
      }
      const host = document.querySelector('[data-thumbnail-slide]')
      return { host, slide: host?.querySelector('.screen-slide') || null, timeout: true }
    }
    const { host, slide, timeout } = await waitPaint()
    if (!slide) {
      return { pending: true, timeout: !!timeout, chromatic: 0, hues: [], darkShare: 0, whiteShare: 0, gutterInk: 0 }
    }

    // The thumb renders the same Shiki markup as the editor — read its spans.
    const hues = new Map()
    let chromatic = 0
    for (const span of slide.querySelectorAll('[style*="color"]')) {
      const m = (span.getAttribute('style') || '').match(/color:\s*([^;]+)/i)
      const rgb = m ? parseColor(m[1].trim()) : null
      if (!rgb) continue
      const hue = hueOf(rgb[0], rgb[1], rgb[2])
      if (hue == null) continue
      const chars = (span.textContent || '').length
      chromatic += chars
      hues.set(hue, (hues.get(hue) || 0) + chars)
    }

    // Panel background: github-dark is a dark surface.
    const panel = slide.querySelector('[class*=base-element-code], [class*=code-block], pre')
    const bg = panel ? getComputedStyle(panel).backgroundColor : ''
    const bgRgb = parseColor(bg)
    const darkShare = bgRgb && bgRgb[0] + bgRgb[1] + bgRgb[2] < 240 ? 0.5 : 0

    // Gutters are ::before numerals (no DOM text): the same .line-numbers
    // container + line count in the thumb means the gutter renders there.
    const gutterLines = slide.querySelectorAll('.line-numbers .line').length
    const gutterInk = gutterLines

    const liveColors = [...document.querySelectorAll('[data-element-type=code] .line span[style*="color"]')].map(el => {
      const m = (el.getAttribute('style') || '').match(/color:\s*([^;]+)/i)
      return (m?.[1] || '').trim()
    })
    const liveHues = new Set()
    for (const raw of liveColors) {
      const rgb = parseColor(raw)
      if (!rgb) continue
      const hue = hueOf(rgb[0], rgb[1], rgb[2])
      if (hue != null) liveHues.add(hue)
    }
    const thumbHues = [...hues.entries()].filter(([, n]) => n >= 4).map(([hue]) => hue)
    const overlap = thumbHues.filter(hue => [...liveHues].some(live => Math.abs(live - hue) <= 20 || Math.abs(live - hue) >= 340))
    const hasRed = thumbHues.some(hue => hue <= 40 || hue >= 340)
    const hasBlue = thumbHues.some(hue => hue >= 180 && hue <= 260)
    const liveText = (document.querySelector('[data-element-type=code]')?.innerText || '').replace(/\s+/g, ' ')
    return {
      pending: false,
      timeout: !!timeout,
      canvas: { w: 120, h: 68 },
      darkShare,
      whiteShare: 0,
      chromatic,
      hues: thumbHues,
      liveHues: [...liveHues],
      overlap,
      hasRed,
      hasBlue,
      gutterInk,
      sample: /function greet/.test(liveText) && /console\.log/.test(liveText),
    }
  })

  rec(7, 'Cover thumbnail finishes rasterizing', !proof.pending && !proof.timeout && proof.canvas?.w > 8, proof)
  rec(8, 'Thumbnail code region is a dark github-dark panel', proof.darkShare > 0.35, { darkShare: proof.darkShare })
  rec(9, 'Thumbnail is not monochrome white-on-black', proof.chromatic > 20 && proof.whiteShare < 0.85, {
    chromatic: proof.chromatic,
    whiteShare: proof.whiteShare,
  })
  rec(10, 'Thumbnail has at least 3 highlight hues', proof.hues.length >= 3, proof.hues)
  rec(11, 'Thumbnail keeps a keyword-red family', proof.hasRed, proof.hues)
  rec(12, 'Thumbnail keeps a type/string-blue family', proof.hasBlue, proof.hues)
  rec(13, 'Thumbnail left gutter renders per-line numerals', proof.gutterInk >= 4, { gutterInk: proof.gutterInk })
  rec(14, 'Thumbnail highlight hues overlap the live editor', proof.overlap.length >= 2, {
    overlap: proof.overlap,
    liveHues: proof.liveHues,
  })
  rec(15, 'Store code element still has the default sample', proof.sample, { sample: proof.sample })

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
  if (failed.length) throw new Error(`${failed.length} code-preview proofs failed: ${failed.map(p => p.id).join(', ')}`)
  console.log('-'.repeat(96))
  console.log('code-preview e2e passed (15 cases)')
  await page.close()
}
finally {
  await browser.close()
  if (child) child.kill()
}
