/**
 * Built-embed E2E verification for native double-click & keyboard image source replacement:
 * - Normal, failed/error slot, pending slot, and broken-URL images
 * - Accessible droparea dialog (drag/drop + file chooser, cancel, Escape, keyboard Enter)
 * - Image validation/decode errors (corrupt image, non-image file)
 * - Preservation of element ID, bounds, clip shape, decorations, and undo/redo
 * - Stale async generation/retry updates cannot overwrite manual replacement
 * - Host media.upload normalizer integration
 * - Supported native modes (editor + myna, readOnly blocked) & locales (cs/en/sk/pl)
 * - Round-trip serialization persistence
 */
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

const SVG_INITIAL = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#cbd5e1"/></svg>'
const INITIAL_DATA_URL = 'data:image/svg+xml;base64,' + Buffer.from(SVG_INITIAL).toString('base64')
const VALID_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAIAAADwyuo0AAAAEElEQVR4nGPQL0yHIwZkDgBpMgg5zNuQeQAAAABJRU5ErkJggg=='
const VALID_PNG_BUFFER = Buffer.from(VALID_PNG_BASE64, 'base64')
const VALID_PNG_DATA_URL = `data:image/png;base64,${VALID_PNG_BASE64}`
const WIDE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100"><rect width="400" height="100" fill="#10b981"/></svg>'
const WIDE_SVG_BUFFER = Buffer.from(WIDE_SVG)
const WIDE_SVG_DATA_URL = 'data:image/svg+xml;base64,' + WIDE_SVG_BUFFER.toString('base64')
const STALE_PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const temp = await mkdtemp(join(tmpdir(), 'fika-img-replace-'))
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
    if (path === '/broken-404.png') {
      res.writeHead(404).end('not found')
      return
    }
    if (path === '/uploaded-good.png') {
      res.setHeader('Content-Type', 'image/png')
      res.end(VALID_PNG_BUFFER)
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

async function dblclickElement(elementId, delay = 0) {
  const box = await page.locator(`#editable-element-${elementId} [data-live-box]`).boundingBox()
  assert.ok(box && box.width > 10 && box.height > 10, `Expected visible bounding box for ${elementId}`)
  if (delay > 0) {
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2, { delay })
    return
  }
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)
}

async function dropFileOnDropzone(name, mimeType, bytesArray) {
  await page.evaluate(({ name, mimeType, bytesArray }) => {
    const zone = document.querySelector('[data-media-dropzone="replace-image"]')
    if (!zone) throw new Error('Missing replace dropzone')
    const dt = new DataTransfer()
    dt.items.add(new File([new Uint8Array(bytesArray)], name, { type: mimeType }))
    zone.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }))
    zone.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }))
    zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
  }, { name, mimeType, bytesArray })
}

