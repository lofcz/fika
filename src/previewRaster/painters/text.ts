import Konva from 'konva'
import type { PPTTextElement } from '@/types/slides'
import { htmlToText } from '@/utils/common'
import { serializeRichTextHtml } from '@/utils/prosemirror'
import { isUnfilledPlaceholder, repairFilledPlaceholderHtml } from '@/utils/placeholderPaint'
import { authoredTextFitSize, resolveTextBoxLayout, textBoxJustify, textElementLocksSize } from '@/utils/placeholderLayout'
import { placeholderPromptSizeOf, placeholderTypedSizeOf } from '@/configs/textPresets'
import { textFitScaleForHtml } from '@/utils/textFit'
import { needsHtmlBooth, readTextPaintLayout, textPaintHtml } from '../textPaintHtml'
import { familiesFromHtml, quoteFontFamily, rasterHtml, waitForFonts } from './booth'
import { resolveRasterTextPaint, type RasterPaintContext } from './contrast'

export { needsHtmlBooth }

const lockedFitScale = (element: PPTTextElement, html: string) => {
  if (!textElementLocksSize(element) || !html) return 1
  const inset = element.inset || [10, 10, 10, 10]
  return textFitScaleForHtml(html, {
    innerWidth: Math.max(1, element.width - inset[1] - inset[3]),
    innerHeight: Math.max(1, element.height - inset[0] - inset[2]),
    defaultFontFamily: element.defaultFontName,
    defaultSize: authoredTextFitSize(element),
    lineHeight: element.lineHeight ?? 1.5,
    letterSpacing: element.wordSpace || 0,
    blockSpace: element.paragraphSpace === undefined ? 5 : element.paragraphSpace,
  })
}

const plainFromHtml = (html: string) => (
  htmlToText(
    html
      .replace(/<\/p>\s*<p/gi, '</p>\n<p')
      .replace(/<br\s*\/?>/gi, '\n'),
  )
)

export type KonvaHtmlBox = {
  html: string
  width: number
  height: number
  inset?: [number, number, number, number]
  fontSize: number
  fontFamily: string
  color: string
  align?: 'left' | 'center' | 'right' | 'justify'
  verticalAlign?: 'top' | 'middle' | 'bottom'
  lineHeight?: number
  letterSpacing?: number
  fill?: string
  opacity?: number
  rotate?: number
}

export const paintKonvaHtmlBox = (box: KonvaHtmlBox) => {
  const inset = box.inset || [10, 10, 10, 10]
  const layout = readTextPaintLayout(box.html)
  const fontStyle = [
    layout.italic ? 'italic' : '',
    layout.bold ? 'bold' : '',
  ].filter(Boolean).join(' ') || 'normal'
  const text = new Konva.Text({
    x: inset[3],
    y: inset[0],
    width: Math.max(1, box.width - inset[1] - inset[3]),
    height: Math.max(1, box.height - inset[0] - inset[2]),
    text: plainFromHtml(box.html),
    fontSize: box.fontSize,
    fontFamily: quoteFontFamily(box.fontFamily || 'sans-serif'),
    fontStyle,
    fill: box.color,
    align: box.align || layout.align || 'left',
    verticalAlign: box.verticalAlign || 'top',
    lineHeight: box.lineHeight ?? 1.5,
    letterSpacing: box.letterSpacing || 0,
    wrap: 'word',
    listening: false,
    perfectDrawEnabled: false,
  })
  const group = new Konva.Group({
    listening: false,
    opacity: box.opacity ?? 1,
  })
  if (box.fill && box.fill !== 'transparent') {
    group.add(new Konva.Rect({
      width: box.width,
      height: box.height,
      fill: box.fill,
      listening: false,
    }))
  }
  group.add(text)
  if (!box.rotate) return group
  const pivoted = new Konva.Group({
    listening: false,
    x: box.width / 2,
    y: box.height / 2,
    offsetX: box.width / 2,
    offsetY: box.height / 2,
    rotation: box.rotate,
  })
  pivoted.add(group)
  return pivoted
}

const paintKonvaText = (element: PPTTextElement, html: string, ink: string) => {
  const layout = readTextPaintLayout(html)
  const htmlSize = layout.fontSize
  const typed = element.placeholder ? placeholderTypedSizeOf(element) : undefined
  const prompt = element.placeholder ? placeholderPromptSizeOf(element) : undefined
  const authoredSize = (typed && htmlSize && Math.round(htmlSize) === Math.round(prompt || 0))
    ? typed
    : (htmlSize || typed || element.placeholderFontSize || 16)
  return paintKonvaHtmlBox({
    html,
    width: element.width,
    height: element.height,
    inset: element.inset || [10, 10, 10, 10],
    fontSize: Math.max(1, authoredSize * lockedFitScale(element, html)),
    fontFamily: familiesFromHtml(html)[0] || element.defaultFontName || 'sans-serif',
    color: layout.color || ink,
    align: layout.align || element.placeholderAlign || 'left',
    verticalAlign: resolveTextBoxLayout(element).vAlign,
    lineHeight: element.lineHeight ?? 1.5,
    letterSpacing: element.wordSpace || 0,
    fill: element.fill,
    opacity: element.opacity,
    rotate: element.rotate,
  })
}

export const paintText = async (element: PPTTextElement, captureScale = 1, paintContext?: RasterPaintContext) => {
  if (isUnfilledPlaceholder(element)) return null
  const raw = element.content?.trim()
  const repaired = raw ? repairFilledPlaceholderHtml(element, element.content) : ''
  const contrasted = repaired
    ? resolveRasterTextPaint(element.defaultColor, repaired, element, paintContext)
    : { ink: element.defaultColor || paintContext?.themeFontColor || '#333', html: '' }
  const body = contrasted.html ? serializeRichTextHtml(contrasted.html) : ''
  if (body && !needsHtmlBooth(body, element.vertical)) {
    await waitForFonts([element.defaultFontName || '', ...familiesFromHtml(body)])
    return paintKonvaText(element, body, contrasted.ink)
  }
  const inset = element.inset || [10, 10, 10, 10]
  const paragraphSpace = element.paragraphSpace === undefined ? 5 : element.paragraphSpace
  const justify = textBoxJustify(resolveTextBoxLayout(element))
  const outline = element.outline
  const border = outline?.width
    ? `border:${outline.width}px ${outline.style || 'solid'} ${outline.color || '#e4e4e7'};`
    : ''
  const html = textPaintHtml({
    body,
    inset,
    paragraphSpace,
    lineHeight: element.lineHeight ?? 1.5,
    letterSpacing: element.wordSpace || 0,
    color: contrasted.ink,
    fontFamily: element.defaultFontName || 'sans-serif',
    justify,
    writingMode: element.vertical ? 'vertical-rl' : 'horizontal-tb',
    background: element.fill || 'transparent',
    opacity: element.opacity ?? 1,
    border,
    fitScale: lockedFitScale(element, body),
  })
  const node = await rasterHtml(html, element.width, element.height, captureScale)
  if (!element.rotate) return node
  const group = new Konva.Group({
    listening: false,
    x: element.width / 2,
    y: element.height / 2,
    offsetX: element.width / 2,
    offsetY: element.height / 2,
    rotation: element.rotate,
  })
  group.add(node)
  return group
}
