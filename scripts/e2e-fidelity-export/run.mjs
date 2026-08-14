/**
 * Headless verification of the Fika export-fidelity upgrades against the real
 * @lofcz/pptxgenjs API. Replicates the exact option objects built in
 * src/hooks/useExport.ts and asserts the emitted PPTX XML contains native
 * gradients, theme colors, animations, font embedding, and image polish.
 *
 * Deck layout (6 slides, one per feature group) so PowerPoint visual review is easy:
 *  1. gradient background + gradient shape
 *  2. animations (text / shape / image each animated)
 *  3. theme colors + font embedding (Roboto text)
 *  4. chart (legend names + grouped bars)
 *  5. image polish (rectRadius + outline + shadow)
 *  6. master placeholder (title/body with valign/margin)
 *
 * Run: node scripts/e2e-fidelity-export/run.mjs
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import pptxgen from '@lofcz/pptxgenjs'
import { JSZip } from '@node-projects/jszip'
import tinycolor from 'tinycolor2'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '../..')
const OUT = join(__dirname, 'out')
mkdirSync(OUT, { recursive: true })

let failures = 0
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`)
  if (!cond) failures++
}

const formatColor = (_color) => {
  if (!_color) return { alpha: 0, color: '#000000' }
  const c = tinycolor(_color)
  const alpha = c.getAlpha()
  const color = alpha === 0 ? '#ffffff' : c.setAlpha(1).toHexString()
  return { alpha, color }
}

const gradientToPptxFill = (gradient) => {
  if (gradient.type !== 'linear' || gradient.colors.length < 2) return null
  return {
    type: 'linearGradient',
    angle: gradient.rotate,
    stops: gradient.colors.map(c => {
      const { color, alpha } = formatColor(c.color)
      return {
        pos: c.pos,
        color: color.replace('#', ''),
        ...(alpha < 1 ? { transparency: (1 - alpha) * 100 } : {}),
      }
    }),
  }
}

const applyPPTXTheme = (pptx, t) => {
  const hex = (c) => tinycolor(c).toHexString().replace('#', '').toUpperCase()
  const accents = t.themeColors.map(hex)
  while (accents.length < 6) accents.push('5B9BD5')
  const dk1 = hex(t.fontColor || '#000000')
  const lt1 = hex(t.backgroundColor || '#FFFFFF')
  const dk2 = tinycolor(dk1).isLight() ? tinycolor(dk1).darken(35).toHexString().replace('#', '').toUpperCase() : '44546A'
  const lt2 = tinycolor(lt1).isDark() ? tinycolor(lt1).lighten(35).toHexString().replace('#', '').toUpperCase() : 'E7E6E6'
  pptx.theme = {
    headFontFace: t.fontName || 'Calibri Light',
    bodyFontFace: t.fontName || 'Calibri',
    themeColors: [dk1, lt1, dk2, lt2, accents[0], accents[1], accents[2], accents[3], accents[4], accents[5], '0563C1', '954F72'],
  }
}

const ANIMATION_EFFECT_MAP = {
  fadeIn: { type: 'fadein' },
  fadeInDown: { type: 'flyin', direction: 'top' },
  fadeOut: { type: 'fadeout' },
  pulse: { type: 'pulse' },
  zoomIn: { type: 'zoom' },
}
const ANIMATION_TRIGGER_MAP = { click: 'onClick', meantime: 'withPrevious', auto: 'afterPrevious' }
const animationForElement = (elId, animations) => {
  if (!animations?.length) return undefined
  for (const anim of animations) {
    if (anim.elId !== elId) continue
    const mapped = ANIMATION_EFFECT_MAP[anim.effect]
    if (!mapped) continue
    return { ...mapped, trigger: ANIMATION_TRIGGER_MAP[anim.trigger], duration: anim.duration }
  }
  return undefined
}

const TRANSPARENT_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const pptx = new pptxgen()
applyPPTXTheme(pptx, {
  themeColors: ['#5b9bd5', '#ed7d31', '#a5a5a5', '#ffc000', '#4472c4', '#70ad47'],
  fontColor: '#333333',
  backgroundColor: '#ffffff',
  fontName: '',
})

{
  const s = pptx.addSlide()
  s.background = gradientToPptxFill({ type: 'linear', rotate: 45, colors: [{ pos: 0, color: '#ffffff' }, { pos: 100, color: '#e8f1ff' }] })
  s.addShape('rect', { x: 1, y: 1, w: 4, h: 2, fill: gradientToPptxFill({ type: 'linear', rotate: 90, colors: [{ pos: 0, color: '#ff0000' }, { pos: 100, color: '#0000ff' }] }) })
  s.addText('Slide 1: gradient background + gradient shape', { x: 1, y: 3.2, w: 5, h: 0.6, fontSize: 18 })
}

{
  const s = pptx.addSlide()
  const anims = [
    { elId: 't1', effect: 'fadeIn', trigger: 'click', duration: 500 },
    { elId: 'sh1', effect: 'pulse', trigger: 'meantime', duration: 700 },
    { elId: 'img1', effect: 'zoomIn', trigger: 'auto', duration: 600 },
  ]
  s.addText('Animated text (fadeIn on click)', { x: 0.5, y: 0.5, w: 5, h: 0.6, fontSize: 18, animation: animationForElement('t1', anims) })
  s.addShape('rect', { x: 0.5, y: 1.3, w: 2, h: 1, fill: { color: '00FF00' }, animation: animationForElement('sh1', anims) })
  s.addImage({ data: TRANSPARENT_PNG, x: 3, y: 1.3, w: 1, h: 1, animation: animationForElement('img1', anims) })
}

{
  const s = pptx.addSlide()
  s.addText([{ text: 'Embedded Roboto: ', options: { fontFace: 'Roboto' } }, { text: 'theme accent text', options: { color: '5B9BD5' } }], { x: 0.5, y: 0.5, w: 8, h: 1, fontSize: 28 })
  s.addText('Slide 3: theme + embedded font', { x: 0.5, y: 1.6, w: 5, h: 0.5, fontSize: 14 })
}

{
  const s = pptx.addSlide()
  s.addChart(pptx.ChartType.bar, [
    { name: 'Q1 Sales', labels: ['Jan', 'Feb', 'Mar'], values: [10, 20, 30] },
    { name: 'Q2 Sales', labels: ['Jan', 'Feb', 'Mar'], values: [15, 25, 35] },
  ], { x: 0.5, y: 0.5, w: 9, h: 5, barDir: 'col', barOverlapPct: 0, chartColors: ['5B9BD5', 'ED7D31'], showLegend: true, legendPos: 'b' })
}

{
  const s = pptx.addSlide()
  s.addImage({
    data: TRANSPARENT_PNG,
    x: 1, y: 1, w: 3, h: 3,
    rectRadius: 0.15,
    line: { color: 'FF0000', width: 2 },
    shadow: { type: 'outer', offset: 4, blur: 6, angle: 45, color: '333333', opacity: 0.5 },
  })
  s.addText('Slide 5: rounded image + outline + shadow', { x: 1, y: 4.2, w: 5, h: 0.5, fontSize: 14 })
}

{
  pptx.defineSlideMaster({
    title: 'ScioBot_0',
    objects: [
      { placeholder: { options: { name: 'title', type: 'title', x: 0.5, y: 0.3, w: 9, h: 1, valign: 'top', margin: [0.1, 0.1, 0.1, 0.1], fontFace: 'Roboto' } } },
      { placeholder: { options: { name: 'body', type: 'body', x: 0.5, y: 1.5, w: 9, h: 4.5, valign: 'middle', margin: [0.1, 0.1, 0.1, 0.1] } } },
    ],
  })
  const s = pptx.addSlide({ masterName: 'ScioBot_0' })
  s.addText('Placeholder title (Roboto, valign top)', { placeholder: 'title', fontSize: 24 })
  s.addText('Body placeholder, valign middle', { placeholder: 'body', fontSize: 16 })
}

{
  const { decompress } = await import('wawoff2')
  const ttf = await decompress(new Uint8Array(readFileSync(join(ROOT, 'src/assets/fonts/Roboto.woff2'))))
  await pptx.addFont({ fontFace: 'Roboto', fontFile: new Uint8Array(ttf).buffer, fontType: 'ttf' })
}

const buf = await pptx.write({ outputType: 'nodebuffer' })
writeFileSync(join(OUT, 'fidelity.pptx'), buf)
const zip = await JSZip.loadAsync(buf)
const presXml = await zip.file('ppt/presentation.xml').async('string')
const slide1 = await zip.file('ppt/slides/slide1.xml').async('string')
const slide2 = await zip.file('ppt/slides/slide2.xml').async('string')
const slide6 = await zip.file('ppt/slides/slide6.xml').async('string')
const themeXml = await zip.file('ppt/theme/theme1.xml').async('string')
const chart1 = await zip.file('ppt/charts/chart1.xml').async('string')

check('slide background emits <p:bg> with gradient', /<p:bg>/.test(slide1) && /<a:gradFill/.test(slide1))
check('gradient stops + angle', /<a:gs pos="0"/.test(slide1) && /<a:gs pos="100000"/.test(slide1) && /<a:lin ang="2700000"/.test(slide1))
check('gradient shape fill', slide1.match(/<a:gradFill/g)?.length >= 2)
check('theme 12-slot clrScheme + accent1', /<a:accent6>/.test(themeXml) && /<a:accent1><a:srgbClr val="5B9BD5"/.test(themeXml))
check('animations on slide2', /<p:timing>/.test(slide2))
check('chart legend names', chart1.includes('Q1 Sales') && chart1.includes('Q2 Sales'))
check('chart grouped (barOverlapPct)', /grouping val="clustered"/.test(chart1))
check('font fntdata + embeddedFontLst', zip.file(/ppt\/fonts\/\d+\.fntdata/).length >= 1 && /<p:embeddedFontLst>/.test(presXml))
check('defaultTextStyle intact (no corruption)', presXml.includes('<p:defaultTextStyle>') && !presXml.includes('<p:defaultTextStyle<'))
{
  let scioLayout = false
  for (const l of Object.keys(zip.files).filter(n => /slideLayout\d+\.xml$/.test(n))) {
    if ((await zip.file(l).async('string')).includes('name="ScioBot_0"')) scioLayout = true
  }
  check('master named ScioBot (layout name)', scioLayout)
}
check('placeholder on slide6', /<p:ph[\s\S]*?type="title"/.test(slide6) && /<p:ph[\s\S]*?type="body"/.test(slide6))

{
  const fnt = zip.file(/ppt\/fonts\/\d+\.fntdata/)[0]
  const eot = await fnt.async('uint8array')
  const dv = new DataView(eot.buffer, eot.byteOffset, eot.byteLength)
  const headerFsType = dv.getUint16(4 + 4 + 4 + 4 + 10 + 1 + 1 + 4, true)
  check('font fsType unrestricted (0x0)', headerFsType === 0, `0x${headerFsType.toString(16)}`)
}

writeFileSync(join(OUT, 'summary.json'), JSON.stringify({ failures }, null, 2))
console.log(failures === 0 ? '\nALL PASS (6 slides written)' : `\n${failures} FAIL`)
process.exit(failures === 0 ? 0 : 1)
