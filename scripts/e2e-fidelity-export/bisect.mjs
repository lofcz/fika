/** Build variant PPTX files toggling each new feature to isolate the corrupting one. */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import pptxgen from 'pptxgenjs-plus'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '../..')
const OUT = join(__dirname, 'out')
mkdirSync(OUT, { recursive: true })

const { decompress } = await import('wawoff2')
const fontFile = new Uint8Array(await decompress(new Uint8Array(readFileSync(join(ROOT, 'src/assets/fonts/Roboto.woff2'))))).buffer

async function build(name, { font = false, anim = false, chart = false, gradBg = false, gradShape = false, theme = false } = {}) {
  const pptx = new pptxgen()
  if (theme) {
    pptx.theme = { headFontFace: 'Calibri Light', bodyFontFace: 'Calibri', themeColors: ['333333', 'FFFFFF', '44546A', 'E7E6E6', '5B9BD5', 'ED7D31', 'A5A5A5', 'FFC000', '4472C4', '70AD47', '0563C1', '954F72'] }
  }
  const slide = pptx.addSlide()
  if (gradBg) slide.background = { type: 'linearGradient', angle: 45, stops: [{ pos: 0, color: 'FFFFFF' }, { pos: 100, color: 'E8F1FF' }] }
  if (gradShape) slide.addShape('rect', { x: 1, y: 1, w: 3, h: 2, fill: { type: 'linearGradient', angle: 90, stops: [{ pos: 0, color: 'FF0000' }, { pos: 100, color: '0000FF' }] } })
  if (anim) slide.addShape('rect', { x: 5, y: 1, w: 2, h: 1, fill: { color: '00FF00' }, animation: { type: 'fadein', trigger: 'onClick', duration: 500 } })
  if (!anim && !gradShape) slide.addShape('rect', { x: 1, y: 3, w: 2, h: 1, fill: { color: '00FF00' } })
  if (chart) {
    const cs = pptx.addSlide()
    cs.addChart(pptx.ChartType.bar, [
      { name: 'Q1 Sales', labels: ['A', 'B'], values: [1, 2] },
      { name: 'Q2 Sales', labels: ['A', 'B'], values: [3, 4] },
    ], { x: 1, y: 1, w: 5, h: 4, barDir: 'col', barOverlapPct: 0, chartColors: ['5B9BD5', 'ED7D31'] })
  }
  if (font) await pptx.addFont({ fontFace: 'Roboto', fontFile, fontType: 'ttf' })
  const buf = await pptx.write({ outputType: 'nodebuffer' })
  writeFileSync(join(OUT, `${name}.pptx`), buf)
  console.log('built', name, buf.length, 'bytes')
}

await build('v-base', {})
await build('v-theme', { theme: true })
await build('v-gradbg', { gradBg: true })
await build('v-gradshape', { gradShape: true })
await build('v-anim', { anim: true })
await build('v-chart', { chart: true })
await build('v-font', { font: true })
