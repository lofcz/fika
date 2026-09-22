import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import JSZip from 'jszip'
import { readFile } from 'node:fs/promises'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const base = process.env.FIKA_TEST_URL || 'http://127.0.0.1:5178'
try {
  await page.goto(`${base}/?mode=myna&locale=en`, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__FIKA_SLIDES__?.getState().slides.length > 0)
  await page.evaluate(() => {
    const s = window.__FIKA_SLIDES__.getState()
    const first = structuredClone(s.slides[0])
    s.setSlides([first, { ...structuredClone(first), id: 'export-second' }, { ...structuredClone(first), id: 'export-third' }])
  })
  await page.getByRole('button', { name: 'Download', exact: true }).first().click()
  await page.getByRole('combobox', { name: 'Pages', exact: true }).selectOption('selected')
  const input = page.getByLabel('Page numbers or ranges', { exact: true })
  await input.fill('4')
  await page.getByRole('alert').filter({ hasText: 'Enter valid page numbers' }).waitFor()
  await input.fill('3, 1')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download', exact: true }).last().click()
  const download = await downloadPromise
  assert.equal(await download.failure(), null)
  const zip = await JSZip.loadAsync(await readFile(await download.path()))
  assert.deepEqual(Object.keys(zip.files), ['003.png', '001.png'])
  for (const name of Object.keys(zip.files)) {
    const png = await zip.file(name).async('nodebuffer')
    assert.equal(png.readUInt32BE(16), 1080)
    assert.equal(png.readUInt32BE(20), 1080)
  }
  await page.locator('.myna-download').waitFor({ state: 'detached' })
  await page.evaluate(() => {
    const create = window.createImageBitmap.bind(window)
    window.createImageBitmap = async (...args) => { await new Promise(resolve => setTimeout(resolve, 250)); return create(...args) }
  })
  let cancelledDownloads = 0
  page.on('download', () => cancelledDownloads++)
  await page.getByRole('button', { name: 'Download', exact: true }).first().click()
  await page.getByRole('combobox', { name: 'Pages', exact: true }).selectOption('all')
  await page.getByRole('button', { name: 'Download', exact: true }).last().click()
  await page.getByRole('button', { name: 'Cancel export', exact: true }).click()
  await page.getByRole('button', { name: 'Cancel export', exact: true }).waitFor({ state: 'detached' })
  assert.equal(cancelledDownloads, 0)
  assert.equal(await page.locator('.myna-download').getByRole('button', { name: 'Download', exact: true }).isEnabled(), true)
  console.log('Myna export: invalid range blocked, ordered noncontiguous selection exported with original page filenames and valid 1080px PNGs; cancellation prevented download and restored controls.')
} finally { await browser.close() }
