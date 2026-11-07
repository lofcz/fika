/** Built-package proof: headless archive export and the editor download use the same math pipeline. */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { chromium } from 'playwright'
import JSZip from 'jszip'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const temp = await mkdtemp(join(tmpdir(), 'fika-table-math-'))
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
    res.setHeader('Content-Type', { js: 'text/javascript', css: 'text/css', woff2: 'font/woff2' }[file.split('.').pop()] || 'application/octet-stream')
    res.end(await readFile(file))
  } catch { res.writeHead(404).end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH })
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  await page.waitForFunction(() => !!window.fika)
  const output = await page.evaluate(async () => {
    const cell = text => ({ id: crypto.randomUUID(), text, colspan: 1, rowspan: 1, style: { color: '#2B3445', fontsize: '24px', fontname: 'Calibri' } })
    const deck = { title: 'Table equations', viewport: { size: 1280, ratio: 0.5625 }, slides: [{ id: 'math', elements: [{
      id: 'table', type: 'table', left: 72, top: 148, width: 1136, height: 240, rotate: 0,
      colWidths: [0.5, 0.5], cellMinHeight: 80, outline: { color: '#E3DFD6', width: 1, style: 'solid' },
      data: [
        [cell(String.raw`Obvod \(O\) a obsah \(S\)`), cell('Bez vzorca')],
        [cell(String.raw`\(a^2\)`), cell(String.raw`\(a \cdot v_a = \frac{e \cdot f}{2}\)`)],
        [cell(String.raw`Výška \(v_a\) a text za vzorcom.`), cell('Prvý riadok\n$90^\\circ$\nPosledný riadok')],
        [{ ...cell('<p>Rich <strong>bold</strong> <em>italic</em> <span style="font-size:32px;color:#167438"><span class="fika-math" data-latex="x^2"></span></span> after</p><p></p><p>Last line</p>'), textFormat: 'html', style: { fontsize: '24px', color: '#2B3445', vAlign: 'bottom' } },
          { ...cell('<p><u>underlined</u> <s>removed</s> H<sub>2</sub>O</p>'), textFormat: 'html' }],
      ],
    }] }] }
    const options = { assetBaseUrl: '/fika-assets', watermark: null }
    const archive = await window.fika.exportPresentationPptx(deck, options)
    const { controller } = await window.fika.mountFika(document.getElementById('host'), { document: deck, locale: 'sk', ...options })
    window.tableProofController = controller
    window.tableProofSource = () => JSON.stringify(controller.getDocument().slides[0].elements.find(el => el.id === 'table').data.map(row => row.map(cell => cell.text)))
    window.tableProofBefore = window.tableProofSource()
    return Array.from(new Uint8Array(await archive.arrayBuffer()))
  })
  const verify = async bytes => {
    const zip = await JSZip.loadAsync(bytes)
    const xml = await zip.file('ppt/slides/slide1.xml').async('string')
    const table = xml.match(/<a:tbl>[\s\S]*?<\/a:tbl>/)[0]
    const firstCell = table.match(/<a:tc>[\s\S]*?<\/a:tc>/)[0]
    assert.equal((firstCell.match(/<a:p>/g) || []).length, 1, 'Inline equations and surrounding prose share one paragraph')
    assert.equal((table.match(/<m:oMath[ >]/g) || []).length, 7)
    for (const tag of ['m:f', 'm:sSub', 'm:sSup']) assert.ok(table.includes(`<${tag}>`))
    for (const text of [' a obsah ', ' a text za vzorcom.', 'Prvý riadok', 'Posledný riadok', 'Bez vzorca']) assert.ok(table.includes(`<a:t>${text}</a:t>`))
    assert.doesNotMatch(table, /\\\(|\\frac|\$90/)
    assert.match(table, /b="1"[^>]*>[\s\S]*?<a:t>bold<\/a:t>/)
    assert.match(table, /i="1"[^>]*>[\s\S]*?<a:t>italic<\/a:t>/)
    assert.match(table, /sz="1800"[^>]*>[\s\S]*?val="167438"/)
    assert.ok(table.includes('anchor="b"'), 'Cell vertical alignment is exported')
    assert.ok(table.includes('<a:t>Last line</a:t>'))
  }
  await verify(Uint8Array.from(output))
  await page.locator('[data-editor-tool="export"]').click()
  const download = page.waitForEvent('download', { timeout: 90_000 })
  await page.locator('[data-export-format="pptx"]').click()
  await verify(await readFile(await (await download).path()))
  assert.equal(await page.evaluate(() => window.tableProofSource() === window.tableProofBefore), true, 'export never mutates stored cell text')
  const imported = await page.evaluate(async bytes => {
    await window.tableProofController.importPptx(new Uint8Array(bytes).buffer)
    return window.tableProofController.getDocument().slides.flatMap(slide => slide.elements.filter(el => el.type === 'table'))
  }, output)
  assert.equal(imported.length, 1)
  const importedCells = imported[0].data.flat()
  assert.ok(importedCells.every(cell => cell.textFormat === 'html'))
  const rich = importedCells.find(cell => cell.text.includes('Last line'))
  assert.ok(rich, 'Rich cell survives native PowerPoint import')
  const importedStyle = await page.evaluate(html => {
    const el = document.createElement('div')
    el.innerHTML = html
    return { bold: el.querySelector('strong')?.textContent, italic: el.querySelector('em')?.textContent }
  }, rich.text)
  assert.equal(importedStyle.bold, 'bold')
  assert.equal(importedStyle.italic, 'italic')
  assert.match(rich.text, /data-latex=/)
  const apiProof = await page.evaluate(async () => {
    const api = window.tableProofController
    const table = () => api.getDocument().slides.flatMap(slide => slide.elements).find(el => el.type === 'table')
    const id = table().id
    const source = '<p><strong>Pri<em>ce</em></strong> <span class="fika-math" data-latex="secret_x"></span> Price</p>'
    const check = result => { if (!result.ok) throw new Error(JSON.stringify(result)); return result.data }
    check(await api.tables.setCell(id, 0, 0, { text: source, textFormat: 'html' }))
    const count = check(await api.search.find('Price')).count
    const sourceCount = check(await api.search.find('secret_x')).count
    const replaced = check(await api.search.replace('Price', '<i>&', { replaceAll: true })).count
    const html = table().data[0][0].text
    check(await api.history.undo())
    const undo = table().data[0][0].text
    check(await api.tables.setCellStyle(id, 0, 0, { color: '#123456', bold: false }))
    const styled = table().data[0][0].text
    check(await api.tables.setCell(id, 0, 0, { text: '<b>literal</b>' }))
    return { count, sourceCount, replaced, html, undo, source, styled, plain: table().data[0][0] }
  })
  assert.equal(apiProof.count, 2, 'Search matches visible text across inline marks')
  assert.equal(apiProof.sourceCount, 0, 'Search excludes equation source and HTML attributes')
  assert.equal(apiProof.replaced, 2)
  assert.match(apiProof.html, /<strong>&lt;i&gt;&amp;/)
  assert.match(apiProof.html, /data-latex="secret_x"/)
  assert.equal(apiProof.undo, apiProof.source)
  assert.doesNotMatch(apiProof.styled, /<strong>/)
  assert.match(apiProof.styled, /color: rgb\(18, 52, 86\)/)
  assert.equal(apiProof.plain.textFormat, undefined, 'Replacing cell text without a format restores literal plain text')
  assert.equal(apiProof.plain.text, '<b>literal</b>')
  assert.deepEqual(errors, [])
  console.log('PASS table rich text: native math, formatting and line breaks through PPTX export/import, source unchanged, API search/replacement/styles and plain-text compatibility.')
} finally {
  await browser.close()
  await new Promise(resolve => server.close(resolve))
  await rm(temp, { recursive: true, force: true })
}
