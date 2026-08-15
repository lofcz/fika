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
  await page.getByText('Add slide').waitFor({ timeout: 15000 })
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
    const waitPaint = async () => {
      const t0 = Date.now()
      while (Date.now() - t0 < 12000) {
        const host = document.querySelector('[data-thumbnail-slide]')
        const canvas = host && host.querySelector('canvas')
        if (canvas && !host.hasAttribute('data-raster-pending') && canvas.width > 8) return { host, canvas }
        await sleep(80)
      }
      const host = document.querySelector('[data-thumbnail-slide]')
      return { host, canvas: host && host.querySelector('canvas'), timeout: true }
    }
    const { host, canvas, timeout } = await waitPaint()
    if (!canvas) {
      return { pending: true, timeout: !!timeout, chromatic: 0, hues: [], darkShare: 0, whiteShare: 0, gutterInk: 0 }
    }

    const box = document.querySelector('[data-element-type=code] [data-live-box]')
    let positioned = box
    while (positioned && !positioned.style.left) positioned = positioned.parentElement
    const slideWidth = 1000
    const slideHeight = 562.5
    const el = {
      left: parseFloat(positioned?.style.left || '0'),
      top: parseFloat(positioned?.style.top || '0'),
      width: parseFloat(positioned?.style.width || '0'),
      height: parseFloat(positioned?.style.height || '0'),
    }
    const sx = canvas.width / slideWidth
    const sy = canvas.height / slideHeight
    const rx = Math.max(0, Math.round(el.left * sx))
    const ry = Math.max(0, Math.round(el.top * sy))
    const rw = Math.max(4, Math.round(el.width * sx))
    const rh = Math.max(4, Math.round(el.height * sy))

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const { data } = ctx.getImageData(rx, ry, Math.min(rw, canvas.width - rx), Math.min(rh, canvas.height - ry))

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

    let dark = 0
    let nearWhite = 0
    let chromatic = 0
    let gutterInk = 0
    const hues = new Map()
    const w = Math.min(rw, canvas.width - rx)
    const h = Math.min(rh, canvas.height - ry)
    const gutterRight = Math.max(3, Math.round(w * 0.14))
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        const a = data[i + 3]
        if (a < 20) continue
        const max = Math.max(r, g, b)
        const min = Math.min(r, g, b)
        if (max < 48) {
          dark += 1
          continue
        }
        const sat = max === 0 ? 0 : (max - min) / max
        if (sat < 0.12 && max > 200) {
          nearWhite += 1
          continue
        }
        const hue = hueOf(r, g, b)
        if (hue != null) {
          chromatic += 1
          hues.set(hue, (hues.get(hue) || 0) + 1)
        }
        else if (x < gutterRight && sat < 0.18 && max > 55 && max < 190) {
          gutterInk += 1
        }
      }
    }
    const inked = dark + nearWhite + chromatic + gutterInk
    const liveColors = [...document.querySelectorAll('[data-element-type=code] .line span[style*="color"]')].map(el => {
      const m = (el.getAttribute('style') || '').match(/color:\s*([^;]+)/i)
      return (m?.[1] || '').trim()
    })
    const liveHues = new Set()
    for (const raw of liveColors) {
      const hex = raw.match(/#([0-9a-fA-F]{3,8})/)
      const rgb = raw.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
      let r = 0
      let g = 0
      let b = 0
      if (hex) {
        let h = hex[1]
        if (h.length === 3) h = h.split('').map(c => c + c).join('')
        r = parseInt(h.slice(0, 2), 16)
        g = parseInt(h.slice(2, 4), 16)
        b = parseInt(h.slice(4, 6), 16)
      }
      else if (rgb) {
        r = Number(rgb[1])
        g = Number(rgb[2])
        b = Number(rgb[3])
      }
      else continue
      const hue = hueOf(r, g, b)
      if (hue != null) liveHues.add(hue)
    }
    const thumbHues = [...hues.entries()].filter(([, n]) => n >= 4).map(([hue]) => hue)
    const overlap = thumbHues.filter(hue => [...liveHues].some(live => Math.abs(live - hue) <= 20 || Math.abs(live - hue) >= 340))
    const hasRed = thumbHues.some(hue => hue <= 40 || hue >= 340)
    const hasBlue = thumbHues.some(hue => hue >= 180 && hue <= 260)
    const liveText = (document.querySelector('[data-element-type=code]')?.innerText || '').replace(/\s+/g, ' ')
    return {
      pending: host.hasAttribute('data-raster-pending'),
      timeout: !!timeout,
      canvas: { w: canvas.width, h: canvas.height },
      el,
      region: { rx, ry, rw: w, rh: h },
      darkShare: inked ? dark / inked : 0,
      whiteShare: inked ? nearWhite / inked : 0,
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
  rec(13, 'Thumbnail left gutter has dim numeral ink', proof.gutterInk > 8, { gutterInk: proof.gutterInk })
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
