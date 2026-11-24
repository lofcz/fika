/** Tests native AI gap insertion chrome + accessible pending/error image slots in the built embed. */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { findBun } from './find-bun.mjs'
import { chromium } from 'playwright'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const embedDir = resolve(process.env.FIKA_EMBED_DIST ?? join(root, 'dist/embed'))
const require = createRequire(import.meta.url)
const bun = findBun()
if (!bun) throw new Error('The embed browser fixture requires Bun')

const VALID_PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAIAAADwyuo0AAAAEElEQVR4nGPQL0yHIwZkDgBpMgg5zNuQeQAAAABJRU5ErkJggg=='

const temp = await mkdtemp(join(tmpdir(), 'fika-gap-media-'))
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
      res.end(`<script type="importmap">${JSON.stringify({ imports })}</script><link rel="stylesheet" href="/fika-assets/fika-embed.css"><div id="host" style="height:820px;width:1360px"></div><script type="module">window.fika = await import('/fika-assets/fika-embed.js')</script>`)
      return
    }
    if (path === '/broken-image.png') {
      res.writeHead(404).end('not found')
      return
    }
    const file = path.startsWith('/vendor/') ? join(temp, path.slice(8)) : join(embedDir, path.replace(/^\/fika-assets\//, ''))
    const types = { js: 'text/javascript', css: 'text/css', woff2: 'font/woff2', json: 'application/json', png: 'image/png' }
    res.setHeader('Content-Type', types[file.split('.').pop()] || 'application/octet-stream')
    res.end(await readFile(file))
  } catch {
    res.writeHead(404).end()
  }
})

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
const browser = await chromium.launch({
  headless: true,
  args: ['--no-proxy-server', '--disable-gpu'],
  ...(process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {}),
})
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
await page.route(/^https?:\/\//, route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort())

const errors = []
page.on('pageerror', error => { errors.push(error.message); console.error('Browser error:', error.stack) })
page.on('console', msg => {
  if (msg.type() === 'error' && !/404|Failed to load resource/i.test(msg.text())) {
    errors.push(msg.text())
    console.error('Console error:', msg.text())
  }
})

try {
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'commit' })
  await page.waitForFunction(() => window.fika)

  // Mount Fika with host-localized AI gap insert controls and two slides (A has a pending image slot, B is editable).
  await page.evaluate(async () => {
    const host = document.getElementById('host')
    window.__gapRequests = []
    window.__gapCancels = []
    window.__bridgeEvents = []

    const { controller } = await window.fika.mountFika(host, {
      assetBaseUrl: '/fika-assets',
      locale: 'cs',
      aiSlideInsert: {
        enabled: true,
        labels: {
          addWithAi: 'AI snímek',
          addWithAiBeforeFirst: 'Přidat AI snímek na začátek',
          addWithAiBetween: 'Přidat AI snímek mezi {after} a {before}',
          addWithAiAfterLast: 'Přidat AI snímek na konec',
          addBlankSlide: 'Vložit prázdný snímek',
          generating: 'Připravuji snímek…',
          cancel: 'Zrušit generování',
        },
        onRequest: anchor => window.__gapRequests.push(anchor),
        onCancel: detail => window.__gapCancels.push(detail),
      },
      document: {
        title: 'Async media & gap test',
        slides: [
          {
            id: 'slide_a',
            background: { type: 'solid', color: '#ffffff' },
            elements: [
              {
                id: 'title_a',
                type: 'text',
                left: 60,
                top: 40,
                width: 420,
                height: 64,
                rotate: 0,
                content: '<p>Slide A heading</p>',
                defaultFontName: 'Inter',
                defaultColor: '#111827',
              },
              {
                id: 'img_pending_a',
                type: 'image',
                left: 520,
                top: 80,
                width: 400,
                height: 250,
                rotate: 0,
                fixedRatio: true,
                src: '',
                altText: 'Hero artwork',
                mediaState: {
                  slotId: 'slot_a_1',
                  status: 'pending',
                  aspectRatio: 1.6,
                  fit: 'cover',
                  label: 'Generuji ilustraci…',
                },
              },
            ],
          },
          {
            id: 'slide_b',
            background: { type: 'solid', color: '#ffffff' },
            elements: [
              {
                id: 'title_b',
                type: 'text',
                left: 60,
                top: 40,
                width: 420,
                height: 64,
                rotate: 0,
                content: '<p>Slide B ready</p>',
                defaultFontName: 'Inter',
                defaultColor: '#111827',
              },
            ],
          },
        ],
      },
    })

    window.__controller = controller
    controller.subscribe(event => {
      if (event.type === 'aiSlideInsertRequested' || event.type === 'aiSlideInsertCancelled') {
        window.__bridgeEvents.push(event)
      }
    })
  })

  // 1. Verify first, middle, and last gap AI buttons exist with host-localized aria-labels.
  await page.waitForSelector('button[data-fika-gap-action="ai"][data-fika-slide-gap="before-first"]')
  const gapSnapshot = await page.evaluate(() => {
    const aiButtons = [...document.querySelectorAll('button[data-fika-gap-action="ai"]')]
    return aiButtons.map(btn => ({
      gap: btn.getAttribute('data-fika-slide-gap'),
      after: btn.getAttribute('data-after-slide-id'),
      before: btn.getAttribute('data-before-slide-id'),
      ariaLabel: btn.getAttribute('aria-label'),
      text: btn.textContent?.trim(),
    }))
  })
  assert.deepEqual(gapSnapshot, [
    { gap: 'before-first', after: '', before: 'slide_a', ariaLabel: 'Přidat AI snímek na začátek', text: 'AI snímek' },
    { gap: 'between', after: 'slide_a', before: 'slide_b', ariaLabel: 'Přidat AI snímek mezi 1 a 2', text: 'AI snímek' },
    { gap: 'after-last', after: 'slide_b', before: '', ariaLabel: 'Přidat AI snímek na konec', text: 'AI snímek' },
  ])

  // 2. Keyboard accessibility: focus the middle gap AI button and activate via Enter.
  await page.locator('button[data-fika-gap-action="ai"][data-fika-slide-gap="between"]').focus()
  await page.keyboard.press('Enter')

  // Also click first and last gap buttons.
  await page.locator('button[data-fika-gap-action="ai"][data-fika-slide-gap="before-first"]').click()
  await page.locator('button[data-fika-gap-action="ai"][data-fika-slide-gap="after-last"]').click()

  const requestCheck = await page.evaluate(() => ({
    requests: window.__gapRequests,
    events: window.__bridgeEvents,
  }))
  assert.equal(requestCheck.requests.length, 3)
  assert.equal(requestCheck.events.length, 3)
  assert.equal(requestCheck.requests[0].position, 'between')
  assert.equal(requestCheck.requests[0].afterSlideId, 'slide_a')
  assert.equal(requestCheck.requests[0].beforeSlideId, 'slide_b')
  assert.equal(requestCheck.requests[1].position, 'before-first')
  assert.equal(requestCheck.requests[2].position, 'after-last')

  // 3. Verify manual blank-slide gap insertion works at the middle gap and preserves order.
  await page.locator('button[data-fika-gap-action="blank"][data-fika-slide-gap="between"]').click()
  const afterManualInsert = await page.evaluate(() => window.__controller.slides.list().map(s => s.id))
  assert.equal(afterManualInsert.length, 3)
  assert.equal(afterManualInsert[0], 'slide_a')
  assert.equal(afterManualInsert[2], 'slide_b')

  // Undo the manual gap insert cleanly once the debounced UI snapshot commits.
  await page.waitForFunction(() => window.__controller.getState().canUndo)
  await page.evaluate(async () => { await window.__controller.history.undo() })
  const afterUndoManual = await page.evaluate(() => window.__controller.slides.list().map(s => s.id))
  assert.deepEqual(afterUndoManual, ['slide_a', 'slide_b'])

  // 4. Insert a pending AI skeleton slide with aiRequestId and test native cancellation UI on canvas.
  await page.evaluate(async () => {
    const req = window.__gapRequests[0]
    await window.__controller.slides.create({
      anchor: req,
      slide: { id: 'ai_pending_mid', elements: [], skeleton: true, aiRequestId: req.requestId },
      select: true,
    }, { commit: false })
  })
  await page.waitForSelector('button[data-fika-ai-insert-cancel]')
  const cancelBtnText = await page.locator('[data-slide-skeleton] button[data-fika-ai-insert-cancel]').textContent()
  assert.equal(cancelBtnText?.trim(), 'Zrušit generování')
  await page.locator('[data-slide-skeleton] button[data-fika-ai-insert-cancel]').click()
  const cancels = await page.evaluate(() => window.__gapCancels)
  assert.equal(cancels.length, 1)
  assert.equal(cancels[0].slideId, 'ai_pending_mid')
  await page.evaluate(async () => {
    await window.__controller.slides.delete('ai_pending_mid', { commit: false })
    window.__controller.goToSlide('slide_a')
  })

  // 5. Verify native pending image slot accessibility, aspect ratio, reduced motion, error state, and resolution.
  const pendingSlot = page.locator('[data-fika-image-slot-status="pending"][data-fika-image-slot-id="slot_a_1"]')
  await pendingSlot.waitFor({ state: 'visible' })
  const pendingMeta = await pendingSlot.evaluate(el => {
    const rect = el.getBoundingClientRect()
    const shimmer = el.querySelector('div')
    return {
      role: el.getAttribute('role'),
      ariaBusy: el.getAttribute('aria-busy'),
      ariaLabel: el.getAttribute('aria-label'),
      ratio: rect.width / rect.height,
      shimmerAnim: shimmer ? getComputedStyle(shimmer).animationName : 'none',
    }
  })
  assert.equal(pendingMeta.role, 'status')
  assert.equal(pendingMeta.ariaBusy, 'true')
  assert.equal(pendingMeta.ariaLabel, 'Generuji ilustraci…')
  assert.ok(Math.abs(pendingMeta.ratio - 1.6) < 0.05, `expected ~1.6 aspect ratio, got ${pendingMeta.ratio}`)
  assert.notEqual(pendingMeta.shimmerAnim, 'none')

  // Emulate prefers-reduced-motion: reduce -> shimmer must turn off cleanly.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const reducedDisplay = await pendingSlot.evaluate(el => {
    const shimmer = el.querySelector('div')
    return shimmer ? getComputedStyle(shimmer).display : 'none'
  })
  assert.equal(reducedDisplay, 'none')
  await page.emulateMedia({ reducedMotion: 'no-preference' })

  // Verify PPTX + PDF export succeed cleanly while the pending slot exists (never crashes on empty src).
  const exportSizes = await page.evaluate(async () => {
    const doc = window.__controller.export.json()
    const [pptx, pdf] = await Promise.all([
      window.fika.exportPresentationPptx(doc, { assetBaseUrl: '/fika-assets' }),
      window.fika.exportPresentationPdf(doc, { assetBaseUrl: '/fika-assets', width: 640 }),
    ])
    return { pptx: pptx.size, pdf: pdf.size }
  })
  assert.ok(exportSizes.pptx > 1000, 'PPTX export with pending slot should produce a valid package')
  assert.ok(exportSizes.pdf > 1000, 'PDF export with pending slot should produce a valid PDF')

  // Transition slot to error state and verify accessible error UI.
  await page.evaluate(async () => {
    await window.__controller.media.setImageState(
      { slotId: 'slot_a_1' },
      { slotId: 'slot_a_1', status: 'error', error: 'Nepodařilo se vygenerovat obrázek' },
    )
  })
  const errorSlot = page.locator('[data-fika-image-slot-status="error"][data-fika-image-slot-id="slot_a_1"]')
  await errorSlot.waitFor({ state: 'visible' })
  assert.equal(await errorSlot.getAttribute('role'), 'img')
  assert.equal(await errorSlot.getAttribute('aria-label'), 'Nepodařilo se vygenerovat obrázek')

  // Resolve slot with a real PNG data URL -> slot disappears and canvas renders the bitmap.
  await page.evaluate(async (pngUrl) => {
    await window.__controller.media.setImageState({ slotId: 'slot_a_1' }, { slotId: 'slot_a_1', status: 'pending' })
    const res = await window.__controller.execute({
      type: 'media.setImageSource',
      payload: { slotId: 'slot_a_1', asset: { src: pngUrl, width: 4, height: 2 }, fit: 'cover', onlyIfPending: true },
    })
    if (!res.ok) throw new Error(JSON.stringify(res.errors))
  }, VALID_PNG_DATA_URL)
  await page.waitForSelector('[data-fika-image-slot-id="slot_a_1"]', { state: 'detached' })
  await page.waitForSelector('.editable-element-image canvas[aria-label="Hero artwork"]')

  // Broken network image URL falls back cleanly to accessible error slot instead of broken/blank box.
  await page.evaluate(async (brokenUrl) => {
    await window.__controller.elements.create({
      slideId: 'slide_a',
      element: {
        id: 'img_broken',
        type: 'image',
        left: 60,
        top: 200,
        width: 240,
        height: 150,
        rotate: 0,
        fixedRatio: true,
        src: brokenUrl,
        altText: 'Missing diagram',
      },
    })
  }, `http://127.0.0.1:${port}/broken-image.png`)
  await page.waitForSelector('[data-fika-image-slot-status="error"][aria-label="Missing diagram"]')

  // Disabling aiSlideInsert via controller.setAiSlideInsert(null) cleanly hides gap controls.
  await page.evaluate(() => { window.__controller.setAiSlideInsert(null) })
  await page.waitForSelector('button[data-fika-gap-action="ai"]', { state: 'detached' })

  assert.deepEqual(errors, [])
  console.log('e2e-gap-insert-and-media-slot: PASS')
} finally {
  await browser.close()
  server.close()
  await rm(temp, { recursive: true, force: true })
}
