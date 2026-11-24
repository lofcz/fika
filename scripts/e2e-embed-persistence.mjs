/** Tests the built npm embed, with local React shims and no dev-server dependency. */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { findBun } from './find-bun.mjs'
import { inflateSync } from 'node:zlib'
import { chromium } from 'playwright'
import JSZip from 'jszip'
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const embedDir = resolve(process.env.FIKA_EMBED_DIST ?? join(root, 'dist/embed'))
const require = createRequire(import.meta.url)
const bun = findBun()
if (!bun) throw new Error('The embed browser fixture requires Bun')
const temp = await mkdtemp(join(tmpdir(), 'fika-persistence-'))
const imports = {}
for (const [index, name] of ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/compiler-runtime'].entries()) {
  const entry = join(temp, `entry-${index}.js`)
  const exports = Object.keys(require(name)).filter(key => key !== 'default' && /^[a-zA-Z_$][\w$]*$/.test(key))
  await writeFile(entry, `import value from ${JSON.stringify(require.resolve(name))}; export default value; ${exports.map(key => `export const ${key} = value.${key};`).join('\n')}`)
  execFileSync(bun, ['build', entry, '--target=browser', '--format=esm', '--define=process.env.NODE_ENV="production"', '--external=react', '--external=react-dom', '--outfile', join(temp, `${index}.js`)], { stdio: 'pipe', cwd: root })
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
    const file = path.startsWith('/vendor/') ? join(temp, path.slice(8)) : join(embedDir, path.replace(/^\/fika-assets\//, ''))
    const types = { js: 'text/javascript', css: 'text/css', woff2: 'font/woff2', json: 'application/json', png: 'image/png' }
    res.setHeader('Content-Type', types[file.split('.').pop()] || 'application/octet-stream')
    res.end(await readFile(file))
  } catch { res.writeHead(404).end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const browser = await chromium.launch({ headless: true, args: ['--no-proxy-server', '--disable-gpu'], ...(process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {}) })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
await page.route(/^https?:\/\//, route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort())
const errors = []
page.on('pageerror', error => { errors.push(error.message); console.error('Browser error:', error.stack) })
page.on('console', msg => {
  if (msg.type() === 'error') console.error(msg.text())
  if (/two children with the same key/i.test(msg.text())) errors.push(msg.text())
})
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'commit' })
  await page.waitForFunction(() => window.fika)
  const review = {
    id: 'review', name: 'Board review', cover: '', origin: 'host',
    description: 'Quarterly financial results', categories: [' Report ', 'Briefing'],
    tags: ['Finance', 'Quarterly '], useWhen: 'Reporting results', avoidWhen: 'Launching a product',
  }
  const classic = { id: 'classic', name: 'Classic', cover: '' }
  const loaderOnly = { id: 'legacy', name: 'legacy', cover: '' }
  const catalog = await page.evaluate(async ({ review, classic }) => {
    const host = document.getElementById('host')
    const calls = []
    const load = (id, payload) => async () => { calls.push(id); return payload }
    const mount = async options => (await window.fika.mountFika(host, {
      assetBaseUrl: '/fika-assets', document: { title: 'Catalog', slides: [] }, ...options,
    })).controller
    const controller = await mount({
      templates: [review, classic, { id: 'unregistered', name: 'Picker only', cover: '' }],
      templateLoaders: {
        legacy: load('legacy', [{ id: 'one', type: 'cover', elements: [] }]),
        classic: load('classic', []), review: load('review', { slides: [] }),
      },
    })
    const all = controller.templates.catalog()
    const detached = controller.templates.catalog()[0]
    detached.categories.length = 0
    detached.tags.push('caller edit')
    const queries = [
      undefined, { category: '  ', tags: [' '] }, { category: 'briefing' }, { tags: [' fINAnce '] },
      { category: 'REPORT', tags: [' quarterly', 'FINANCE'] }, { tags: ['finance', 'missing'] },
      { category: 'other', tags: ['finance'] }, { category: 'rep' }, { tags: ['quart'] },
    ]
    const filtered = []
    for (const query of queries) {
      const result = await controller.execute({ type: 'templates.catalog', payload: query })
      if (!result.ok || result.changed) throw new Error(JSON.stringify(result))
      filtered.push([controller.templates.catalog(query), result.data])
    }
    const updated = { ...review, description: '', tags: ['Annual', 'Finance'], avoidWhen: 'New audience' }
    const set = await controller.deck.setTemplates([updated], { commit: false })
    const saved = controller.export.json()
    await controller.deck.setTemplates([], { commit: false })
    const restored = await controller.import.json(saved, { commit: false })
    const roundTrip = controller.templates.catalog()[0]
    const invalid = await controller.execute({
      type: 'deck.setTemplates', payload: { templates: [{ ...review, tags: [false] }] },
    })
    const afterInvalid = controller.deck.get().templates
    const discoveryCalls = [...calls]
    const slides = await controller.templates.slidesCatalog('legacy')
    await controller.templates.slidesCatalog('review')
    controller.destroy()
    const remounted = await mount({ templateLoaders: { review: load('second', { slides: [] }) } })
    const remountedCatalog = remounted.templates.catalog()
    const second = await remounted.templates.slidesCatalog('review')
    remounted.destroy()
    return { all, filtered, set, saved, restored, roundTrip, invalid, afterInvalid, discoveryCalls,
      slides, remountedCatalog, second, calls }
  }, { review, classic })
  const all = [review, classic, loaderOnly]
  assert.deepEqual(catalog.all, all)
  const expected = [all, all, [review], [review], [review], [], [], [], []]
  assert.deepEqual(catalog.filtered, expected.map(matches => [matches, matches]))
  const updated = { ...review, description: '', tags: ['Annual', 'Finance'], avoidWhen: 'New audience' }
  assert.deepEqual(catalog.set.data, [updated])
  assert.deepEqual(catalog.saved.templates, [updated])
  assert.deepEqual(catalog.restored.data.templates, [updated])
  assert.deepEqual(catalog.roundTrip, updated)
  assert.equal(catalog.invalid.errors[0].path, 'payload.templates[0].tags')
  assert.deepEqual(catalog.afterInvalid, [updated])
  assert.deepEqual(catalog.discoveryCalls, [])
  assert.equal(catalog.slides.data.byType.cover[0].slug, 'cover_1')
  assert.deepEqual(catalog.remountedCatalog, [{ id: 'review', name: 'review', cover: '' }])
  assert.equal(catalog.second.data.slideCount, 0)
  assert.deepEqual(catalog.calls, ['legacy', 'review', 'second'])
  console.log('PASS: template discovery round-trips metadata, filters both APIs and leaves legacy loaders lazy')
  const copies = await page.evaluate(async () => {
    const base = { left: 30, top: 60, width: 200, height: 80, rotate: 0 }
    const source = {
      id: 'cover', type: 'cover', remark: 'Speaker notes', sourcePackageId: 'package',
      elements: [
        { ...base, type: 'shape', id: 'frame', frame: { clipContent: true }, fixedRatio: false,
          viewBox: [100, 100], path: 'M0 0H100V100H0Z', fill: '#ffffff' },
        { ...base, type: 'text', id: 'title', parentFrameId: 'frame', groupId: 'pair',
          link: { type: 'slide', target: 'cover' }, placeholder: 'Heading', content: '<p>Original</p>',
          defaultColor: '#222222', defaultFontName: 'Arial' },
        { type: 'line', id: 'arrow', parentFrameId: 'frame', groupId: 'pair', left: 45, top: 160,
          width: 2, start: [0, 0], end: [90, 0], points: ['', 'arrow'], style: 'solid', color: '#333333',
          link: { type: 'slide', target: 'other' },
          source: { packageId: 'package', partPath: 'ppt/slides/slide1.xml', objectId: 'arrow' } },
        { ...base, type: 'table', id: 'table', top: 200, parentFrameId: 'frame', colWidths: [1],
          cellMinHeight: 30, outline: { width: 1, style: 'solid', color: '#333333' },
          data: [[{ id: 'cell', colspan: 1, rowspan: 1, text: 'Original cell' }]] },
      ],
      animations: [{ id: 'anim', elId: 'arrow', effect: 'fadeIn', type: 'in', duration: 500, trigger: 'click' }],
      notes: [{ id: 'note', elId: 'title', user: 'Host', time: 1, content: 'Comment',
        replies: [{ id: 'reply', user: 'Host', time: 2, content: 'Reply' }] }],
      guides: [{ id: 'guide', axis: 'x', position: 30 }],
      workspaceLabels: [{ id: 'section-label', kind: 'section', text: 'Pages', pageIds: ['cover', 'other'], x: 0, y: 0, fontSize: 16 }],
    }
    const before = structuredClone(source)
    const loads = []
    const controller = (await window.fika.mountFika(document.getElementById('host'), {
      document: { title: 'Template copies', slides: [structuredClone(source), { id: 'other', elements: [] }] }, assetBaseUrl: '/fika-assets',
      templateLoaders: {
        card: async () => { loads.push('card'); return { slides: [source] } },
        legacy: async () => { loads.push('legacy'); return [source] },
      },
    })).controller
    const results = []
    for (const templateId of ['card', 'card', 'legacy', 'legacy']) {
      const existing = controller.getDocument().slides
      const result = await controller.slides.insertFromTemplate({ templateId, slug: 'cover_1' })
      if (!result.ok) throw new Error(JSON.stringify(result.errors))
      if (existing.some(slide => slide.id === result.data.slideId)) throw new Error(`Template reused slide ID ${result.data.slideId}`)
      results.push(result.data)
      // Exercise the deck-wide lookup the editor uses, with no slide ID to disambiguate it.
      const edit = await controller.text.setContent(result.data.textElementIds[0], `<p>Copy ${results.length}</p>`)
      if (!edit.ok) throw new Error(JSON.stringify(edit.errors))
    }
    const saved = controller.export.json()
    sessionStorage.setItem('template-copies', JSON.stringify(saved))
    const catalog = await controller.templates.slidesCatalog('card')
    controller.destroy()
    return { before, source, loads, results, saved, preview: catalog.data.byType.cover[0].description }
  })
  assert.deepEqual(copies.loads, ['card', 'legacy'])
  assert.deepEqual(copies.source, copies.before)
  assert.equal(copies.preview, 'Original')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.fika)
  const { restored, imported } = await page.evaluate(async () => {
    const saved = JSON.parse(sessionStorage.getItem('template-copies'))
    const controller = (await window.fika.mountFika(document.getElementById('host'), {
      document: saved, assetBaseUrl: '/fika-assets',
    })).controller
    const slides = controller.getDocument().slides
    const result = await controller.import.json(saved, { commit: false })
    if (!result.ok) throw new Error(JSON.stringify(result.errors))
    controller.destroy()
    return { restored: slides, imported: result.data.slides }
  })
  assert.deepEqual(restored, copies.saved.slides)
  assert.deepEqual(imported.slice(2), restored.slice(2))
  assert.equal(restored.length, 6)
  assert.deepEqual(restored[0], copies.before)
  const ids = slide => [slide.id, ...slide.elements.map(el => el.id), slide.elements[1].groupId,
    slide.animations[0].id, slide.notes[0].id, slide.notes[0].replies[0].id,
    slide.guides[0].id, slide.workspaceLabels[0].id, slide.elements[3].data[0][0].id]
  const used = new Set([...ids(restored[0]), 'other'])
  for (const [i, result] of copies.results.entries()) {
    const slide = restored[result.slideIndex - 1]
    const [frame, title, line, table] = slide.elements
    for (const id of ids(slide)) { assert.ok(id && !used.has(id), `reused ID ${id}`); used.add(id) }
    assert.equal(slide.id, result.slideId)
    assert.deepEqual(result.elementIds, slide.elements.map(el => el.id))
    assert.deepEqual(result.textElementIds, [title.id])
    assert.deepEqual(result.placeholderElementIds, [title.id])
    assert.match(title.content, new RegExp(`Copy ${i + 1}`))
    assert.deepEqual([title.parentFrameId, line.parentFrameId, table.parentFrameId], Array(3).fill(frame.id))
    assert.equal(line.groupId, title.groupId)
    assert.equal(title.link.target, slide.id)
    assert.equal(line.link.target, 'other')
    assert.deepEqual(line.end, [90, 0])
    assert.equal(slide.sourcePackageId, copies.before.sourcePackageId)
    assert.deepEqual(line.source, copies.before.elements[2].source)
    assert.equal(table.data[0].length, 1)
    assert.equal(slide.animations[0].elId, line.id)
    assert.equal(slide.notes[0].elId, title.id)
    assert.deepEqual(slide.workspaceLabels[0].pageIds, [slide.id, 'other'])
    assert.equal(slide.remark, 'Speaker notes')
  }
  console.log('PASS: repeated object and legacy array templates keep independent native objects and references after edit and reload')
  const viewportResult = await page.evaluate(async () => {
    const document = {
      title: 'Authored viewport', viewport: { size: 1280, ratio: 9 / 16 },
      slides: [{ id: 'bleed', elements: [{
        id: 'decoration', type: 'shape', left: 52, top: 580, width: 180, height: 200,
        rotate: 0, fill: '#f4dfd2', path: 'M0 0 L100 0 L100 100 L0 100 Z', viewBox: [100, 100], fixedRatio: false,
      }] }],
    }
    const host = window.document.getElementById('host')
    const controller = (await window.fika.mountFika(host, { document, assetBaseUrl: '/fika-assets' })).controller
    const mounted = controller.getDocument()
    const replacement = await controller.execute({
      id: 'replace-bleed', type: 'deck.set', payload: document, meta: { source: 'agent' },
    })
    const saved = controller.getDocument()
    controller.destroy()
    const remounted = (await window.fika.mountFika(host, { document: saved, assetBaseUrl: '/fika-assets' })).controller
    const restored = remounted.getDocument()
    remounted.destroy()
    return { mounted, saved, restored, replacement, expected: document }
  })
  assert.equal(viewportResult.replacement.ok, true, JSON.stringify(viewportResult.replacement))
  for (const stage of ['mounted', 'saved', 'restored']) {
    assert.equal(viewportResult[stage].viewport.size, 1280, stage)
    assert.equal(viewportResult[stage].viewport.ratio, 9 / 16, stage)
    assert.deepEqual(viewportResult[stage].slides, viewportResult.expected.slides, stage)
  }
  console.log('PASS: decorative bleed preserves viewport on mount, agent replacement and remount')
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
  for (const headingFontName of [undefined, 'Montserrat']) {
    const base64 = await page.evaluate(async (display) => {
      const doc = {
        title: 'Theme faces', theme: { fontName: 'Inter', ...(display && { headingFontName: display }) },
        slides: [{ id: 'font-test', elements: [{
          id: 'body', type: 'text', left: 50, top: 50, width: 600, height: 80, rotate: 0,
          defaultFontName: 'Inter', defaultColor: '#222222', content: '<p>Editable evidence</p>',
        }, {
          id: 'picture', type: 'image', left: 50, top: 200, width: 120, height: 120, rotate: 0, fixedRatio: true,
          src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yXTkAAAAASUVORK5CYII=',
          name: 'Survey figure', altText: 'North bank sample on the survey map',
        }] }],
      }
      const blob = await window.fika.exportPresentationPptx(doc, { assetBaseUrl: '/fika-assets' })
      return await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(',')[1])
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(blob)
      })
    }, headingFontName)
    const archive = await JSZip.loadAsync(Buffer.from(base64, 'base64'))
    const theme = await archive.file('ppt/theme/theme1.xml').async('string')
    const major = theme.match(/<a:majorFont\b[^>]*>[\s\S]*?<a:latin\b[^>]*\btypeface="([^"]*)"/)?.[1]
    const minor = theme.match(/<a:minorFont\b[^>]*>[\s\S]*?<a:latin\b[^>]*\btypeface="([^"]*)"/)?.[1]
    assert.equal(major, headingFontName ?? 'Inter')
    assert.equal(minor, 'Inter')
    const presentation = await archive.file('ppt/presentation.xml').async('string')
    for (const face of new Set([major, minor])) assert.ok(presentation.includes('typeface="' + face + '"'), 'Embeds ' + face)
    const slideXml = await archive.file('ppt/slides/slide1.xml').async('string')
    assert.match(slideXml, /Editable evidence/)
    assert.match(slideXml, /descr="North bank sample on the survey map"/)
  }
  console.log('PASS: native PowerPoint preserves distinct heading and body faces, legacy defaults and editable runs')
  assert.deepEqual(errors, [])
} finally {
  await browser.close()
  await new Promise(resolve => server.close(resolve))
  await rm(temp, { recursive: true, force: true })
}
