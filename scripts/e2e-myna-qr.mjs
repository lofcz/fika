import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import jsQR from 'jsqr'
import { readFile } from 'node:fs/promises'
import { PNG } from 'pngjs'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } })
page.setDefaultTimeout(15000)
const errors = []
page.on('pageerror', error => errors.push(error.message))
const base = process.env.FIKA_TEST_URL || 'http://127.0.0.1:5178'
try {
  await page.goto(`${base}/?mode=myna&locale=en`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Elements', exact: true }).click()
  const panel = page.locator('[data-myna-qr]')
  await page.getByRole('button', { name: 'QR code', exact: true }).click()
  const payload = 'https://example.com/žluťoučký?emoji=🍎'
  await panel.getByRole('textbox', { name: 'Link or text' }).fill(payload)
  await panel.getByRole('button', { name: 'Add QR code', exact: true }).click()
  await page.waitForFunction(() => window.__FIKA_SLIDES__.getState().slides[0].elements.some(element => element.qrCode))
  const original = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements.find(element => element.qrCode))
  assert.equal(original.qrCode.text, payload)
  // Decode actual browser-rasterized generated SVG, not its metadata.
  const raster = await page.evaluate(async src => {
    const img = new Image(); img.src = src; await img.decode()
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512
    const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, 512, 512)
    return Array.from(ctx.getImageData(0, 0, 512, 512).data)
  }, original.src)
  assert.equal(jsQR(Uint8ClampedArray.from(raster), 512, 512)?.data, payload)
  await panel.getByRole('textbox', { name: 'Link or text' }).fill('Updated QR content')
  await panel.getByRole('button', { name: 'Update selected QR code', exact: true }).click()
  await page.waitForFunction(() => window.__FIKA_SLIDES__.getState().slides[0].elements.find(element => element.qrCode)?.qrCode.text === 'Updated QR content')
  await page.waitForTimeout(350)
  await page.locator('[data-canvas-tool=undo]').click()
  await page.waitForFunction(text => window.__FIKA_SLIDES__.getState().slides[0].elements.find(element => element.qrCode)?.qrCode.text === text, payload)
  await page.screenshot({ path: 'output/myna/parity-qr.png' })
  await page.getByRole('button', { name: 'Download', exact: true }).first().click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download', exact: true }).last().click()
  const download = await downloadPromise
  assert.equal(await download.failure(), null)
  const png = PNG.sync.read(await readFile(await download.path()))
  assert.equal(jsQR(Uint8ClampedArray.from(png.data), png.width, png.height)?.data, payload, 'Native exported PNG remains scannable')
  await page.evaluate(() => window.__FIKA_MAIN__.getState().setReadOnly(true))
  assert.equal(await panel.getByRole('button', { name: /QR code$/ }).isDisabled(), true)
  assert.deepEqual(errors, [])
  console.log('QR: create, actual browser SVG and native PNG export scanner roundtrips, edit, undo and read-only passed.')
} finally { await browser.close() }
