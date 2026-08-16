/**
 * Fixed <-> auto height mode swaps must keep the box, operate chrome, store,
 * rendered text, and rail thumbnail in agreement — selected or being edited,
 * with rapid toggles. Regression: swaps could leave a stale fit scale or a
 * stale box height until a resize or keystroke resynced them.
 *
 *   node scripts/e2e-height-mode-swap.mjs
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

  for (const kind of ['text', 'shape']) {
    for (const editing of [false, true]) {
      const variant = `${kind}${editing ? ' while editing' : ''}`
      const id = `swap-${kind}-${editing ? 'ed' : 'sel'}`
      await page.evaluate(({ id, kind }) => {
        const slides = window.__FIKA_SLIDES__
        const main = window.__FIKA_MAIN__
        const content = '<p><span style="font-size: 48px; font-family: Georgia;">Mode swap probe text that is far too big for this small box so the fixed fit must shrink it</span></p>'
        const element = kind === 'text'
          ? {
              type: 'text', id,
              left: 100, top: 100, width: 420, height: 120, rotate: 0,
              content, defaultFontName: 'Georgia', defaultColor: '#111111',
              fill: '', lineHeight: 1.15, inset: [10, 10, 10, 10],
              fixedHeight: true, vAlign: 'top',
            }
          : {
              type: 'shape', id,
              left: 100, top: 100, width: 420, height: 120, rotate: 0,
              viewBox: [200, 100],
              path: 'M 0 0 L 200 0 L 200 100 L 0 100 Z',
              fill: '#f3e8d8',
              text: { content, align: 'top', defaultFontName: '', defaultColor: '#333', fixedHeight: true },
            }
        slides.getState().addSlide({ id: `slide-${id}`, elements: [element] })
        main.getState().setActiveElementIdList([])
        window.__FIKA_SLIDES__.getState().updateSlideIndex(slides.getState().slides.length - 1)
      }, { id, kind })
      await sleep(700)
      await page.evaluate((id) => {
        const main = window.__FIKA_MAIN__
        main.getState().setEditingElementId('')
        main.getState().setActiveElementIdList([id])
        main.getState().setEditorareaFocus(true)
      }, id)
      await sleep(400)
      if (editing) {
        const box = await page.locator(`#editable-element-${id} [data-live-box]`).boundingBox()
        await page.mouse.dblclick(box.x + 60, box.y + 12)
        await sleep(400)
      }

      const read = () => page.evaluate((id) => {
        const slides = window.__FIKA_SLIDES__.getState()
        const slide = slides.slides[slides.slideIndex]
        const el = slide.elements.find(e => e.id === id)
        const root = document.getElementById(`editable-element-${id}`)
        const pm = root?.querySelector('.ProseMirror, .ProseMirror-static')
        const fitHost = root?.querySelector('[data-text-fit-host]')
        const contentBox = root?.querySelector('[data-live-box]')
        const operate = document.getElementById(`operate-element-${id}`)
        const scale = window.__FIKA_MAIN__.getState().canvasScale
        if (!el || !pm || !root) return { ok: false }
        const text = el.type === 'shape' ? el.text : el
        const inset = text.inset || [10, 10, 10, 10]
        const span = pm.querySelector('span[style*=font-size]')
        const host = [...document.querySelectorAll('[data-thumbnail-slide]')].find(n => n.getAttribute('data-thumbnail-slide') === slide.id)
        let thumbBoxH = null
        if (host) {
          const thumbScale = host.getBoundingClientRect().width / slides.viewportSize
          const match = [...host.querySelectorAll('[class*=base-element-text], [class*=base-element-shape]')]
            .find(n => Math.abs(parseFloat(n.style.left) - el.left) < 1 && Math.abs(parseFloat(n.style.top) - el.top) < 1)
          if (match) thumbBoxH = Math.round(match.getBoundingClientRect().height / thumbScale)
        }
        return {
          ok: true,
          fixed: text.fixedHeight ?? null,
          storeH: Math.round(el.height),
          contentBoxH: contentBox ? Math.round(contentBox.getBoundingClientRect().height / scale) : null,
          opRectH: operate ? Math.round(operate.getBoundingClientRect().height / scale) : null,
          renderedTextH: Math.round(pm.scrollHeight + inset[0] + inset[2]),
          fitVar: fitHost ? parseFloat(getComputedStyle(fitHost).getPropertyValue('--text-fit-scale')) || 1 : 1,
          spanFont: span ? parseFloat(getComputedStyle(span).fontSize) : null,
          thumbBoxH,
        }
      }, id)

      const toggle = async (mode) => {
        await page.evaluate((mode) => {
          const btn = document.querySelector(`[data-height-mode=${mode}]`)
          if (btn) btn.click()
        }, mode)
        await sleep(800)
      }

      // baseline: fixed with shrunken text — text fits, chrome agrees
      let s = await read()
      rec(
        `${variant}: fixed baseline fits and chrome agrees`,
        s.ok && s.fixed === true
          && s.renderedTextH <= s.storeH + 2
          && (s.opRectH == null || Math.abs(s.opRectH - s.storeH) <= 3)
          && (s.contentBoxH == null || Math.abs(s.contentBoxH - s.storeH) <= 3),
        s,
      )

      // -> AUTO: scale var cleared, full-size text, everything == text height
      await toggle('auto')
      s = await read()
      rec(
        `${variant}: switch to auto restores full size and syncs the box`,
        s.ok && (s.fixed === false || s.fixed === null)
          && s.fitVar === 1
          && Math.abs((s.spanFont ?? 48) - 48) <= 1
          && Math.abs(s.renderedTextH - s.storeH) <= 3
          && (s.contentBoxH == null || Math.abs(s.contentBoxH - s.storeH) <= 3)
          && (s.opRectH == null || Math.abs(s.opRectH - s.storeH) <= 3)
          && (s.thumbBoxH == null || Math.abs(s.thumbBoxH - s.storeH) <= 4),
        s,
      )

      // -> FIXED again: locked at the synced height, still agrees everywhere
      await toggle('fixed')
      s = await read()
      rec(
        `${variant}: switch back to fixed keeps everything in sync`,
        s.ok && s.fixed === true
          && s.renderedTextH <= s.storeH + 2
          && (s.opRectH == null || Math.abs(s.opRectH - s.storeH) <= 3)
          && (s.contentBoxH == null || Math.abs(s.contentBoxH - s.storeH) <= 3)
          && (s.thumbBoxH == null || Math.abs(s.thumbBoxH - s.storeH) <= 4),
        s,
      )

      // rapid toggles ending on auto
      for (const mode of ['auto', 'fixed', 'auto', 'fixed', 'auto']) await toggle(mode)
      s = await read()
      rec(
        `${variant}: rapid toggles end fully synced`,
        s.ok && s.fitVar === 1
          && Math.abs(s.renderedTextH - s.storeH) <= 3
          && (s.opRectH == null || Math.abs(s.opRectH - s.storeH) <= 3)
          && (s.contentBoxH == null || Math.abs(s.contentBoxH - s.storeH) <= 3)
          && (s.thumbBoxH == null || Math.abs(s.thumbBoxH - s.storeH) <= 4),
        s,
      )

      await page.evaluate((slideId) => window.__FIKA_SLIDES__.getState().deleteSlide(slideId), `slide-${id}`)
      await sleep(150)
      await page.evaluate(() => window.__FIKA_SLIDES__.getState().updateSlideIndex(0))
      await sleep(150)
    }
  }
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
