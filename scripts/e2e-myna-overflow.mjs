import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true })
const base = process.env.FIKA_TEST_URL || 'http://127.0.0.1:5178'
const errors = []
page.on('pageerror', error => errors.push(error.message))
const geometry = () => page.evaluate(() => {
  const box = document.querySelector('.myna-canvas .viewport-wrapper').getBoundingClientRect()
  return { x: box.x, y: box.y, scale: window.__FIKA_MAIN__.getState().canvasScale }
})
async function countPixels(rect, color) {
  const png = (await page.screenshot()).toString('base64')
  return page.evaluate(async ({ png, rect, color }) => {
    const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob())
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0); image.close()
    const pixels = ctx.getImageData(Math.round(rect.x), Math.round(rect.y), Math.max(1, Math.floor(rect.width)), Math.max(1, Math.floor(rect.height))).data
    let matches = 0
    for (let i = 0; i < pixels.length; i += 4) {
      if (color.every((value, c) => Math.abs(value - pixels[i + c]) < 25)) matches++
    }
    return matches
  }, { png, rect, color })
}
async function checkPaint() {
  const { x, y, scale: s } = await geometry()
  for (const [px, py, color] of [[-65, 160, [255,0,0]], [440,-60,[0,0,255]], [1040,650,[255,128,0]], [650,1040,[128,0,255]]]) {
    assert.ok(await countPixels({ x: x + px*s, y: y + py*s, width: 8, height: 8 }, color) > 20, `off-page shape painted at ${px},${py}`)
  }
  assert.ok(await countPixels({ x: x-150*s, y:y+350*s, width: 145*s, height: 100*s }, [0,170,0]) > 30, 'off-page text glyphs are rendered')
}
try {
  await page.goto(`${base}/?mode=myna&locale=en`, { waitUntil: 'networkidle' })
  await page.locator('[data-myna-workspace]').waitFor()
  await page.getByRole('button', { name: 'Close library', exact: true }).click()
  await page.evaluate(() => {
    const state = window.__FIKA_SLIDES__.getState()
    const shape = (id, left, top, fill) => ({ id, type: 'shape', left, top, width: 200, height: 200, rotate: 0, fill, fixedRatio: false, viewBox: [100,100], path:'M0 0 H100 V100 H0 Z' })
    state.setViewportSize(1000); state.setViewportRatio(1); state.updateSlideIndex(0)
    state.setSlides([{ id: 'overflow-page', background: { type: 'solid', color: '#ffffff' }, elements: [
      shape('left-shape',-100,100,'#ff0000'), shape('top-shape',350,-100,'#0000ff'),
      shape('right-shape',950,600,'#ff8000'), shape('bottom-shape',600,950,'#8000ff'),
      { id:'outside-text', type:'text', left:-160, top:350, width:450, height:100, rotate:0, defaultFontName:'Arial', defaultColor:'#00aa00', content:'<p style="font-size:70px;color:#00aa00">OUTSIDE</p>' },
    ] }])
    window.__FIKA_MAIN__.getState().setCanvasPercentage(60)
  })
  await page.waitForTimeout(700)
  assert.equal(await page.locator('.myna-canvas .viewport-clip').evaluate(el => getComputedStyle(el).overflow), 'visible')
  await checkPaint()
  let { x, y, scale: s } = await geometry()
  await page.mouse.move(x-60*s, y+160*s)
  await page.mouse.down(); await page.mouse.move(x-100*s, y+180*s, { steps: 8 }); await page.mouse.up()
  await page.waitForTimeout(400)
  const moved = await page.evaluate(() => window.__FIKA_SLIDES__.getState().slides[0].elements[0])
  assert.ok(moved.left < -120, 'dragging the visible outside portion moves the shape')
  await page.keyboard.press('Escape')
  await page.evaluate(() => {
    const state = window.__FIKA_SLIDES__.getState()
    state.updateElement({ id: 'left-shape', props: { left: -100, top: 100 } })
    window.__FIKA_MAIN__.getState().setCanvasPercentage(50)
  })
  await page.waitForTimeout(400)
  await checkPaint()
  const before = await geometry()
  await page.mouse.move(before.x+800*before.scale, before.y+400*before.scale)
  await page.keyboard.down('Space'); await page.mouse.down()
  await page.mouse.move(before.x+800*before.scale+45, before.y+400*before.scale+25, { steps: 8 })
  await page.mouse.up(); await page.keyboard.up('Space')
  const after = await geometry()
  assert.ok(Math.abs(after.x-before.x-45) < 2 && Math.abs(after.y-before.y-25) < 2, 'space-pan follows pointer')
  await checkPaint()
  await mkdir('output/myna', { recursive: true })
  await page.screenshot({ path: 'output/myna/overflow.png' })
  await page.getByRole('button', { name: 'Download', exact: true }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.locator('.myna-download').getByRole('button', { name: 'Download', exact: true }).click()
  const download = await downloadPromise
  await download.saveAs('output/myna/overflow-export.png')
  const { readFile } = await import('node:fs/promises')
  const exported = await readFile('output/myna/overflow-export.png')
  assert.equal(exported.readUInt32BE(16), 1000)
  assert.equal(exported.readUInt32BE(20), 1000)
  const thumbnail = page.locator('.myna-page .thumbnail-slide').first()
  assert.equal(await thumbnail.evaluate(el => getComputedStyle(el).overflow), 'hidden')
  await page.goto(`${base}/?locale=en`, { waitUntil: 'networkidle' })
  assert.equal(await page.locator('.canvas .viewport-clip').evaluate(el => getComputedStyle(el).overflow), 'hidden', 'presentation editor remains page-clipped')
  assert.deepEqual(errors, [])
  console.log('Myna overflow: all four page edges, text glyphs, outside hit/drag, zoom, pan, bounded export/thumbnail and unchanged presentation clipping passed.')
} finally { await browser.close() }
