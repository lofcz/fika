/** Tests the built npm embed, with local React shims and no dev-server dependency. */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { inflateSync } from 'node:zlib'
import { chromium } from 'playwright'
import JSZip from 'jszip'
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
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
    if (path === '/') {
      res.setHeader('Content-Type', 'text/html')
      res.end(`<script type="importmap">${JSON.stringify({ imports })}</script><link rel="stylesheet" href="/fika-assets/fika-embed.css"><div id="host" style="height:800px"></div><script type="module">window.fika = await import('/fika-assets/fika-embed.js')</script>`)
      return
    }
    const file = path.startsWith('/vendor/') ? join(temp, path.slice(8)) : join(root, 'dist/embed', path.replace(/^\/fika-assets\//, ''))
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
let downloads = 0
page.on('download', () => downloads++)
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  await page.waitForFunction(() => window.fika, { timeout: 30000 })
  const output = await page.evaluate(async () => {
    const deck = {
      title: 'Export regression', viewport: { size: 1000, ratio: 0.75 },
      slides: [
        { id: 'first', background: { type: 'solid', color: '#ff0000' }, elements: [{ id: 'text', type: 'text', left: 50, top: 50, width: 700, height: 100, rotate: 0, content: '<p>Editable Czech: Příliš žluťoučký kůň</p>', defaultFontName: 'Arial', defaultColor: '#ffffff' }] },
        { id: 'second', background: { type: 'solid', color: '#0000ff' }, elements: [] },
      ],
    }
    const options = { assetBaseUrl: '/fika-assets', watermark: null }
    const originalClick = HTMLAnchorElement.prototype.click
    // First export is deliberately before any editor mount.
    const first = await window.fika.exportPresentationPptx(deck, options)
    const { controller } = await window.fika.mountFika(document.getElementById('host'), { document: structuredClone(deck), locale: 'en', assetBaseUrl: '/fika-assets' })
    await new Promise(resolve => setTimeout(resolve, 500))
    const before = JSON.stringify(controller.getDocument())
    const element = document.querySelector('.fika-embed-app')
    const observerRecords = []
    const observer = new MutationObserver(records => observerRecords.push(...records))
    observer.observe(document.getElementById('host'), { childList: true })
    const pdfPromise = window.fika.exportPresentationPdf(deck, { ...options, width: 2560 })
    deck.slides.reverse() // The asynchronous export must retain its original snapshot.
    const pdf = await pdfPromise
    const other = { ...deck, title: 'Other deck', viewport: { size: 500, ratio: 1.5 }, slides: [deck.slides[0]] }
    const portrait = await window.fika.exportPresentationPdf(other, { ...options, width: 1280 })
    const pptx = await window.fika.exportPresentationPptx(other, options)
    const emptyError = await window.fika.exportPresentationPdf({ ...deck, slides: [] }, options).then(() => '', e => e.message)
    const markError = await window.fika.exportPresentationPdf(deck, { ...options, watermark: () => { throw new Error('watermark unavailable') } }).then(() => '', e => e.message)
    const canvas = document.createElement('canvas'); canvas.width = 10; canvas.height = 10
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#00ff00'; ctx.fillRect(0, 0, 10, 10)
    const marked = await window.fika.exportPresentationPdf(other, { ...options, watermark: () => ({ image: canvas.toDataURL(), opacity: 0.5 }) })
    observer.disconnect()
    const result = {
      first: Array.from(new Uint8Array(await first.arrayBuffer())),
      pptx: Array.from(new Uint8Array(await pptx.arrayBuffer())),
      pdf: Array.from(new Uint8Array(await pdf.arrayBuffer())),
      portrait: Array.from(new Uint8Array(await portrait.arrayBuffer())),
      marked: Array.from(new Uint8Array(await marked.arrayBuffer())),
      unchanged: before === JSON.stringify(controller.getDocument()),
      mounted: element.isConnected && element === document.querySelector('.fika-embed-app'),
      dialogs: document.querySelectorAll('[data-export-format]').length,
      clicksUnchanged: originalClick === HTMLAnchorElement.prototype.click,
      emptyError, markError,
    }
    window.controller = controller
    return result
  })
  assert.equal(output.unchanged, true)
  assert.equal(output.mounted, true)
  assert.equal(output.dialogs, 0)
  assert.equal(output.clicksUnchanged, true)
  assert.equal(downloads, 0)
  assert.match(output.emptyError, /no slides/)
  assert.equal(output.markError, 'watermark unavailable')
  assert.deepEqual(errors, [])
  const pptx = await JSZip.loadAsync(Uint8Array.from(output.first))
  assert.match(await pptx.file('ppt/slides/slide1.xml').async('string'), /Editable Czech/)
  assert.ok(pptx.file('ppt/slides/slide2.xml'))
  const other = await JSZip.loadAsync(Uint8Array.from(output.pptx))
  assert.equal(other.file('ppt/slides/slide2.xml'), null)
  assert.match(await other.file('ppt/presentation.xml').async('string'), /cy="13716000"/)
  const pdf = await PDFDocument.load(Uint8Array.from(output.pdf))
  assert.equal(pdf.getPageCount(), 2)
  for (const p of pdf.getPages()) assert.deepEqual(p.getSize(), { width: 720, height: 540 })
  const images = pdf.context.enumerateIndirectObjects().map(([, value]) => value).filter(value => value instanceof PDFRawStream && value.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'))
  assert.ok(images.some(image => image.dict.get(PDFName.of('Width')).asNumber() === 2560))
  assert.deepEqual(Array.from(inflateSync(images[0].contents).subarray(0, 3)), [255, 0, 0])
  assert.deepEqual(Array.from(inflateSync(images[1].contents).subarray(0, 3)), [0, 0, 255])
  const portrait = await PDFDocument.load(Uint8Array.from(output.portrait))
  assert.deepEqual(portrait.getPage(0).getSize(), { width: 720, height: 1080 })
  const marked = await PDFDocument.load(Uint8Array.from(output.marked))
  assert.ok(marked.context.enumerateIndirectObjects().filter(([, value]) => value instanceof PDFRawStream && value.dict.get(PDFName.of('Subtype')) === PDFName.of('Image')).length >= 2)
  await page.locator('[data-editor-tool="export"]').click()
  await page.locator('[data-export-format="pptx"]').waitFor()
  const downloadPromise = page.waitForEvent('download')
  await page.locator('[data-export-format="pdf"]').click()
  const download = await downloadPromise
  assert.match(download.suggestedFilename(), /\.pdf$/)
  const nativePdf = await PDFDocument.load(await readFile(await download.path()))
  assert.equal(nativePdf.getPageCount(), 2)
  await page.evaluate(() => window.controller.destroy())
  console.log('Presentation export: editable PPTX, 2560px PDF, snapshot isolation, portrait dimensions, watermark, errors, no modal/download/remount passed.')
} finally {
  await browser.close()
  await new Promise(resolve => server.close(resolve))
  await rm(temp, { recursive: true, force: true })
}
