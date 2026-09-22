import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true })
const errors = []; page.on('pageerror', e => errors.push(e.message))
const getFrames = () => page.evaluate(() => { const s = window.__FIKA_SLIDES__.getState(); return s.slides[s.slideIndex].elements.filter(e => e.photoFrame) })
const photo = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="100" height="100" fill="red"/><rect x="100" width="100" height="100" fill="blue"/></svg>')
try {
  await page.goto(`${process.env.FIKA_TEST_URL || 'http://127.0.0.1:5178'}/?mode=myna`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Elements', exact: true }).click()
  const panel = page.locator('[data-myna-frames=grids]')
  await panel.getByRole('button', { name: 'Four photos', exact: true }).click()
  assert.equal((await getFrames()).length, 4)
  await panel.locator('input[type=file]').setInputFiles({ name: 'test.svg', mimeType: 'image/svg+xml', buffer: photo })
  await page.waitForFunction(() => window.__FIKA_SLIDES__.getState().slides[0].elements.filter(e => e.photoFrame).some(e => !e.photoFrame.empty))
  let frames = await getFrames()
  assert.equal(frames[0].photoFrame.sourceWidth, 200)
  assert.deepEqual(frames[0].clip.range, [[25, 0], [75, 100]])
  await panel.getByLabel('Gutter (px)').fill('30')
  frames = await getFrames(); assert.equal(frames[1].left - frames[0].left - frames[0].width, 30)
  await panel.getByRole('button', { name: 'Swap with next cell' }).click()
  frames = await getFrames(); assert.equal(frames[0].photoFrame.empty, true); assert.equal(frames[1].photoFrame.empty, false)
  await page.waitForTimeout(450)
  // A real canvas drop fills its target cell without inserting an extra element.
  const targetId = frames[3].id
  const target = await page.locator(`#editable-element-${targetId} [class*=editable-element-image]`).boundingBox()
  const drop = await page.evaluateHandle(({ content }) => { const data = new DataTransfer(); data.items.add(new File([content], 'drop.svg', { type: 'image/svg+xml' })); return data }, { content: photo.toString() })
  await page.locator(`#editable-element-${targetId}`).dispatchEvent('drop', { dataTransfer: drop, clientX: target.x + 20, clientY: target.y + 20 })
  await page.waitForFunction(id => { const s = window.__FIKA_SLIDES__.getState(); return !s.slides[0].elements.find(e => e.id === id).photoFrame.empty }, targetId)
  assert.equal((await getFrames()).length, 4)
  await page.waitForTimeout(450)
  await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().unDo())
  assert.equal((await getFrames())[3].photoFrame.empty, true)
  await page.evaluate(() => window.__FIKA_SNAPSHOT__.getState().reDo())
  assert.equal((await getFrames())[3].photoFrame.empty, false)
  await mkdir('output/myna', { recursive: true })
  await page.waitForTimeout(350)
  await page.screenshot({ path: 'output/myna/parity-frames.png' })
  await page.getByRole('button', { name: 'Download', exact: true }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.locator('.myna-download').getByRole('button', { name: 'Download', exact: true }).click()
  const download = await downloadPromise; assert.match(download.suggestedFilename(), /\.png$/)
  await download.saveAs('output/myna/frames-export.png')
  const exported = await readFile('output/myna/frames-export.png')
  const colors = await page.evaluate(async data => {
    const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob())
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0); image.close()
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    let red = 0, blue = 0, placeholder = 0
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] > 240 && pixels[i + 1] < 10 && pixels[i + 2] < 10) red++
      if (pixels[i] < 10 && pixels[i + 1] < 10 && pixels[i + 2] > 240) blue++
      if (pixels[i] === 232 && pixels[i + 1] === 232 && pixels[i + 2] === 235) placeholder++
    }
    return { red, blue, placeholder }
  }, exported.toString('base64'))
  assert.ok(colors.red > 1000 && colors.blue > 1000 && colors.placeholder > 1000, JSON.stringify(colors))
  assert.deepEqual(errors, [])
  console.log('PASS Myna frames: insert, fill, cover crop, gutters, swap, native canvas drop, undo/redo, raster export')
} finally { await browser.close() }
