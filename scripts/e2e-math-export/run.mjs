/**
 * Browser E2E: verify MathLive + html-to-image export produces visible ink.
 * Run: node scripts/e2e-math-export/run.mjs
 */
import { createServer } from 'node:http'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '../..')
const OUT = join(__dirname, 'out')
mkdirSync(OUT, { recursive: true })

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.map': 'application/json',
}

function resolveFile(urlPath) {
  const rel = decodeURIComponent(urlPath).replace(/^\//, '')
  const candidates = [
    join(ROOT, rel),
    join(ROOT, `${rel}.js`),
    join(ROOT, `${rel}.mjs`),
    join(ROOT, rel, 'index.js'),
  ]
  return candidates.find(existsSync) || null
}

const server = createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1')
  let path = url.pathname === '/' ? '/scripts/e2e-math-export/fixture.html' : url.pathname
  const file = resolveFile(path)
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end(`missing ${path}`)
    return
  }
  const body = readFileSync(file)
  res.writeHead(200, {
    'Content-Type': MIME[extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(body)
})

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const { port } = server.address()
const base = `http://127.0.0.1:${port}`
console.log('serving', base)

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
const consoleLines = []
page.on('console', msg => {
  const line = `[${msg.type()}] ${msg.text()}`
  consoleLines.push(line)
  console.log(line)
})
page.on('pageerror', err => {
  const line = `[pageerror] ${err.message}`
  consoleLines.push(line)
  console.error(line)
})
page.on('requestfailed', req => {
  const line = `[requestfailed] ${req.url()} ${req.failure()?.errorText}`
  consoleLines.push(line)
  console.error(line)
})

await page.goto(`${base}/scripts/e2e-math-export/fixture.html`, { waitUntil: 'domcontentloaded', timeout: 60000 })

let summary = null
try {
  await page.waitForFunction(() => window.__MATH_E2E__ != null, null, { timeout: 90000 })
  summary = await page.evaluate(() => window.__MATH_E2E__)
} catch (e) {
  const status = await page.textContent('#status').catch(() => '')
  writeFileSync(join(OUT, 'debug.json'), JSON.stringify({ error: String(e), status, consoleLines }, null, 2))
  await page.screenshot({ path: join(OUT, 'page.png'), fullPage: true })
  console.error('Timed out. status=', status)
  await browser.close()
  server.close()
  process.exit(1)
}

const images = await page.$$eval('#preview img', imgs => imgs.map((img, i) => ({
  i,
  alt: img.alt || `img-${i}`,
  src: img.src,
})))
for (const img of images) {
  if (!img.src.startsWith('data:image/png')) continue
  const b64 = img.src.split(',')[1]
  writeFileSync(join(OUT, `${String(img.alt || img.i).replace(/[^\w.-]+/g, '_')}.png`), Buffer.from(b64, 'base64'))
}

writeFileSync(join(OUT, 'summary.json'), JSON.stringify({ summary, consoleLines }, null, 2))
await page.screenshot({ path: join(OUT, 'page.png'), fullPage: true })

await browser.close()
server.close()

console.log(JSON.stringify(summary, null, 2))
if (!summary.productionOk) {
  console.error('\nFAIL: production-path capture has no visible math ink')
  console.error('productionInk=', summary.productionInk, 'winners=', summary.winners)
  process.exit(1)
}
console.log('\nPASS: production-path has visible math ink')
console.log('production:', summary.recommended, 'ink=', summary.productionInk)
process.exit(0)
