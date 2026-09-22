import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const errors = []
page.on('pageerror', error => errors.push(error.message))
async function download(format = 'svg', scope = 'current') {
  await page.getByRole('button', { name: 'Download', exact: true }).first().click()
  const modal = page.locator('.myna-download')
  await modal.locator('select').first().selectOption(format)
  await modal.locator('select').nth(1).selectOption(scope)
  const pending = page.waitForEvent('download')
  await modal.getByRole('button', { name: 'Download', exact: true }).click()
  const file = await pending.catch(async error => { console.error('Export failure', format, scope, await modal.innerText(), await page.evaluate(() => window.__FIKA_MAIN__.getState().activeElementIdList)); throw error })
  const bytes = await readFile(await file.path())
  if (await modal.count()) await page.keyboard.press('Escape')
  await modal.waitFor({ state: 'detached' })
  return bytes
}
async function pixels(bytes, mime, samples) {
  return page.evaluate(async ({ encoded, mime, samples }) => {
    const image = new Image(); image.src = `data:${mime};base64,${encoded}`; await image.decode()
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0)
    return samples.map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data])
  }, { encoded: bytes.toString('base64'), mime, samples })
}
try {
  await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5173'}/?mode=myna&locale=en`, { waitUntil: 'networkidle' })
  await page.locator('[data-myna-workspace]').waitFor()
  await page.evaluate(() => {
    const store = window.__FIKA_SLIDES__.getState()
    const shape = (id, left, top, width, height, props = {}) => ({ id, type: 'shape', left, top, width, height, rotate: 0, viewBox: [width, height], path: `M0 0H${width}V${height}H0Z`, fill: 'none', fixedRatio: false, ...props })
    store.setSlides([{ ...store.slides[0], background: { type: 'solid', color: '#ffffff' }, elements: [
      shape('outer-frame', 100, 100, 120, 200, { frame: { clipContent: true } }),
      shape('inner-frame', 150, 150, 100, 100, { frame: { clipContent: true }, parentFrameId: 'outer-frame', rotate: 45 }),
      shape('red-child', 0, 0, 500, 500, { parentFrameId: 'inner-frame', fill: '#ff0000' }),
    ] }])
    window.__FIKA_MAIN__.getState().setActiveElementIdList([])
  })
  const positions = [[200, 200], [200, 135], [200, 120], [120, 200], [215, 200], [230, 200]]
  const expected = [[255,0,0,255], [255,0,0,255], [255,255,255,255], [255,255,255,255], [255,0,0,255], [255,255,255,255]]
  const svg = await download()
  assert.deepEqual(await pixels(svg, 'image/svg+xml', positions), expected, 'SVG clips to intersection of rotated inner and outer frame')
  assert.deepEqual(await pixels(await download('png'), 'image/png', positions), expected, 'PNG agrees with SVG clipping, including rotation')
  await page.evaluate(() => window.__FIKA_MAIN__.getState().setActiveElementIdList(['outer-frame']))
  const selection = (await download('svg', 'objects')).toString('utf8')
  const info = await page.evaluate(svg => {
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
    return { width: +doc.documentElement.getAttribute('width'), height: +doc.documentElement.getAttribute('height'), ids: [...doc.querySelectorAll('[data-element-id]')].map(node => node.getAttribute('data-element-id')), error: !!doc.querySelector('parsererror') }
  }, selection)
  assert.equal(info.error, false); assert.equal(info.width, 120); assert.equal(info.height, 200)
  assert.equal(new Set(info.ids).size, info.ids.length, 'SVG element metadata occurs once per object')
  for (const id of ['outer-frame', 'inner-frame', 'red-child']) assert.ok(info.ids.includes(id), `Frame SVG retains descendant ${id}`)
  await page.evaluate(() => window.__FIKA_MAIN__.getState().setActiveElementIdList(['red-child']))
  const childOnly = (await download('svg', 'objects')).toString('utf8')
  assert.match(childOnly, /<polygon/, 'A child-only export retains omitted ancestors as clipping context')
  await page.evaluate(() => {
    const store = window.__FIKA_SLIDES__.getState()
    store.updateElement({ id: 'inner-frame', props: { frame: { clipContent: false } } })
    window.__FIKA_MAIN__.getState().setActiveElementIdList([])
  })
  const unclippedInner = await download()
  assert.deepEqual(await pixels(unclippedInner, 'image/svg+xml', [[120, 200], [200, 120], [230, 200]]), [[255,0,0,255], [255,0,0,255], [255,255,255,255]], 'Disabling inner clipping preserves outer clipping')
  await page.evaluate(() => {
    const store = window.__FIKA_SLIDES__.getState()
    store.updateElement({ id: 'inner-frame', props: { frame: { clipContent: true } } })
    store.updateElement({ id: 'red-child', props: { effects: { softEdge: { radius: 0 } } } })
    window.__FIKA_MAIN__.getState().setActiveElementIdList([])
  })
  const fallback = await download()
  assert.match(fallback.toString('utf8'), /data:image\/png;base64/)
  assert.deepEqual(await pixels(fallback, 'image/svg+xml', positions), expected, 'Raster fallbacks obey ancestor clips')
  assert.deepEqual(errors, [])
  console.log('PASS nested frame export: rotated ancestor intersections, matching SVG/PNG pixels, frame descendant selection, tight frame bounds, omitted ancestor context, and clipped raster fallbacks.')
} finally { await browser.close() }
