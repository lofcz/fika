import { nanoid } from 'nanoid'
import type { TranslationFunctions } from '@/i18n/i18n-types'
import english from '@/i18n/en/myna'

type MynaTranslations = TranslationFunctions['myna']
let templateMeasureContext: OffscreenCanvasRenderingContext2D | null | undefined

/** Fit explicit template lines before inserting editable text, including longer translations. */
function templateFontSize(lines: string[], width: number, requested: number, bold: boolean) {
  if (templateMeasureContext === undefined) templateMeasureContext = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1).getContext('2d') : null
  if (templateMeasureContext) templateMeasureContext.font = `${bold ? 700 : 400} ${requested}px Arial`
  const measured = Math.max(...lines.map(line => Math.max(templateMeasureContext?.measureText(line).width ?? 0, Array.from(line).length * requested * (bold ? .68 : .56))), 1)
  return Math.min(requested, requested * width * .94 / measured)
}

const fallback = new Proxy({}, { get: (_, key) => () => (english as Record<string, string>)[String(key)] }) as MynaTranslations
import type { FikaDocument } from '@/embed/types'
import type { PPTElement, PPTTextElement, Slide } from '@/types/slides'

export const MYNA_FORMATS = [
  { name: 'Social post', width: 1080, height: 1080 },
  { name: 'Portrait post', width: 1080, height: 1350 },
  { name: 'Story', width: 1080, height: 1920 },
  { name: 'Presentation', width: 1920, height: 1080 },
  { name: 'A4 portrait', width: 794, height: 1123 },
  { name: 'A4 landscape', width: 1123, height: 794 },
  { name: 'Poster', width: 1200, height: 1800 },
  { name: 'Video thumbnail', width: 1280, height: 720 },
  { name: 'Business card', width: 1050, height: 600 },
  { name: 'Banner', width: 1500, height: 500 },
] as const

export const MYNA_TEMPLATES = [
  { id: 'studio', name: 'Creative studio', category: 'Social', background: '#ede9df', ink: '#282c24', accent: '#d7f36b', heading: 'Ideas into\nimpact.', eyebrow: 'THE CREATIVE EDIT', body: 'A little curiosity. A fresh perspective.\nSomething worth sharing.', layout: 'editorial' },
  { id: 'botanical', name: 'Grow together', category: 'Education', background: '#e9efdf', ink: '#183f33', accent: '#aec68c', heading: 'Room to\ngrow.', eyebrow: 'LEARN SOMETHING NEW', body: 'Small steps. Big discoveries.\nYour next chapter starts here.', layout: 'organic' },
  { id: 'workshop', name: 'The workshop', category: 'Events', background: '#29243c', ink: '#fff5e9', accent: '#e8b3f1', heading: 'Make it\nhappen.', eyebrow: 'A HANDS-ON WORKSHOP', body: 'Bring your ideas. Find your people.\nCreate something extraordinary.', layout: 'poster' },
  { id: 'launch', name: 'Fresh launch', category: 'Marketing', background: '#f6e1d6', ink: '#4b2c2e', accent: '#eb7754', heading: 'Meet your\nnew favorite.', eyebrow: 'SOMETHING GOOD IS HERE', body: 'Thoughtfully made. Ready for you.\nDiscover the collection.', layout: 'editorial' },
  { id: 'lesson', name: 'A curious mind', category: 'Education', background: '#edf1fa', ink: '#253762', accent: '#b0c5f0', heading: 'Stay\ncurious.', eyebrow: 'TODAY’S BIG QUESTION', body: 'What will you discover today?\nExplore. Experiment. Explain.', layout: 'organic' },
  { id: 'quote', name: 'Words to keep', category: 'Social', background: '#f8efdc', ink: '#524431', accent: '#dec48d', heading: 'Good things\ntake time.', eyebrow: 'A NOTE TO YOURSELF', body: 'Keep showing up.\nThe best is still ahead.', layout: 'poster' },
] as const

/** Resolve labels at insertion time; existing document content never changes with the UI locale. */
export function getMynaTemplates(t: MynaTranslations = fallback) {
  return MYNA_TEMPLATES.map(template => ({ ...template,
    name: t[`${template.id}Name`](), heading: t[`${template.id}Heading`](),
    eyebrow: t[`${template.id}Eyebrow`](), body: t[`${template.id}Body`](),
    categoryName: t[template.category.toLowerCase() as 'social' | 'education' | 'events' | 'marketing'](),
  }))
}

