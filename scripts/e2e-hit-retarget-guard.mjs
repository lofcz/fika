/**
 * Regression: click into text while the hit occluder is STALE (store height
 * smaller than the painted editor — e.g. a height commit mid-flight). The
 * HitLayer's event-time retarget guard must keep the editing editor selected
 * and focused; without it the click selects the element underneath.
 *
 *   node scripts/e2e-hit-retarget-guard.mjs
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const DEV_PORTS = [5173, 5174, 5175, 5176]

async function isFikaDev(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) return false
    const html = await res.text()
    return html.includes('fika-shell') || html.includes('>fika<')
  }
  catch { return false }
}
async function findFikaDev() {
  for (const port of DEV_PORTS) {
    const url = `http://127.0.0.1:${port}/`
    if (await isFikaDev(url)) return url
  }
  return null
}
async function waitForDev(timeoutMs = 60000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const url = await findFikaDev()
    if (url) return url
    await sleep(400)
  }
  return null
}

const browser = await chromium.launch({ headless: true })
let child = null
try {
  let devUrl = await waitForDev(1500)
  if (!devUrl) {
    child = spawn('npm', ['run', 'dev'], { cwd: root, shell: true, stdio: 'ignore' })
    devUrl = await waitForDev(90000)
    if (!devUrl) throw new Error('dev server did not start')
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  await page.goto(devUrl, { waitUntil: 'networkidle' })
  await page.getByText('Add slide').waitFor({ timeout: 90000 })
  await page.evaluate(() => document.querySelectorAll('[data-react-scan], #react-scan-root').forEach(el => el.remove()))
  await page.getByText('Add slide').click()
  await sleep(500)

  await page.locator('svg.lucide-type').first().click({ force: true })
  await sleep(300)
  const canvasBox = await page.evaluate(() => {
    const vp = document.querySelector('[class*=viewport-wrapper]')
    const r = vp.getBoundingClientRect()
    return { x: r.x + r.width * 0.28, y: r.y + r.height * 0.38, w: r.width * 0.42, h: r.height * 0.34 }
  })
  await page.mouse.move(canvasBox.x, canvasBox.y)
  await page.mouse.down()
  await page.mouse.move(canvasBox.x + canvasBox.w, canvasBox.y + canvasBox.h, { steps: 8 })
  await page.mouse.up()
  await sleep(400)
  for (const line of ['prvni radek textu', 'druha radek', 'treti radek', 'ctvrta radek']) {
    await page.keyboard.type(line, { delay: 3 })
    await page.keyboard.press('Enter')
  }
  await sleep(400)

  // Simulate the stale occluder: shrink ONLY the store height (paint stays
  // hugged because auto paint follows the text, not the store).
  await page.evaluate(() => {
    const st = window.__FIKA_SLIDES__.getState()
    const el = st.slides[st.slideIndex].elements.find(e => e.type === 'text' && !e.textType && !e.placeholder)
    st.updateElement({ id: el.id, props: { height: Math.max(30, el.height - 60) } })
  })
  await sleep(300)

  const geom = await page.evaluate(() => {
    const st = window.__FIKA_SLIDES__.getState()
    const el = st.slides[st.slideIndex].elements.find(e => e.type === 'text' && !e.textType && !e.placeholder)
    const pm = document.getElementById(`editable-element-${el.id}`)?.querySelector('.ProseMirror')
    const content = document.getElementById(`editable-element-${el.id}`)?.querySelector('[data-live-box]')
    const r = pm.getBoundingClientRect()
    return { id: el.id, storeH: el.height, paintH: content.getBoundingClientRect().height, pm: { x: r.x, y: r.y, w: r.width, h: r.height } }
  })
  console.log('stale state:', JSON.stringify({ storeH: geom.storeH, paintH: Math.round(geom.paintH) }))

  // Click the very bottom of the last text line (inside painted editor,
  // OUTSIDE the stale store rect).
  const clickY = geom.pm.y + geom.pm.h - 4
  await page.mouse.click(geom.pm.x + geom.pm.w / 2, clickY)
  await sleep(300)

  const after = await page.evaluate(() => {
    const m = window.__FIKA_MAIN__.getState()
    const pm = document.querySelector('.ProseMirror-focused')
    return { active: m.activeElementIdList, editing: m.editingElementId, editorFocused: !!pm }
  })
  const pass = after.active.includes(geom.id) && after.editing === geom.id && after.editorFocused
  console.log(pass ? 'PASS stale-occluder click keeps the editing editor focused' : 'FAIL stale-occluder click lost the editor')
  if (!pass) console.log('   ', JSON.stringify({ id: geom.id, ...after }))
  process.exitCode = pass ? 0 : 1
}
finally {
  await browser.close()
  if (child) child.kill()
}
