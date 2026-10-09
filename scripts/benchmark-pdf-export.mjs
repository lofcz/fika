/** Reproducible browser PDF benchmark: SLIDES=40 NOISE=1 MAX_MS=2000.
 * BENCH_DIST can point at an unpacked release's dist/embed for comparison.
 * The default fixture has four illustrations per slide; NOISE stresses encoding.
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { chromium } from 'playwright'
import { PDFDocument } from 'pdf-lib'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const temp = await mkdtemp(join(tmpdir(), 'fika-export-'))
const imports = {}
for (const [index, name] of ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/compiler-runtime'].entries()) {
  const entry = join(temp, `entry-${index}.js`)
  const exports = Object.keys(require(name)).filter(key => key !== 'default' && /^[a-zA-Z_$][\w$]*$/.test(key))
  await writeFile(entry, `import value from ${JSON.stringify(require.resolve(name))}; export default value; ${exports.map(key => `export const ${key} = value.${key};`).join('\n')}`)
  execFileSync('bun', ['build', entry, '--target=browser', '--format=esm', '--define=process.env.NODE_ENV="production"', '--external=react', '--external=react-dom', '--outfile', join(temp, `${index}.js`)], { stdio: 'pipe', cwd: root })
  imports[name] = `/vendor/${index}.js`
}
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    if (path === '/create/export-regression') {
      res.setHeader('Content-Type', 'text/html')
      res.end(`<script type="importmap">${JSON.stringify({ imports })}</script><link rel="stylesheet" href="/fika-assets/fika-embed.css"><div id="host" style="height:800px"></div><script type="module">window.fika = await import('/fika-assets/fika-embed.js')</script>`)
      return
    }
    const file = path.startsWith('/vendor/') ? join(temp, path.slice(8)) : join(process.env.BENCH_DIST || join(root, 'dist/embed'), path.replace(/^\/fika-assets\//, ''))
    const types = { js: 'text/javascript', css: 'text/css', woff2: 'font/woff2', json: 'application/json', png: 'image/png' }
    res.setHeader('Content-Type', types[file.split('.').pop()] || 'application/octet-stream')
    res.end(await readFile(file))
  } catch { res.writeHead(404).end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
const errors = []
page.on('pageerror', error => { errors.push(error.message); console.error('Browser error:', error.stack) })
page.on('console', msg => { if (msg.type() === 'error') console.error(msg.text()) })
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/create/export-regression`)
  await page.waitForFunction(() => window.fika, { timeout: 30000 })
  const result = await page.evaluate(async ({ count, noise }) => {
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 800
    const ctx = canvas.getContext('2d')
    const pixels = ctx.createImageData(1200, 800)
    let seed = 42
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0
      pixels.data[i] = seed & 255; pixels.data[i+1] = (seed >>> 8) & 255; pixels.data[i+2] = (seed >>> 16) & 255; pixels.data[i+3] = 255
    }
    ctx.putImageData(pixels, 0, 0)
    if (!noise) {
      const gradient = ctx.createLinearGradient(0, 0, 1200, 800)
      gradient.addColorStop(0, '#245b84'); gradient.addColorStop(1, '#d4ae73')
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1200, 800)
      for (let i = 0; i < 80; i++) {
        ctx.fillStyle = `hsl(${i * 23} 40% 60%)`
        ctx.beginPath(); ctx.arc((i * 137) % 1200, (i * 97) % 800, 20 + i % 70, 0, Math.PI * 2); ctx.fill()
      }
    }
    const src = URL.createObjectURL(await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9)))
    const deck = { title: 'Image-rich benchmark', viewport: { size: 1000, ratio: 0.5625 }, slides: Array.from({ length: count }, (_, i) => ({
      id: `slide-${i}`, background: { type: 'solid', color: '#ffffff' }, elements: [
        ...Array.from({ length: 4 }, (_, j) => ({ id: `img-${i}-${j}`, type: 'image', src, left: (j % 2) * 500, top: Math.floor(j / 2) * 250, width: 480, height: 240, rotate: 0, fixedRatio: true })),
        { id: `text-${i}`, type: 'text', left: 30, top: 505, width: 900, height: 50, rotate: 0, content: `<p>Slide ${i + 1}: Příliš žluťoučký kůň</p>`, defaultFontName: 'Arial', defaultColor: '#111111' },
      ],
    })) }
    const samples = []
    const started = performance.now()
    const blob = await window.fika.exportPresentationPdf(deck, { assetBaseUrl: '/fika-assets', watermark: null, onProgress: (_, __, detail) => samples.push(detail.progress) })
    const ms = performance.now() - started
    const dataUrl = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob) })
    return { ms, samples, dataUrl }
  }, { count: Number(process.env.SLIDES || 40), noise: process.env.NOISE === '1' })
  const pdf = await PDFDocument.load(Buffer.from(result.dataUrl.split(',')[1], 'base64'))
  assert.equal(pdf.getPageCount(), Number(process.env.SLIDES || 40))
  assert(result.samples.every((v, i, a) => i === 0 || v >= a[i - 1]))
  assert.equal(result.samples.at(-1), 1)
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ slides: pdf.getPageCount(), ms: Math.round(result.ms), bytes: Buffer.from(result.dataUrl.split(',')[1], 'base64').length }))
  if (process.env.MAX_MS) assert(result.ms < Number(process.env.MAX_MS), `Export took ${result.ms}ms`)
} finally {
  await browser.close()
  await new Promise(resolve => server.close(resolve))
  await rm(temp, { recursive: true, force: true })
}
