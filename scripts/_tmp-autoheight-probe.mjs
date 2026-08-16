/**
 * TEMP probe 6: shape width drag with selection.
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DEV_URL = 'http://127.0.0.1:5173/'
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function waitForDev(timeoutMs = 60000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await fetch(DEV_URL)).ok) return true
    } catch { /* retry */ }
    await sleep(400)
  }
  return false
}

const browser = await chromium.launch({ headless: true })
let child = null
try {
  let serverReady = await waitForDev(1500)
  if (!serverReady) {
    child = spawn('npm', ['run', 'dev'], { cwd: root, shell: true, stdio: 'ignore' })
    serverReady = await waitForDev(90000)
    if (!serverReady) throw new Error('dev server did not start')
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(DEV_URL, { waitUntil: 'networkidle' })
  await page.getByText('Add slide').waitFor({ timeout: 90000 })
  await page.evaluate(() => {
    document.querySelectorAll('[data-react-scan], #react-scan-root').forEach(el => el.remove())
  })

  await page.evaluate(() => {
    const slides = window.__FIKA_SLIDES__.getState()
    slides.addElement({
      id: 'probe-shape',
      type: 'shape',
      left: 60, top: 300, width: 420, height: 60,
      viewBox: [200, 100],
      path: 'M 0 0 L 200 0 L 200 100 L 0 100 Z',
      fill: '#f3e8d8',
      rotate: 0,
      text: {
        content: '<p style="font-size: 18px">Shape text that wraps over lines when the shape is narrow enough to force wrapping here</p>',
        align: 'middle',
        defaultFontName: '',
        defaultColor: '#333',
        fixedHeight: false,
      },
    })
  })
  await sleep(400)

  const read = () => page.evaluate(() => {
    const slides = window.__FIKA_SLIDES__.getState().slides
    const cur = slides[window.__FIKA_MAIN__.getState().currentSlideIndex] ?? slides[0]
    const shape = cur.elements.find(e => e.id === 'probe-shape')
    const root = document.getElementById('editable-element-probe-shape')
    const host = root?.querySelector('.shape-text')
    const pm = root?.querySelector('.ProseMirror')
    const scale = window.__FIKA_MAIN__.getState().canvasScale
    return {
      shape: shape ? { w: shape.width, h: shape.height } : null,
      hostH: host ? Math.round(host.getBoundingClientRect().height / scale) : 0,
      pmScrollH: pm ? Math.ceil(pm.scrollHeight) : 0,
      needH: pm ? Math.ceil(pm.scrollHeight) + 20 : 0,
    }
  })

  // Select via border (avoid entering edit)
  const box = page.locator('#editable-element-probe-shape [data-live-box]')
  const r = await box.boundingBox()
  // border = top edge
  await page.mouse.click(r.x + 4, r.y + 2)
  await sleep(300)
  console.log('--- baseline (selected) ---')
  console.log(JSON.stringify(await read()))

  const handleInfo = await page.evaluate(() => {
    const els = [...document.querySelectorAll('#operate-element-probe-shape [class*=resize-handler]')]
    const right = els.find(el => /right/.test(el.className) && !/top/.test(el.className) && !/bottom/.test(el.className))
    if (!right) return null
    const rr = right.getBoundingClientRect()
    return { x: rr.x + rr.width / 2, y: rr.y + rr.height / 2 }
  })
  console.log('right handle:', JSON.stringify(handleInfo))

  if (handleInfo) {
    await page.mouse.move(handleInfo.x, handleInfo.y)
    await page.mouse.down()
    await page.mouse.move(handleInfo.x - 280, handleInfo.y, { steps: 14 })
    await page.mouse.up()
    await sleep(700)
    console.log('--- after shape width drag (narrower) ---')
    console.log(JSON.stringify(await read()))
  }

  await page.close()
}
finally {
  await browser.close()
  if (child) child.kill()
}
