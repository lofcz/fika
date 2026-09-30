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
const temp = await mkdtemp(join(tmpdir(), 'fika-persistence-'))
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
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  await page.waitForFunction(() => window.fika)
  await page.evaluate(async () => {
    const doc = { title: 'First deck', slides: [{ id: 'first', elements: [{ id: 'text', type: 'text', left: 100, top: 100, width: 600, height: 100, rotate: 0, content: '<p>Before</p>', defaultFontName: 'Arial', defaultColor: '#222' }] }] }
    window.saved = []
    window.controller = (await window.fika.mountFika(document.getElementById('host'), {
      document: doc, locale: 'en', assetBaseUrl: '/fika-assets',
      onChange: value => window.saved.push(value),
    })).controller
  })
  const editor = page.locator('#editable-element-text .ProseMirror')
  await editor.waitFor({ state: 'visible' })
  const box = await editor.boundingBox()
  await page.mouse.dblclick(box.x + 15, box.y + box.height / 2)
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText('Saved before teardown')
  await page.evaluate(() => window.controller.destroy())
  const saved = await page.evaluate(() => window.saved.at(-1))
  assert.match(saved.slides[0].elements[0].content, /Saved before teardown/)
  console.log('PASS: built embed emits pending text before destroy')

  const isolation = await page.evaluate(async () => {
    const firstCount = window.saved.length
    const host = document.getElementById('host')
    host.style.display = 'none'
    const doc = { title: 'Second deck', slides: [{ id: 'second', elements: [] }] }
    const controller = (await window.fika.mountFika(host, { document: doc, assetBaseUrl: '/fika-assets' })).controller
    const other = document.createElement('div')
    document.body.appendChild(other)
    const error = await window.fika.mountFika(other, { document: { ...doc, title: 'Must never apply' } }).then(() => '', e => e.message)
    window.controller = controller
    return { error, title: controller.getDocument().title, firstCount, currentCount: window.saved.length }
  })
  assert.match(isolation.error, /one active editor/)
  assert.equal(isolation.title, 'Second deck')
  assert.equal(isolation.firstCount, isolation.currentCount)
  await page.evaluate(() => { document.getElementById('host').style.display = '' })
  await page.waitForFunction(() => {
    const canvas = document.querySelector('[data-fika-canvas] .viewport')
    return canvas && new DOMMatrix(getComputedStyle(canvas).transform).a > 0
  })
  await page.evaluate(() => window.controller.destroy())
  console.log('PASS: concurrent mounts cannot overwrite another deck; hidden mount recovers its viewport')
  assert.deepEqual(errors, [])
} finally {
  await browser.close()
  await new Promise(resolve => server.close(resolve))
  await rm(temp, { recursive: true, force: true })
}
