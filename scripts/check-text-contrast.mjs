import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { bundleEntry } from './lib/bundle-ts-entry.mjs'

/**
 * Runtime checks for the painter's-algorithm text contrast fixer:
 *  - background query engine (topmost layer under a text, slide bg fallback,
 *    unknown layers like images)
 *  - WCAG contrast fixing (background-polarity invert; keep correct-polarity
 *    text even when the ratio sits a hair under the trigger)
 *  - HTML color declaration rewriting (must not touch background-color)
 *  - slide-level fixer for text / shape text / latex / table cells
 *  - wiring: AI-import flag plumbed through embed controller, never default-on
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const bundle = (entry, fileName) => bundleEntry(root, entry, fileName)

const {
  CONTRAST_TRIGGER,
  CONTRAST_TARGET,
  gradientAverageColor,
  queryBackgroundsUnder,
  fixColorForBackgrounds,
  collectHtmlTextColors,
  rewriteHtmlTextColors,
  fixSlideTextContrast,
  resolveSlideSurfaceColor,
  resolveSlideSurfaceColors,
  resolveDefaultFontColor,
  resolveElementDefaultFontColor,
  resolveChartLabelColor,
  resolvePlaceholderColor,
  applySlideBackgroundWithContrast,
  preferredInk,
  rewriteDefaultInksInHtml,
} = await bundle('src/utils/textContrast.ts', 'textContrast.mjs')

const tinycolorMod = await import('tinycolor2')
const tinycolor = tinycolorMod.default

const failures = []
function check(condition, message) {
  if (!condition) failures.push(message)
}

const THEME = { backgroundColor: '#ffffff', fontColor: '#333333' }

const rect = (overrides) => ({
  id: 'x', left: 0, top: 0, width: 100, height: 100, rotate: 0, ...overrides,
})
const shape = (overrides) => rect({
  type: 'shape', viewBox: [200, 200], path: 'M 0 0 L 200 0 L 200 200 L 0 200 Z',
  fixedRatio: false, fill: '#ffffff', ...overrides,
})
const textEl = (overrides) => rect({
  type: 'text', content: '<p><span style="color: #000000;">hi</span></p>',
  defaultFontName: 'Arial', defaultColor: '#000000', ...overrides,
})

{
  const els = [shape({ fill: '#0b1a33' }), textEl({ left: 10, top: 10, width: 50, height: 20 })]
  const q = queryBackgroundsUnder(els, 1, undefined, THEME)
  check(q.colors.length === 1 && q.colors[0] === '#0b1a33', `topmost layer under text wins (got ${JSON.stringify(q)})`)
  check(!q.unknown, 'opaque solid card is not unknown')
}
{
  const els = [shape({ fill: '#111111' }), shape({ fill: '#eeeeee' }), textEl({ left: 20, top: 20, width: 40, height: 20 })]
  const q = queryBackgroundsUnder(els, 2, undefined, THEME)
  check(q.colors.length === 1 && q.colors[0] === '#eeeeee', `later element paints over earlier (got ${JSON.stringify(q)})`)
}
{
  const els = [textEl()]
  const q = queryBackgroundsUnder(els, 0, { type: 'solid', color: '#123456' }, THEME)
  check(q.colors.length === 1 && q.colors[0] === '#123456', 'slide solid background is the fallback')
}
{
  const els = [textEl()]
  const q = queryBackgroundsUnder(els, 0, undefined, { ...THEME, backgroundColor: '#fafafa' })
  check(q.colors[0] === '#fafafa', 'theme background is the final fallback')
}
{
  const els = [
    rect({ type: 'image', src: 'x.png', fixedRatio: false }),
    textEl({ left: 10, top: 10, width: 50, height: 20 }),
  ]
  const q = queryBackgroundsUnder(els, 1, { type: 'solid', color: '#ffffff' }, THEME)
  check(q.unknown && q.colors.length === 0, `image cover yields unknown (got ${JSON.stringify(q)})`)
}
{
  const els = [
    rect({ id: 'photo', type: 'image', src: 'x.png', fixedRatio: false }),
    textEl({ left: 10, top: 10, width: 50, height: 20 }),
  ]
  const images = {
    byElementId: new Map([['photo', [{ minX: 0, maxX: 100, minY: 0, maxY: 100, hex: '#0b1a33' }]]]),
  }
  const q = queryBackgroundsUnder(els, 1, { type: 'solid', color: '#ffffff' }, THEME, { images })
  check(!q.unknown && q.colors.length === 1 && q.colors[0] === '#0b1a33', `sampled image cover yields hex (got ${JSON.stringify(q)})`)
}
{
  const els = [
    rect({ id: 'photo', type: 'image', src: 'x.png', fixedRatio: false, colorMask: 'rgba(0,0,0,0.5)' }),
    textEl({ left: 10, top: 10, width: 50, height: 20 }),
  ]
  const images = {
    byElementId: new Map([['photo', [{ minX: 0, maxX: 100, minY: 0, maxY: 100, hex: '#ffffff' }]]]),
  }
  const q = queryBackgroundsUnder(els, 1, { type: 'solid', color: '#ffffff' }, THEME, { images })
  check(!q.unknown && q.colors[0] === '#808080', `colorMask composites over sampled image (got ${JSON.stringify(q)})`)
}
{
  const els = [textEl()]
  const q = queryBackgroundsUnder(els, 0, { type: 'image', image: { src: 'bg.png', size: 'cover' } }, THEME)
  check(q.unknown && q.colors.length === 0, 'image slide background yields unknown')
}
{
  const els = [textEl()]
  const images = {
    byElementId: new Map(),
    slideBackground: [{ minX: 0, maxX: 100, minY: 0, maxY: 100, hex: '#111111' }],
  }
  const q = queryBackgroundsUnder(els, 0, { type: 'image', image: { src: 'bg.png', size: 'cover' } }, THEME, { images })
  check(!q.unknown && q.colors[0] === '#111111', `sampled slide image background yields hex (got ${JSON.stringify(q)})`)
}
{
  const els = [shape({ left: 0, top: 0, width: 60, height: 100, fill: '#0b1a33' }), textEl({ left: 20, top: 40, width: 100, height: 20 })]
  const q = queryBackgroundsUnder(els, 1, { type: 'solid', color: '#ffffff' }, THEME)
  check(q.colors.includes('#0b1a33') && q.colors.includes('#ffffff'), `straddling text sees both layers (got ${JSON.stringify(q)})`)
}
{
  const els = [shape({ fill: '#222222' }), shape({ fill: 'rgba(0,0,0,0)' }), textEl({ left: 20, top: 20, width: 40, height: 20 })]
  const q = queryBackgroundsUnder(els, 2, undefined, THEME)
  check(q.colors[0] === '#222222', 'transparent fill falls through to the layer below')
}
{
  const els = [
    shape({ fill: '#111111' }),
    shape({
      fill: '',
      outline: { style: 'solid', width: 4, color: '#ff0000' },
    }),
    textEl({ left: 20, top: 20, width: 40, height: 20 }),
  ]
  const q = queryBackgroundsUnder(els, 2, { type: 'solid', color: '#ffffff' }, THEME)
  check(q.colors.length === 1 && q.colors[0] === '#111111', `hollow outlined shape is see-through (got ${JSON.stringify(q)})`)
}
{
  const ellipsePath = 'M 100 0 A 50 50 0 1 1 100 200 A 50 50 0 1 1 100 0 Z'
  const els = [
    shape({ left: 0, top: 0, width: 100, height: 100, fill: '#00aa00', path: ellipsePath }),
    textEl({ left: 0, top: 0, width: 10, height: 10 }),
  ]
  const q = queryBackgroundsUnder(els, 1, { type: 'solid', color: '#ffffff' }, THEME)
  check(q.colors.includes('#ffffff') && !q.colors.includes('#00aa00'), `text in ellipse bbox corner sees slide, not fill (got ${JSON.stringify(q)})`)
}
{
  const ellipsePath = 'M 100 0 A 50 50 0 1 1 100 200 A 50 50 0 1 1 100 0 Z'
  const els = [
    shape({ left: 0, top: 0, width: 100, height: 100, fill: '#00aa00', path: ellipsePath }),
    textEl({ left: 40, top: 40, width: 20, height: 20 }),
  ]
  const q = queryBackgroundsUnder(els, 1, { type: 'solid', color: '#ffffff' }, THEME)
  check(q.colors.length === 1 && q.colors[0] === '#00aa00', `text in ellipse center sees fill (got ${JSON.stringify(q)})`)
}
{
  const els = [
    shape({ fill: '#0f172a' }),
    shape({ fill: '#172554cc' }),
    textEl({ left: 20, top: 20, width: 40, height: 20, content: '<p><span style="color: #000000;">a/b</span></p>' }),
  ]
  const q = queryBackgroundsUnder(els, 2, undefined, THEME)
  check(!q.unknown && q.colors.length === 1, `translucent card composites to an opaque color (got ${JSON.stringify(q)})`)
  check(q.colors[0].startsWith('#'), 'composited color is hex')
  const slide = { id: 'tx', elements: els }
  const fixes = fixSlideTextContrast(slide, THEME)
  check(fixes > 0, 'black text on translucent dark card gets fixed')
}
{
  const avg = gradientAverageColor({ type: 'linear', rotate: 0, colors: [{ pos: 0, color: '#000000' }, { pos: 100, color: '#ffffff' }] })
  check(tinycolor(avg).toHexString() === '#808080', `gradient averages stops (got ${avg})`)
}

{
  check(fixColorForBackgrounds('#ffffff', ['#0b1a33']) === null, 'white on navy is readable — untouched')
  check(fixColorForBackgrounds('#000000', ['#ffffff']) === null, 'black on white is readable — untouched')

  const fixedBlack = fixColorForBackgrounds('#000000', ['#0b1a33'])
  check(fixedBlack === '#ffffff', `black on navy inverts to white (got ${fixedBlack})`)
  check(tinycolor.readability(fixedBlack, '#0b1a33') >= CONTRAST_TARGET, `invert clears target (got ${tinycolor.readability(fixedBlack, '#0b1a33')})`)

  const fixedWhite = fixColorForBackgrounds('#ffffff', ['#f5f5f5'])
  check(fixedWhite === '#000000', `white on near-white inverts to black (got ${fixedWhite})`)

  check(fixColorForBackgrounds('#ffffff', ['#18a6a6']) === null, 'white on mid-teal chip is kept (correct polarity)')
  check(fixColorForBackgrounds('#ffffff', ['#0d9488']) === null, 'white on ocean accent chip is kept')
  check(fixColorForBackgrounds('#dddddd', ['#18a6a6']) === '#ffffff', 'muddy light grey on teal snaps to white')

  const teal = fixColorForBackgrounds('#0f4c4c', ['#0b1a33'])
  check(teal === '#ffffff', `dark teal on navy inverts to white (got ${teal})`)
  check(fixColorForBackgrounds('#c0c0c0', ['#f5f5f5']) === '#000000', 'light grey on near-white inverts to black')

  const both = fixColorForBackgrounds('#444444', ['#0b1a33', '#333333'])
  check(both === '#ffffff', `dark grey on dual dark bgs → white (got ${both})`)
  check(['#0b1a33', '#333333'].every(bg => tinycolor.readability(both, bg) >= CONTRAST_TARGET), 'invert satisfies all backgrounds')

  check(fixColorForBackgrounds('#888888', ['#333333']) === null, 'borderline-but-readable color (3.56:1) left alone')

  check(CONTRAST_TRIGGER === 3 && CONTRAST_TARGET === 4.5, 'WCAG thresholds pinned (large-text trigger, normal-text target)')
}

{
  check(resolveSlideSurfaceColor({ type: 'solid', color: '#0e243d' }) === '#0e243d', 'solid hex surface')
  check(resolveSlideSurfaceColor({ type: 'solid', color: 'rgba(14,36,61,1)' }) === '#0e243d', 'opaque rgba surface flattens to hex')
  check(resolveDefaultFontColor('#333333', '#0e243d') === '#ffffff', 'theme grey on navy → white ink')
  check(resolveDefaultFontColor('#333333', '#ffffff') === '#000000', 'theme grey on white → black, not leftover #333')
  check(resolveElementDefaultFontColor('#333333', {
    background: { type: 'solid', color: 'rgba(14,36,61,1)' },
  }) === '#ffffff', 'element default ink tracks rgba slide fill')
  check(resolveElementDefaultFontColor('#333333', {
    fill: '#ffffff',
    background: { type: 'solid', color: '#0e243d' },
  }) === '#000000', 'own white fill → black ink')
  check(preferredInk('#4a4a4a') === '#ffffff', 'charcoal slide → white ink')
  check(preferredInk('#2d2d2d') === '#ffffff', 'dark charcoal → white ink')

  check(preferredInk('#e64980') === '#ffffff', 'theme pink → white default ink')
  check(preferredInk('#ec4899') === '#ffffff', 'hot pink just over isDark() cliff → white')
  check(fixColorForBackgrounds('#333333', ['#e64980']) === null, 'conservative fixer keeps #333 on pink (AI chips) — defaults must not use it')
  check(resolveDefaultFontColor('#333333', '#e64980') === '#ffffff', 'default ink on theme pink is white, not kept #333')
  check(resolveDefaultFontColor('#ff0000', '#e64980') === '#ff0000', 'explicit red is not hijacked')
  check(preferredInk('#ffffff') === '#000000', 'white paper → black ink')
  check(preferredInk(['#0e243d', '#1a365d']) === '#ffffff', 'all-dark gradient → white')
  check(rewriteDefaultInksInHtml('<p><span style="color: #333;">dfd</span></p>', '#ffffff').includes('color: #ffffff'), 'baked #333 snaps to white')
  check(rewriteDefaultInksInHtml('<p><span style="color: #ff0000;">x</span></p>', '#ffffff').includes('#ff0000'), 'explicit span color is kept')

  check(resolveChartLabelColor({ textColor: '#333333' }, {
    background: { type: 'solid', color: '#0e243d' },
  }) === '#ffffff', 'chart labels on navy slide → white')
  check(resolveChartLabelColor({ textColor: '#333333', fill: '#ffffff' }, {
    background: { type: 'solid', color: '#0e243d' },
  }) === '#000000', 'chart with white fill keeps black labels')
  check(resolveChartLabelColor({ textColor: '#e64980' }, {
    background: { type: 'solid', color: '#0e243d' },
  }) === '#e64980', 'explicit chart series-unrelated label color is kept')
}

{
  const onWhite = resolvePlaceholderColor({ author: '#9aa3ad', body: '#333333', surfaces: ['#ffffff'] })
  check(onWhite === '#000000', `placeholder on white is black (got ${onWhite})`)
  const onNavy = resolvePlaceholderColor({ author: '#9aa3ad', body: '#ffffff', surfaces: ['#0e243d'] })
  check(onNavy === '#ffffff', `placeholder on navy is white (got ${onNavy})`)
  const onPink = resolvePlaceholderColor({ author: '#9aa3ad', body: '#333333', surfaces: ['#e64980'] })
  check(onPink === '#ffffff', `placeholder on theme pink is white (got ${onPink})`)
  const onCharcoal = resolvePlaceholderColor({ author: '#9aa3ad', surfaces: ['#4a4a4a'] })
  check(onCharcoal === '#ffffff', `placeholder on charcoal is white (got ${onCharcoal})`)
  const onGradient = resolvePlaceholderColor({
    author: '#9aa3ad',
    body: '#ffffff',
    surfaces: resolveSlideSurfaceColors({
      type: 'gradient',
      gradient: { type: 'linear', rotate: 0, colors: [{ pos: 0, color: '#0d4f4f' }, { pos: 100, color: '#1a365d' }] },
    }),
  })
  check(onGradient === '#ffffff', `placeholder on dark teal-blue gradient is white (got ${onGradient})`)
}

{
  const slide = {
    id: 'bg-change',
    background: { type: 'solid', color: 'rgba(14,36,61,1)' },
    elements: [
      textEl({
        content: '<p><span style="font-size: 40px; color: #333;">Hello</span></p>',
        defaultColor: '#333',
      }),
      textEl({
        id: 'empty',
        top: 200,
        content: '',
        defaultColor: '#333',
        placeholder: 'Click to add subtitle',
      }),
      {
        type: 'chart',
        id: 'chart',
        left: 0,
        top: 300,
        width: 200,
        height: 200,
        rotate: 0,
        chartType: 'radar',
        themeColors: ['#dd6b66'],
        textColor: '#333',
        data: { labels: ['A'], legends: ['S'], series: [[1]] },
      },
    ],
  }
  const next = applySlideBackgroundWithContrast(slide, THEME)
  check(next.elements[0].defaultColor === '#ffffff', `title defaultColor flips to white (got ${next.elements[0].defaultColor})`)
  check(collectHtmlTextColors(next.elements[0].content)[0] === '#ffffff', 'baked Hello color flips to white')
  check(next.elements[1].defaultColor === '#ffffff', `empty placeholder defaultColor flips to white (got ${next.elements[1].defaultColor})`)
  check(next.elements[1].placeholderColor === '#ffffff', `empty placeholderColor is white (got ${next.elements[1].placeholderColor})`)
  check(next.elements[2].textColor === '#ffffff', `chart labels flip to white (got ${next.elements[2].textColor})`)
  check(slide.elements[0].defaultColor === '#333', 'input slide is not mutated')
}

{
  const slide = {
    id: 'pink-bg',
    background: { type: 'solid', color: '#e64980' },
    elements: [
      textEl({
        content: '<p><span style="font-size: 40px; color: #333;">dfd</span></p>',
        defaultColor: '#333',
      }),
      textEl({
        id: 'sub',
        top: 200,
        content: '',
        defaultColor: '#333',
        placeholder: 'Click to add subtitle',
        placeholderColor: '#9aa3ad',
      }),
      shape({
        fill: '#18a6a6',
        text: {
          content: '<p><span style="color: #ffffff;">1</span></p>',
          defaultFontName: 'Arial',
          defaultColor: '#ffffff',
          align: 'middle',
        },
      }),
    ],
  }
  const next = applySlideBackgroundWithContrast(slide, THEME)
  check(next.elements[0].defaultColor === '#ffffff', `pink slide title defaultColor is white (got ${next.elements[0].defaultColor})`)
  check(collectHtmlTextColors(next.elements[0].content)[0] === '#ffffff', 'baked dfd on pink snaps to white')
  check(next.elements[1].defaultColor === '#ffffff', 'empty subtitle defaultColor on pink is white')
  check(next.elements[1].placeholderColor === '#ffffff', `subtitle placeholder on pink is white (got ${next.elements[1].placeholderColor})`)
  check(collectHtmlTextColors(next.elements[2].text.content)[0] === '#ffffff', 'teal chip keeps white numbers')
  check(next.elements[2].text.defaultColor === '#ffffff', 'teal chip defaultColor stays white')
}

{
  const html = '<p style="text-align: left;"><span style="color: #000000;background-color: #112233;">a</span><span style="color: rgb(255, 0, 0);">b</span></p>'
  const colors = collectHtmlTextColors(html)
  check(colors.includes('#000000') && colors.includes('#ff0000'), `collects hex and rgb() colors (got ${JSON.stringify(colors)})`)
  check(!colors.includes('#112233'), 'background-color is not a text color')

  const rewritten = rewriteHtmlTextColors(html, c => (c === '#000000' ? '#eeeeee' : null))
  check(rewritten.includes('color: #eeeeee'), 'targeted color rewritten')
  check(rewritten.includes('background-color: #112233'), 'background-color untouched')
  check(rewritten.includes('rgb(255, 0, 0)'), 'unmatched colors untouched')
}

{
  const slide = {
    id: 's1',
    elements: [
      shape({
        fill: '#0b1a33',
        text: { content: '<p><span style="color: #000000;">část / celek</span></p>', defaultFontName: 'Arial', defaultColor: '#000000', align: 'middle' },
      }),
    ],
  }
  const fixes = fixSlideTextContrast(slide, THEME)
  check(fixes > 0, 'black-on-dark shape text gets fixed')
  const el = slide.elements[0]
  const newColor = collectHtmlTextColors(el.text.content)[0]
  check(newColor === '#ffffff', `shape text inverted to white (got ${newColor})`)
  check(el.text.defaultColor === '#ffffff', `shape defaultColor inverted to white (got ${el.text.defaultColor})`)
}
{
  const slide = {
    id: 's2',
    elements: [
      shape({ fill: '#101828' }),
      textEl({ left: 10, top: 10, width: 60, height: 20 }),
    ],
  }
  const fixes = fixSlideTextContrast(slide, THEME)
  check(fixes > 0, 'black text element over dark card gets fixed')
}
{
  const slide = {
    id: 's3',
    elements: [
      shape({ fill: '#0b1a33', text: { content: '<p><span style="color: #ffffff;">ok</span></p>', defaultFontName: 'Arial', defaultColor: '#ffffff', align: 'middle' } }),
      textEl({ left: 200, top: 200 }),
    ],
  }
  check(fixSlideTextContrast(slide, THEME) === 0, 'readable slide has zero fixes')
  check(slide.elements[0].text.content.includes('#ffffff'), 'readable colors not rewritten')
}
{
  const slide = {
    id: 'chip',
    background: { type: 'solid', color: '#ffffff' },
    elements: [
      shape({ left: 54, top: 150, width: 30, height: 30, fill: '#18a6a6' }),
      textEl({
        left: 47, top: 150, width: 45, height: 30,
        content: '<p><span style="color: #FFFFFF;">1</span></p>',
        defaultColor: '#ffffff',
      }),
    ],
  }
  check(fixSlideTextContrast(slide, THEME) === 0, 'white number on teal chip is not flipped to black')
  check(slide.elements[1].content.includes('#FFFFFF') || slide.elements[1].content.includes('#ffffff'), 'chip label stays white')
}
{
  const slide = {
    id: 's4',
    elements: [
      rect({ type: 'image', src: 'x.png', fixedRatio: false }),
      textEl({ left: 10, top: 10, width: 50, height: 20 }),
    ],
  }
  check(fixSlideTextContrast(slide, THEME) === 0, 'text over image is left alone')
}
{
  const slide = {
    id: 's4b',
    elements: [
      rect({ id: 'photo', type: 'image', src: 'x.png', fixedRatio: false }),
      textEl({ left: 10, top: 10, width: 50, height: 20 }),
    ],
  }
  const images = {
    byElementId: new Map([['photo', [{ minX: 0, maxX: 100, minY: 0, maxY: 100, hex: '#0b1a33' }]]]),
  }
  check(fixSlideTextContrast(slide, THEME, { images }) > 0, 'black text on dark photo is fixed')
  check(slide.elements[1].content.includes('#ffffff'), `photo caption inverted to white (got ${slide.elements[1].content})`)
}
{
  const slide = {
    id: 's5',
    background: { type: 'solid', color: '#0b1a33' },
    elements: [
      rect({ type: 'latex', latex: 'a', path: 'M 0 0', color: '#000000', strokeWidth: 2, viewBox: [100, 100], fixedRatio: true }),
    ],
  }
  const fixes = fixSlideTextContrast(slide, THEME)
  check(fixes === 1, 'latex color fixed against slide background')
  check(slide.elements[0].color === '#ffffff', `latex inverted to white (got ${slide.elements[0].color})`)
}
{
  const slide = {
    id: 's6',
    elements: [
      rect({
        type: 'table',
        outline: {},
        colWidths: [1],
        cellMinHeight: 36,
        data: [[{ id: 'c1', colspan: 1, rowspan: 1, text: 'x', style: { color: '#111111', backcolor: '#0b1a33' } }]],
      }),
    ],
  }
  const fixes = fixSlideTextContrast(slide, THEME)
  check(fixes === 1, 'dark-on-dark table cell fixed')
  check(slide.elements[0].data[0][0].style.color === '#ffffff', `cell text inverted to white (got ${slide.elements[0].data[0][0].style.color})`)
}
{
  const table = rect({
    type: 'table',
    outline: {},
    colWidths: [1],
    cellMinHeight: 36,
    theme: { color: '#0b1a33', rowHeader: true, rowFooter: false, colHeader: false, colFooter: false },
    data: [
      [{ id: 'h', colspan: 1, rowspan: 1, text: 'Head', style: { color: '#000000' } }],
      [{ id: 'b', colspan: 1, rowspan: 1, text: 'Body', style: { color: '#000000' } }],
    ],
  })
  const slide = { id: 's7', elements: [table] }
  check(fixSlideTextContrast(slide, THEME) === 0, 'themed paper table does not invert black ink')
  check(table.data[0][0].style.color === '#000000', `header text stays black on paper (got ${table.data[0][0].style.color})`)
  check(table.data[1][0].style.color === '#000000', `stripe body text stays black (got ${table.data[1][0].style.color})`)
}
{
  const table = rect({
    type: 'table',
    left: 0, top: 0, width: 100, height: 100,
    outline: {},
    colWidths: [1],
    cellMinHeight: 50,
    theme: { color: '#0b1a33', rowHeader: true, rowFooter: false, colHeader: false, colFooter: false },
    data: [
      [{ id: 'h', colspan: 1, rowspan: 1, text: 'H', style: {} }],
      [{ id: 'b', colspan: 1, rowspan: 1, text: 'B', style: {} }],
    ],
  })
  const els = [table, textEl({ left: 10, top: 10, width: 20, height: 20 })]
  const q = queryBackgroundsUnder(els, 1, { type: 'solid', color: '#ffffff' }, THEME)
  check(!q.unknown && q.colors.length === 1 && q.colors[0] === '#ffffff', `text over table header sees paper (got ${JSON.stringify(q)})`)
}

{
  const { canvasRegionToImagePixels, canvasRegionToCoverPixels } = await bundle(
    'src/utils/imagePaintSample.ts',
    'imagePaintSample.mjs',
  )
  const img = {
    type: 'image', id: 'p', src: 'x', fixedRatio: false,
    left: 0, top: 0, width: 100, height: 50, rotate: 0,
  }
  const full = canvasRegionToImagePixels(img, { minX: 0, maxX: 100, minY: 0, maxY: 50 }, 200, 100)
  check(full && full.left === 0 && full.top === 0 && full.width === 200 && full.height === 100, `full image crop (got ${JSON.stringify(full)})`)

  const clipped = canvasRegionToImagePixels(
    { ...img, clip: { shape: 'rect', range: [[25, 0], [75, 100]] } },
    { minX: 0, maxX: 100, minY: 0, maxY: 50 },
    200, 100,
  )
  check(clipped && clipped.left === 50 && clipped.width === 100, `clip range maps to source pixels (got ${JSON.stringify(clipped)})`)

  const flipped = canvasRegionToImagePixels(
    { ...img, flipH: true },
    { minX: 0, maxX: 50, minY: 0, maxY: 50 },
    200, 100,
  )
  check(flipped && flipped.left === 100 && flipped.width === 100, `flipH mirrors the crop (got ${JSON.stringify(flipped)})`)

  const cover = canvasRegionToCoverPixels(
    { minX: 0, maxX: 1000, minY: 0, maxY: 500 },
    { width: 1000, height: 500 },
    1000, 500,
  )
  check(cover && cover.left === 0 && cover.top === 0 && cover.width === 1000 && cover.height === 500, `1:1 cover crop (got ${JSON.stringify(cover)})`)
}

{
  const read = p => readFileSync(join(root, p), 'utf8')
  const useImport = read('src/hooks/useImport.ts')
  check(useImport.includes('fixContrast?: boolean'), 'importPPTXFile accepts fixContrast')
  check(useImport.includes('fixContrast: false'), 'fixContrast defaults to false (genuine user imports untouched)')
  check(useImport.includes('fixSlideTextContrast(slide'), 'importPPTXFile applies the fixer when flagged')
  check(useImport.includes('sampleImagePaintsForSlide'), 'AI import samples image paints before contrast fix')

  const store = read('src/store/slides.ts')
  check(store.includes('applySlideBackgroundWithContrast'), 'changing a slide background retints unreadable default ink')

  const textElSrc = read('src/views/components/element/TextElement/index.tsx')
  check(textElSrc.includes('resolveElementDefaultFontColor'), 'editor text box consumes the unified default-ink resolver')
  check(textElSrc.includes('caretColor: defaultInkColor'), 'empty caret uses resolved ink, not hardcoded $ink')
  check(!textElSrc.includes('caret-color: $ink'), 'no hardcoded ink caret on empty edit')

  const chartElSrc = read('src/views/components/element/ChartElement/index.tsx')
  check(chartElSrc.includes('resolveChartLabelColor'), 'editor chart labels consume the unified default-ink resolver')
  const chartBaseSrc = read('src/views/components/element/ChartElement/BaseChartElement.tsx')
  check(chartBaseSrc.includes('resolveChartLabelColor'), 'thumbnail/screen charts consume the unified default-ink resolver')
  const createEl = read('src/hooks/useCreateElement.ts')
  check(createEl.includes('textColor: defaultFontColor()'), 'new charts store contrast-aware default ink')

  const chrome = read('src/views/Editor/Canvas/hooks/useOperateChrome.ts')
  check(chrome.includes('preferredInk'), 'selection chrome uses preferredInk, not isDark()')

  const designPanel = read('src/views/Editor/Toolbar/SlideDesignPanel/index.tsx')
  check(designPanel.includes('applySlideBackgroundWithContrast'), 'Apply to all retints text for the new fill')

  const controller = read('src/embed/createController.ts')
  check(/fixContrast:\s*(?:importOptions|options)\?\.fixContrast \?\? false/.test(controller), 'embed controller passes fixContrast through, default off')

  const embedTypes = read('src/embed/types.ts')
  check(embedTypes.includes('fixContrast?: boolean'), 'FikaImportPptxOptions exposes fixContrast')
}

if (failures.length) {
  console.error(`check-text-contrast FAILED (${failures.length}):`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('text contrast checks passed')