export function getMynaFormats(t: MynaTranslations = fallback) {
  return MYNA_FORMATS.map((format, index) => ({ ...format, name: t[`format${index}` as 'format0']() }))
}

export function validMynaSize(width: number, height: number) {
  return Number.isInteger(width) && Number.isInteger(height) && width >= 100 && height >= 100 && width <= 8192 && height <= 8192
}

export function createMynaPage(templateId: string, width: number, height: number, t: MynaTranslations = fallback): Slide {
  if (!validMynaSize(width, height)) throw new Error('Design dimensions must be whole pixels between 100 and 8192.')
  const template = getMynaTemplates(t).find(item => item.id === templateId)
  if (!template) throw new Error(`Unknown Myna template: ${templateId}`)
  const unit = Math.min(width, height)
  const elements: PPTElement[] = []
  const shape = (left: number, top: number, w: number, h: number, fill: string, round = false) => {
    elements.push({ id: nanoid(10), type: 'shape', left, top, width: w, height: h, rotate: 0, fill, fixedRatio: false,
      viewBox: [100, 100], path: round ? 'M50 0 A50 50 0 1 1 49.99 0 Z' : 'M0 0 H100 V100 H0 Z' })
  }
  const text = (content: string, left: number, top: number, w: number, size: number, bold = false) => {
    size = templateFontSize(content.split('\n'), w, size, bold)
    const lines = content.split('\n').map(line => line.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'))
    elements.push({ id: nanoid(10), type: 'text', fixedHeight: true, inset: [0, 0, 0, 0], lineHeight: 1.3, paragraphSpace: 0, left, top, width: w, height: size * 1.3 * lines.length, rotate: 0,
      defaultFontName: 'Arial', defaultColor: template.ink,
      content: lines.map(line => `<p style="color:${template.ink};font-size:${size}px;${bold ? 'font-weight:700;' : ''}">${line}</p>`).join('') })
  }
  const pad = unit * .085
  if (template.layout === 'editorial') {
    shape(width * .66, height * .18, width * .25, height * .59, template.accent)
    shape(width * .61, height * .35, unit * .24, unit * .24, template.ink, true)
  }
  else if (template.layout === 'organic') {
    shape(width * .61, height * .12, unit * .3, unit * .3, template.accent, true)
    shape(width * .70, height * .35, unit * .16, unit * .16, template.ink, true)
  }
  else {
    shape(pad, height * .18, width - pad * 2, unit * .02, template.accent)
    shape(width * .70, height * .67, unit * .2, unit * .2, template.accent, true)
  }
  text(template.eyebrow, pad, height * .09, width - pad * 2, unit * .018, true)
  text(template.heading, pad, height * .27, width * .61, unit * .092, true)
  text(template.body, pad, height * .68, width * .65, unit * .024)
  shape(pad, height * .88, unit * .075, unit * .006, template.ink)
  return { id: nanoid(10), elements, background: { type: 'solid', color: template.background } }
}

export function createMynaDocument(t: MynaTranslations = fallback): FikaDocument {
  return { title: t.untitled(), viewport: { size: 1080, ratio: 1 }, slides: [createMynaPage('studio', 1080, 1080, t)] }
}

/** A font pairing is two independently editable text boxes in one movable group. */
export function createMynaTextPair(heading: string, font: string, width: number, height: number, color: string, t: MynaTranslations = fallback): PPTTextElement[] {
  const unit = Math.min(width, height), groupId = nanoid(10)
  const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
  return [heading, t.storyStarts()].map((text, index) => ({
    id: nanoid(10), groupId, type: 'text', fixedHeight: true, inset: [0, 0, 0, 0], lineHeight: 1.3, paragraphSpace: 0, rotate: 0,
    left: width * .15, top: height * .35 + index * unit * .1, width: width * .7, height: unit * (index ? .05 : .085),
    defaultFontName: index ? 'Arial' : font, defaultColor: color,
    content: `<p style="font-size:${unit * (index ? .025 : .06)}px;font-family:${escape(index ? 'Arial' : font)};font-weight:${index || font === 'Georgia' ? 400 : 700};">${escape(text)}</p>`,
  }))
}
