/**
 * Fixed-height text must NEVER overflow its box — in the editor canvas or the
 * rail thumbnail. The fit search measures with pretext, which can disagree
 * with the browser on wrap points (narrow boxes compound the drift over many
 * lines, worth whole clipped lines); useTextFit therefore verifies the real
 * rendered height and corrects geometrically, with a paragraph-gap fallback
 * for boxes shorter than the fixed-px gaps.
 *
 * This sweep covers content kinds (plain / mixed-size / list / paragraphs),
 * geometries (wide-shallow, narrow-tall, degenerate), and line heights.
 *
 *   node scripts/e2e-fixed-fit-never-clips.mjs
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DEV_PORTS = [5173, 5174, 5175, 5176]
const sleep = ms => new Promise(r => setTimeout(r, ms))

const CONTENTS = {
  plain: '<p><span style="font-size: 40px; font-family: Georgia;">Války a spory o pravdu trvaly celá desetiletí a změnily české země navždy</span></p>',
  mixed: '<p><span style="font-size: 40px; font-family: Georgia;">Války a spory o </span><span style="font-size: 120px; font-family: Georgia;">pravdu</span><span style="font-size: 40px; font-family: Georgia;"> trvaly celá desetiletí</span></p>',
  list: '<ul><li><span style="font-size: 32px;">První bod seznamu který je dost dlouhý</span></li><li><span style="font-size: 32px;">Druhý bod seznamu který je také dlouhý</span></li><li><span style="font-size: 32px;">Třetí bod</span></li></ul>',
  paragraphs: '<p><span style="font-size: 28px;">První odstavec s textem</span></p><p><span style="font-size: 28px;">Druhý odstavec s textem</span></p><p><span style="font-size: 28px;">Třetí odstavec s delším textem který se možná zalomí</span></p>',
}
// 220x200 is the original repro; 940x32 and 700x45 are gap-dominated degenerates.
const SIZES = [[600, 90], [300, 120], [220, 200], [700, 45], [450, 150], [940, 32]]
const LINES = [0.9, 1.15, 1.5]

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

  let caseNo = 0
  for (const [kind, content] of Object.entries(CONTENTS)) {
    for (const [w, h] of SIZES) {
      for (const lineHeight of LINES) {
        caseNo++
        const id = `clip-${caseNo}`
        await page.evaluate(({ id, content, w, h, lineHeight }) => {
          const slides = window.__FIKA_SLIDES__
          const main = window.__FIKA_MAIN__
          slides.getState().addSlide({
            id: `slide-${id}`,
            elements: [{
              type: 'text',
              id,
              left: 80, top: 80, width: w, height: h,
              rotate: 0,
              content,
              defaultFontName: 'Georgia',
              defaultColor: '#111111',
              fill: '',
              lineHeight,
              inset: [10, 10, 10, 10],
              fixedHeight: true,
              vAlign: 'top',
            }],
          })
          main.getState().setActiveElementIdList([])
          window.__FIKA_SLIDES__.getState().updateSlideIndex(slides.getState().slides.length - 1)
        }, { id, content, w, h, lineHeight })
        await sleep(450)
        const measure = await page.evaluate((id) => {
          const slides = window.__FIKA_SLIDES__.getState()
          const slide = slides.slides[slides.slideIndex]
          const el = slide.elements.find(e => e.id === id)
          const root = document.getElementById(`editable-element-${id}`)
          const pm = root?.querySelector('.ProseMirror, .ProseMirror-static')
          if (!pm || !el) return { ok: false }
          const availH = el.height - (el.inset || [10, 10, 10, 10])[0] - (el.inset || [10, 10, 10, 10])[2]
          const overflow = pm.scrollHeight - availH
          const host = [...document.querySelectorAll('[data-thumbnail-slide]')].find(n => n.getAttribute('data-thumbnail-slide') === slide.id)
          let thumbOverflow = null
          if (host) {
            const tpm = [...host.querySelectorAll('.ProseMirror, .ProseMirror-static')]
              .find(n => (n.textContent || '').includes('Války') || (n.textContent || '').includes('odstavec') || (n.textContent || '').includes('bod') || (n.textContent || '').length > 0)
            if (tpm) thumbOverflow = tpm.scrollHeight - availH
          }
          return { ok: true, overflow, thumbOverflow }
        }, id)
        rec(
          `${kind} ${w}x${h}@lh${lineHeight} never clips`,
          measure.ok && measure.overflow <= 1 && (measure.thumbOverflow == null || measure.thumbOverflow <= 1),
          measure.ok ? { overflow: measure.overflow, thumbOverflow: measure.thumbOverflow } : measure,
        )
        await page.evaluate((slideId) => {
          window.__FIKA_SLIDES__.getState().deleteSlide(slideId)
        }, `slide-${id}`)
        await sleep(120)
        await page.evaluate(() => window.__FIKA_SLIDES__.getState().updateSlideIndex(0))
        await sleep(120)
      }
    }
  }
  await page.close()
}
finally {
  await browser.close()
  if (child) child.kill()
}

const failed = results.filter(r => !r.pass)
for (const r of failed.slice(0, 10)) {
  console.log(`FAIL ${r.name}`, JSON.stringify(r.measured))
}
if (failed.length) {
  console.error(`\n${failed.length}/${results.length} cases clip`)
  process.exit(1)
}
console.log(`${results.length}/${results.length} cases never clip`)