try {
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'commit' })
  await page.waitForFunction(() => window.fika)

  // 1. Mount standard editor in Czech with normal, failed, pending, and broken-URL images.
  await page.evaluate(async ({ initialSrc, brokenUrl }) => {
    const host = document.getElementById('host')
    const { controller } = await window.fika.mountFika(host, {
      assetBaseUrl: '/fika-assets',
      locale: 'cs',
      document: {
        title: 'Oprava obrázků',
        slides: [
          {
            id: 'slide_1',
            background: { type: 'solid', color: '#ffffff' },
            elements: [
              {
                id: 'img_normal',
                type: 'image',
                left: 60,
                top: 60,
                width: 300,
                height: 200,
                rotate: 5,
                fixedRatio: true,
                src: initialSrc,
                altText: 'Normální obrázek',
                radius: 12,
                flipH: true,
                colorMask: 'rgba(15, 23, 42, 0.12)',
                outline: { width: 2, color: '#2563eb', style: 'solid' },
                shadow: { h: 2, v: 4, blur: 8, color: 'rgba(0,0,0,0.2)' },
                filters: { contrast: '108%' },
                clip: { shape: 'roundRect', range: [[0, 0], [100, 100]] },
                link: { type: 'web', target: 'https://example.com/norm' },
              },
              {
                id: 'img_failed',
                type: 'image',
                left: 420,
                top: 60,
                width: 340,
                height: 200,
                rotate: 0,
                fixedRatio: true,
                src: '',
                altText: 'Nezdařený obrázek',
                mediaState: {
                  slotId: 'slot_fail_1',
                  status: 'error',
                  fit: 'cover',
                  error: 'Obrázek se nepodařilo vygenerovat',
                },
              },
              {
                id: 'img_pending',
                type: 'image',
                left: 60,
                top: 300,
                width: 300,
                height: 180,
                rotate: 0,
                fixedRatio: true,
                src: '',
                altText: 'Čekající obrázek',
                mediaState: {
                  slotId: 'slot_pend_1',
                  status: 'pending',
                  fit: 'cover',
                  label: 'Generuji obrázek…',
                },
              },
              {
                id: 'img_broken_url',
                type: 'image',
                left: 420,
                top: 300,
                width: 340,
                height: 180,
                rotate: 0,
                fixedRatio: true,
                src: brokenUrl,
                altText: 'Chybějící obrázek',
              },
            ],
          },
        ],
      },
    })
    window.__controller = controller
  }, { initialSrc: INITIAL_DATA_URL, brokenUrl: `http://127.0.0.1:${port}/broken-404.png` })

  // Wait for failed slot, pending slot, and broken network image slot to render.
  const failedSlot = page.locator('[data-fika-image-slot-status="error"][data-fika-image-slot-id="slot_fail_1"]')
  await failedSlot.waitFor({ state: 'visible' })
  assert.ok((await failedSlot.textContent())?.includes('Dvojklikem nahradíte'), 'Czech error slot shows localized double-click hint')
  await page.locator('[data-fika-image-slot-status="error"][aria-label="Chybějící obrázek"]').waitFor({ state: 'visible' })

  // 2. Human-paced double-click on unselected failed slot -> accessible dialog in Czech -> test corrupt image + non-image + valid drop.
  await dblclickElement('img_failed', 60)
  const dialog = page.locator('[role="dialog"][aria-modal="true"]').filter({ has: page.locator('[data-media-picker-mode="replace"]') })
  await dialog.waitFor({ state: 'visible' })
  assert.equal((await dialog.locator('h2').textContent())?.trim(), 'Nahradit obrázek')
  const replaceBtn = dialog.locator('[data-editor-replace="image"]')
  assert.equal(await replaceBtn.isDisabled(), true, 'Replace button starts disabled')

  // Corrupt PNG via file input -> localized decode error in role="alert", Replace stays disabled, element unchanged.
  await dialog.locator('input[data-media-file="replace-image"]').setInputFiles({
    name: 'corrupt.png',
    mimeType: 'image/png',
    buffer: Buffer.from('definitely not a png'),
  })
  const alertBox = dialog.locator('[role="alert"][data-media-picker-error]')
  await alertBox.waitFor({ state: 'visible' })
  assert.match((await alertBox.textContent()) || '', /nepodařilo načíst/)
  assert.equal(await replaceBtn.isDisabled(), true, 'Replace stays disabled for corrupt image')
  const failedUnchanged = await page.evaluate(() => window.__controller.slides.get('slide_1')?.elements.find(e => e.id === 'img_failed'))
  assert.equal(failedUnchanged?.mediaState?.status, 'error', 'Corrupt file leaves failed slot untouched')

  // Non-image file via drag/drop -> localized type rejection.
  await dropFileOnDropzone('notes.txt', 'text/plain', Array.from(Buffer.from('hello')))
  assert.match((await alertBox.textContent()) || '', /není podporovaný obrázek/)
  assert.equal(await replaceBtn.isDisabled(), true)

  // Valid PNG via drag/drop -> decodes cleanly -> Replace enabled -> click Replace.
  await dropFileOnDropzone('replacement.png', 'image/png', Array.from(VALID_PNG_BUFFER))
  await dialog.locator('[data-media-card-status="ready"]').waitFor({ state: 'visible' })
  assert.equal(await replaceBtn.isDisabled(), false, 'Valid decoded image enables Replace')
  await replaceBtn.click()
  await dialog.waitFor({ state: 'hidden' })
  await failedSlot.waitFor({ state: 'detached' })

  const failedAfter = await page.evaluate(() => window.__controller.slides.get('slide_1')?.elements.find(e => e.id === 'img_failed'))
  assert.equal(failedAfter.id, 'img_failed')
  assert.equal(failedAfter.left, 420)
  assert.equal(failedAfter.top, 60)
  assert.equal(failedAfter.width, 340)
  assert.equal(failedAfter.height, 200)
  assert.equal(failedAfter.src, VALID_PNG_DATA_URL)
  assert.equal(failedAfter.mediaState, undefined)

  // 3. Double-click normal decorated image -> replace with wide 4:1 SVG -> preserves ID, bounds, clip shape, decorations + undo/redo.
  await dblclickElement('img_normal')
  await dialog.waitFor({ state: 'visible' })
  await dialog.locator('input[data-media-file="replace-image"]').setInputFiles({
    name: 'wide.svg',
    mimeType: 'image/svg+xml',
    buffer: WIDE_SVG_BUFFER,
  })
  await dialog.locator('[data-media-card-status="ready"]').waitFor({ state: 'visible' })
  await replaceBtn.click()
  await dialog.waitFor({ state: 'hidden' })

  const normalAfter = await page.evaluate(() => window.__controller.slides.get('slide_1')?.elements.find(e => e.id === 'img_normal'))
  assert.equal(normalAfter.id, 'img_normal')
  assert.equal(normalAfter.left, 60)
  assert.equal(normalAfter.top, 60)
  assert.equal(normalAfter.width, 300)
  assert.equal(normalAfter.height, 200)
  assert.equal(normalAfter.rotate, 5)
  assert.equal(normalAfter.radius, 12)
  assert.equal(normalAfter.flipH, true)
  assert.equal(normalAfter.colorMask, 'rgba(15, 23, 42, 0.12)')
  assert.deepEqual(normalAfter.outline, { width: 2, color: '#2563eb', style: 'solid' })
  assert.deepEqual(normalAfter.shadow, { h: 2, v: 4, blur: 8, color: 'rgba(0,0,0,0.2)' })
  assert.deepEqual(normalAfter.filters, { contrast: '108%' })
  assert.equal(normalAfter.altText, 'Normální obrázek')
  assert.deepEqual(normalAfter.link, { type: 'web', target: 'https://example.com/norm' })
  assert.equal(normalAfter.clip?.shape, 'roundRect')
  assert.ok(normalAfter.clip.range[0][0] > 20 && normalAfter.clip.range[1][0] < 80, 'Wide image receives centered cover crop')
  assert.equal(normalAfter.src, WIDE_SVG_DATA_URL)

  // Undo & Redo via keyboard shortcuts.
  await page.waitForFunction(() => window.__controller.getState().canUndo)
  await page.keyboard.press('Control+z')
  await page.waitForFunction(src => window.__controller.slides.get('slide_1')?.elements.find(e => e.id === 'img_normal')?.src === src, INITIAL_DATA_URL)
  await page.keyboard.press('Control+y')
  await page.waitForFunction(src => window.__controller.slides.get('slide_1')?.elements.find(e => e.id === 'img_normal')?.src === src, WIDE_SVG_DATA_URL)

  // 4. Double-click broken network URL image -> recovers cleanly.
  await dblclickElement('img_broken_url')
  await dialog.waitFor({ state: 'visible' })
  await dialog.locator('input[data-media-file="replace-image"]').setInputFiles({
    name: 'fixed.png',
    mimeType: 'image/png',
    buffer: VALID_PNG_BUFFER,
  })
  await dialog.locator('[data-media-card-status="ready"]').waitFor({ state: 'visible' })
  await replaceBtn.click()
  await dialog.waitFor({ state: 'hidden' })
  await page.locator('[data-fika-image-slot-status="error"][aria-label="Chybějící obrázek"]').waitFor({ state: 'detached' })
  await page.locator('#editable-element-img_broken_url canvas[aria-label="Chybějící obrázek"]').waitFor({ state: 'visible' })

  // 5. Double-click pending slot -> manual replace wins over stale async generation/retry updates.
  await dblclickElement('img_pending')
  await dialog.waitFor({ state: 'visible' })
  await dialog.locator('input[data-media-file="replace-image"]').setInputFiles({
    name: 'manual-override.png',
    mimeType: 'image/png',
    buffer: VALID_PNG_BUFFER,
  })
  await dialog.locator('[data-media-card-status="ready"]').waitFor({ state: 'visible' })
  await replaceBtn.click()
  await dialog.waitFor({ state: 'hidden' })

  const staleResults = await page.evaluate(async staleSrc => {
    const c = window.__controller
    const r1 = await c.execute({ type: 'media.setImageSource', payload: { slotId: 'slot_pend_1', asset: { src: staleSrc, width: 1, height: 1 }, onlyIfPending: true } })
    const r2 = await c.execute({ type: 'media.setImageSource', payload: { elementId: 'img_pending', slotId: 'slot_pend_1', asset: staleSrc } })
    const r3 = await c.execute({ type: 'media.setImageSource', payload: { elementId: 'img_pending', asset: staleSrc, onlyIfPending: true } })
    const r4 = await c.media.setImageState({ slotId: 'slot_pend_1' }, { slotId: 'slot_pend_1', status: 'error', error: 'Late error' })
    const r5 = await c.media.setImageState('img_pending', { slotId: 'slot_pend_1', status: 'pending' })
    const el = c.slides.get('slide_1')?.elements.find(e => e.id === 'img_pending')
    return { changed: [r1.changed, r2.changed, r3.changed, r4.changed, r5.changed], src: el?.src, mediaState: el?.mediaState }
  }, STALE_PNG_DATA_URL)
  assert.deepEqual(staleResults.changed, [false, false, false, false, false], 'All stale async updates no-op after manual replacement')
  assert.equal(staleResults.src, VALID_PNG_DATA_URL)
  assert.equal(staleResults.mediaState, undefined)

  // 6. Cancel via button + Escape, plus Keyboard Enter equivalent on selected image.
  await dblclickElement('img_normal')
  await dialog.waitFor({ state: 'visible' })
  await dialog.locator('input[data-media-file="replace-image"]').setInputFiles({
    name: 'discarded.png',
    mimeType: 'image/png',
    buffer: VALID_PNG_BUFFER,
  })
  await dialog.locator('[data-media-card-status="ready"]').waitFor({ state: 'visible' })
  await dialog.getByRole('button', { name: 'Zrušit', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  assert.equal(
    await page.evaluate(() => window.__controller.slides.get('slide_1')?.elements.find(e => e.id === 'img_normal')?.src),
    WIDE_SVG_DATA_URL,
    'Cancel discards staged file and leaves element unchanged',
  )

  // Keyboard equivalent: click image to select (giving canvas focus), press Enter to open, Escape to close.
  const imgBox = await page.locator('#editable-element-img_normal [data-live-box]').boundingBox()
  await page.mouse.click(imgBox.x + imgBox.width / 2, imgBox.y + imgBox.height / 2)
  await page.keyboard.press('Enter')
  await dialog.waitFor({ state: 'visible' })
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })

  // 7. Round-trip persistence check.
  const roundTripOk = await page.evaluate(async expectedSrc => {
    const snapshot = JSON.parse(JSON.stringify(window.__controller.getDocument()))
    window.__controller.setDocument(snapshot)
    await new Promise(resolve => setTimeout(resolve, 60))
    const el = window.__controller.slides.get('slide_1')?.elements.find(e => e.id === 'img_failed')
    return el?.src === expectedSrc && el?.mediaState === undefined && el?.width === 340
  }, VALID_PNG_DATA_URL)
  assert.equal(roundTripOk, true, 'Replaced image survives JSON document round-trip')

  // 8. Locales check (en, sk, pl) + readOnly guard.
  for (const [locale, expectedTitle] of [['en', 'Replace image'], ['sk', 'Nahradiť obrázok'], ['pl', 'Zamień obraz']]) {
    await page.evaluate(async loc => { await window.__controller.setLocale(loc) }, locale)
    await dblclickElement('img_normal')
    await dialog.waitFor({ state: 'visible' })
    assert.equal((await dialog.locator('h2').textContent())?.trim(), expectedTitle, `Dialog title localized for ${locale}`)
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden' })
  }

  // Read-only mode blocks opening via double-click and Enter.
  await page.evaluate(() => { window.__controller.setReadOnly(true) })
  await dblclickElement('img_normal')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(120)
  assert.equal(await dialog.isVisible(), false, 'Read-only mode blocks replace dialog')

  // 9. Host media.upload normalizer + Myna viewMode check.
  await page.evaluate(async ({ initialSrc, hostedUrl }) => {
    window.__controller.destroy()
    window.__uploadCalls = []
    const host = document.getElementById('host')
    const { controller } = await window.fika.mountFika(host, {
      assetBaseUrl: '/fika-assets',
      viewMode: 'myna',
      locale: 'en',
      media: {
        upload: async ({ file, kind }) => {
          window.__uploadCalls.push({ name: file.name, kind })
          return { src: hostedUrl }
        },
      },
      document: {
        title: 'Myna replace test',
        slides: [
          {
            id: 'page_1',
            background: { type: 'solid', color: '#ffffff' },
            elements: [
              {
                id: 'myna_img',
                type: 'image',
                left: 120,
                top: 120,
                width: 360,
                height: 240,
                rotate: 0,
                fixedRatio: true,
                src: initialSrc,
              },
            ],
          },
        ],
      },
    })
    window.__controller = controller
  }, { initialSrc: INITIAL_DATA_URL, hostedUrl: `http://127.0.0.1:${port}/uploaded-good.png` })

  await page.locator('[data-myna-workspace]').waitFor({ state: 'visible' })
  await page.locator('#editable-element-myna_img [data-live-box]').waitFor({ state: 'visible' })
  await dblclickElement('myna_img')
  await dialog.waitFor({ state: 'visible' })

  // Corrupt image must fail decode BEFORE calling host media.upload!
  await dialog.locator('input[data-media-file="replace-image"]').setInputFiles({
    name: 'bad-before-upload.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not png'),
  })
  await dialog.locator('[role="alert"][data-media-picker-error]').waitFor({ state: 'visible' })
  assert.equal(await page.evaluate(() => window.__uploadCalls.length), 0, 'Corrupt image fails decode before invoking host uploader')

  // Valid image invokes host media.upload and applies hosted URL in Myna mode.
  await dialog.locator('input[data-media-file="replace-image"]').setInputFiles({
    name: 'good-upload.png',
    mimeType: 'image/png',
    buffer: VALID_PNG_BUFFER,
  })
  await dialog.locator('[data-media-card-status="ready"]').waitFor({ state: 'visible' })
  await replaceBtn.click()
  await dialog.waitFor({ state: 'hidden' })

  const mynaCheck = await page.evaluate(() => ({
    calls: window.__uploadCalls,
    el: window.__controller.slides.get('page_1')?.elements.find(e => e.id === 'myna_img'),
  }))
  assert.deepEqual(mynaCheck.calls, [{ name: 'good-upload.png', kind: 'image' }])
  assert.equal(mynaCheck.el.src, `http://127.0.0.1:${port}/uploaded-good.png`)
  assert.equal(mynaCheck.el.width, 360)
  assert.equal(mynaCheck.el.height, 240)

  assert.deepEqual(errors, [])
  console.log('e2e-image-source-replace: PASS')
} finally {
  await browser.close()
  server.close()
  await rm(temp, { recursive: true, force: true })
}
