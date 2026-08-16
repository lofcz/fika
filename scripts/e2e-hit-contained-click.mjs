/**
 * Regression: a text box FULLY INSIDE the body placeholder. Click the text
 * at every stage — unselected, selected, editing, after Escape — and with a
 * deliberately stale store height (hit occluder smaller than the painted
 * editor). Every click must resolve to the text box, never the placeholder.
 *
 *   node scripts/e2e-hit-contained-click.mjs
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

  // Text tool, box FULLY INSIDE the body placeholder (85,165,830,284).
  await page.locator('svg.lucide-type').first().click({ force: true })
  await sleep(300)
  const box = await page.evaluate(() => {
    const vp = document.querySelector('[class*=viewport-wrapper]')
    const r = vp.getBoundingClientRect()
    // slide 1000x562.5 mapped to the viewport rect
    const scale = r.width / 1000
    const toScreen = (x, y) => ({ x: r.x + x * scale, y: r.y + y * scale })
    const a = toScreen(300, 210)   // inside placeholder (85..915, 165..449)
    const b = toScreen(640, 380)
    return { a, b, scale }
  })
  await page.mouse.move(box.a.x, box.a.y)
  await page.mouse.down()
  await page.mouse.move(box.b.x, box.b.y, { steps: 6 })
  await page.mouse.up()
  await sleep(400)
  await page.keyboard.type('wefj wjef wejf wjef wej fwef', { delay: 3 })
  await page.keyboard.press('Enter')
  await page.keyboard.type('lorem ipsum dolor sit amet', { delay: 3 })
  await sleep(300)

  const state = () => page.evaluate(() => {
    const st = window.__FIKA_SLIDES__.getState()
    const m = window.__FIKA_MAIN__.getState()
    const slide = st.slides[st.slideIndex]
    const el = slide.elements.find(e => e.type === 'text' && !e.textType && !e.placeholder)
    const body = slide.elements.find(e => e.type === 'text' && e.textType === 'content')
    const pm = document.getElementById(`editable-element-${el.id}`)?.querySelector('.ProseMirror')
    const r = pm?.getBoundingClientRect()
    return {
      textBoxId: el.id,
      bodyId: body?.id,
      elIndex: slide.elements.findIndex(e => e.id === el.id),
      bodyIndex: slide.elements.findIndex(e => e.id === body?.id),
      active: m.activeElementIdList,
      editing: m.editingElementId,
      editorFocused: !!document.querySelector('.ProseMirror-focused'),
      pm: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null,
    }
  })

  const s0 = await state()
  console.log('setup:', JSON.stringify({ elIndex: s0.elIndex, bodyIndex: s0.bodyIndex, active: s0.active, editing: s0.editing }))

  const clickText = async (fx, fy) => {
    const s = await state()
    await page.mouse.click(s.pm.x + s.pm.w * fx, s.pm.y + s.pm.h * fy)
    await sleep(250)
    return state()
  }

  // Escape to a clean slate: nothing selected.
  await page.keyboard.press('Escape')
  await sleep(200)
  await page.evaluate(() => window.__FIKA_MAIN__.getState().setActiveElementIdList([]))
  await sleep(200)

  const results = []

  // 1st click: select the text box.
  const s1 = await clickText(0.5, 0.5)
  results.push({ step: '1st click (unselected)', ok: s1.active.includes(s1.textBoxId), active: s1.active })

  // 2nd click: enter edit.
  const s2 = await clickText(0.5, 0.5)
  results.push({ step: '2nd click (selected)', ok: s2.editing === s2.textBoxId || s2.active.includes(s2.textBoxId), active: s2.active, editing: s2.editing })

  // 3rd click: caret within edit.
  const s3 = await clickText(0.3, 0.3)
  results.push({ step: '3rd click (editing)', ok: s3.editing === s3.textBoxId, active: s3.active, editing: s3.editing })

  // Escape (back to selected) then click again.
  await page.keyboard.press('Escape')
  await sleep(250)
  const s4 = await clickText(0.5, 0.7)
  results.push({ step: 'click after Escape', ok: s4.active.includes(s4.textBoxId), active: s4.active, editing: s4.editing })

  // Clicks across the whole text while editing.
  const s5 = await clickText(0.7, 0.8)
  results.push({ step: 'click low-right while active', ok: s5.active.includes(s5.textBoxId), active: s5.active })

  // Stale SELECTED state: shrink ONLY the store height (paint stays hugged by
  // the text), then click the text below the stale rect — the guard must
  // enter edit on the text box, not select the placeholder.
  await page.keyboard.press('Escape')
  await sleep(250)
  await page.evaluate(() => {
    const st = window.__FIKA_SLIDES__.getState()
    const el = st.slides[st.slideIndex].elements.find(e => e.type === 'text' && !e.textType && !e.placeholder)
    st.updateElement({ id: el.id, props: { height: Math.max(30, el.height - 80) } })
  })
  await sleep(300)
  const s6 = await clickText(0.5, 0.9)
  results.push({
    step: 'click below stale store rect (selected)',
    ok: s6.active.includes(s6.textBoxId) && (s6.editing === s6.textBoxId || s6.editing === ''),
    active: s6.active,
    editing: s6.editing,
  })

  const bad = results.filter(r => !r.ok)
  console.log(JSON.stringify(results, null, 1))
  console.log(bad.length ? `FAILING STEPS: ${bad.length}` : 'ALL CLICK STAGES OK')
  process.exitCode = bad.length ? 1 : 0
}
finally {
  await browser.close()
  if (child) child.kill()
}
