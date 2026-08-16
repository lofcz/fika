/**
 * Gutter drag: the rail CHROME (row boxes, page numbers, spacing) must track
 * the pointer live, while the heavy thumbnail CONTENT freezes — the mounted
 * ScreenSlide keeps its drag-start scale under a composited transform and
 * never re-renders mid-drag. On release the content re-renders crisp at the
 * final width.
 *
 *   node scripts/e2e-gutter-drag.mjs
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DEV_PORTS = [5173, 5174, 5175, 5176]
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function isFikaDev(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) return false
    const html = await res.text()
    return html.includes('fika-shell') || html.includes('>fika<')
  }
  catch { return false }
}
async function waitForDev(timeoutMs = 60000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    for (const port of DEV_PORTS) {
      const url = `http://127.0.0.1:${port}/`
      if (await isFikaDev(url)) return url
    }
    await sleep(400)
  }
  return null
}

const results = []
const rec = (name, pass, measured) => results.push({ name, pass: !!pass, measured })

const browser = await chromium.launch({ headless: true })
let child = null
try {
  let devUrl = await waitForDev(1500)
  if (!devUrl) {
    child = spawn('npm', ['run', 'dev'], { cwd: root, shell: true, stdio: 'ignore' })
    devUrl = await waitForDev(90000)
    if (!devUrl) throw new Error('fika dev server did not start')
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(devUrl, { waitUntil: 'networkidle' })
  await page.getByText('Add slide').waitFor({ timeout: 90000 })
  await page.evaluate(() => {
    document.querySelectorAll('[data-react-scan]').forEach(n => n.remove())
    const rs = document.getElementById('react-scan-root')
    if (rs) rs.remove()
  })
  await page.waitForFunction(() => !!(window.__FIKA_SLIDES__ && window.__FIKA_MAIN__))

  const thumbState = () => page.evaluate(() => {
    const thumb = document.querySelector('[class*=live-slide-thumb]')
    const inner = thumb?.firstElementChild
    const list = document.querySelector('[class*=thumbnail-list]')
    if (!thumb || !inner || !list) return { ok: false }
    return {
      ok: true,
      // live chrome: the wrapper box and the list width track the pane
      thumbW: Math.round(thumb.getBoundingClientRect().width),
      listW: Math.round(list.getBoundingClientRect().width),
      // frozen content: inner carries a scale and keeps committed layout
      innerTransform: inner.style.transform || '',
    }
  })

  const before = await thumbState()
  rec('rail starts unfrozen', before.ok && before.innerTransform === '', before)

  const sep = page.locator('.layout-separator').first()
  const sepBox = await sep.boundingBox()
  const startX = sepBox.x + sepBox.width / 2
  const startY = sepBox.y + sepBox.height / 2

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + 80, startY, { steps: 10 })
  await sleep(80)
  const mid = await thumbState()
  rec(
    'mid-drag: chrome tracks the pointer (wrapper/list resize live)',
    mid.ok && mid.thumbW > before.thumbW + 60 && mid.listW > before.listW + 60,
    { before: before.thumbW, mid: mid.thumbW, listBefore: before.listW, listMid: mid.listW },
  )
  rec(
    'mid-drag: content frozen under a composited scale',
    mid.ok && mid.innerTransform.startsWith('scale('),
    mid,
  )
  // a mid-drag pause must NOT unfreeze (no scaled<->crisp flipping)
  await sleep(450)
  const midPause = await thumbState()
  rec(
    'mid-drag pause: freeze holds (no commit flipping)',
    midPause.ok && midPause.innerTransform.startsWith('scale('),
    midPause,
  )
  await page.mouse.move(startX + 130, startY, { steps: 6 })
  await sleep(80)
  const mid2 = await thumbState()
  rec(
    'mid-drag: chrome keeps tracking the pointer',
    mid2.ok && mid2.thumbW > mid.thumbW,
    { first: mid.thumbW, second: mid2.thumbW },
  )
  await page.mouse.move(startX + 60, startY, { steps: 6 })
  await sleep(80)
  await page.mouse.up()
  await sleep(600)

  const after = await thumbState()
  rec(
    'after release: content re-rendered crisp (scale cleared, wrapper matches)',
    after.ok && after.innerTransform === '' && Math.abs(after.thumbW - mid2.thumbW + 70) >= 0
      && after.thumbW !== mid2.thumbW,
    { released: mid2.thumbW, after: after.thumbW },
  )

  // drag back to restore
  const sepBox2 = await sep.boundingBox()
  await page.mouse.move(sepBox2.x + sepBox2.width / 2, sepBox2.y + sepBox2.height / 2)
  await page.mouse.down()
  await page.mouse.move(sepBox2.x + sepBox2.width / 2 - 60, sepBox2.y + sepBox2.height / 2, { steps: 10 })
  await page.mouse.up()
  await sleep(600)
  const restored = await thumbState()
  rec(
    'restored: unfrozen and back to the original width',
    restored.ok && restored.innerTransform === '' && Math.abs(restored.thumbW - before.thumbW) <= 4,
    { original: before.thumbW, restored: restored.thumbW },
  )

  await page.close()
}
finally {
  await browser.close()
  if (child) child.kill()
}

const failed = results.filter(r => !r.pass)
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}`)
  if (!r.pass && r.measured) console.log('   ', JSON.stringify(r.measured))
}
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} failed`)
  process.exit(1)
}
console.log(`\n${results.length}/${results.length} passed`)
