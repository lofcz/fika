import Konva from 'konva'
import type { PPTTextElement } from '@/types/slides'
import { htmlToText } from '@/utils/common'
import { serializeRichTextHtml } from '@/utils/prosemirror'
import { isUnfilledPlaceholder, repairFilledPlaceholderHtml } from '@/utils/placeholderPaint'
import { authoredTextFitSize, resolveTextBoxLayout, textBoxJustify, textElementLocksSize } from '@/utils/placeholderLayout'
import { placeholderPromptSizeOf, placeholderTypedSizeOf } from '@/configs/textPresets'
import { textFitScaleForHtml } from '@/utils/textFit'
import { escapeBoothText, familiesFromHtml, quoteFontFamily, rasterHtml, waitForFonts } from './booth'

const FONT_SIZE_RE = /font-size:\s*([\d.]+)px/gi
const COLOR_RE = /(?:^|[^-])color:\s*([^;]+)/i
const ALIGN_RE = /text-align:\s*(left|center|right|justify)/i

const uniqueFontSizes = (html: string) => {
  const sizes = new Set<string>()
  for (const match of html.matchAll(FONT_SIZE_RE)) sizes.add(match[1])
  return sizes
}

const needsHtmlBooth = (html: string, vertical?: boolean) => {
  if (vertical) return true
  if (/<(ul|ol|li|table)\b/i.test(html)) return true
  return uniqueFontSizes(html).size > 1
}

const plainFromHtml = (html: string) => (
  htmlToText(
    html
      .replace(/<\/p>\s*<p/gi, '</p>\n<p')
      .replace(/<br\s*\/?>/gi, '\n'),
  )
)

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

const paintKonvaText = (element: PPTTextElement, html: string) => {
  const inset = element.inset || [10, 10, 10, 10]
  const htmlSize = Number([...html.matchAll(FONT_SIZE_RE)][0]?.[1])
  const typed = element.placeholder ? placeholderTypedSizeOf(element) : undefined
  const prompt = element.placeholder ? placeholderPromptSizeOf(element) : undefined
  const authoredSize = (typed && htmlSize === prompt)
    ? typed
    : (htmlSize || typed || element.placeholderFontSize || 20)
  const fontSize = Math.max(1, authoredSize * lockedFitScale(element, html))
  const color = html.match(COLOR_RE)?.[1]?.trim() || element.defaultColor || '#333'
  const align = (html.match(ALIGN_RE)?.[1] || element.placeholderAlign || 'left') as 'left' | 'center' | 'right' | 'justify'
  const fontStyle = [
    /font-style:\s*italic/i.test(html) || /<(em|i)\b/i.test(html) ? 'italic' : '',
    /font-weight:\s*(bold|[6-9]00)/i.test(html) || /<(strong|b)\b/i.test(html) ? 'bold' : '',
  ].filter(Boolean).join(' ') || 'normal'
  const verticalAlign = resolveTextBoxLayout(element).vAlign
  const text = new Konva.Text({
    x: inset[3],
    y: inset[0],
    width: Math.max(1, element.width - inset[1] - inset[3]),
    height: Math.max(1, element.height - inset[0] - inset[2]),
    text: plainFromHtml(html),
    fontSize,
    fontFamily: quoteFontFamily(element.defaultFontName || 'sans-serif'),
    fontStyle,
    fill: color,
    align,
    verticalAlign,
    lineHeight: element.lineHeight ?? 1.5,
    letterSpacing: element.wordSpace || 0,
    wrap: 'word',
    listening: false,
    perfectDrawEnabled: false,
  })
  const group = new Konva.Group({
    listening: false,
    opacity: element.opacity ?? 1,
  })
  if (element.fill && element.fill !== 'transparent') {
    group.add(new Konva.Rect({
      width: element.width,
      height: element.height,
      fill: element.fill,
      listening: false,
    }))
  }
  group.add(text)
  if (!element.rotate) return group
  const pivoted = new Konva.Group({
    listening: false,
    x: element.width / 2,
    y: element.height / 2,
    offsetX: element.width / 2,
    offsetY: element.height / 2,
    rotation: element.rotate,
  })
  pivoted.add(group)
  return pivoted
}

export const paintText = async (element: PPTTextElement, captureScale = 1) => {
  if (isUnfilledPlaceholder(element)) return null
  const raw = element.content?.trim()
  const repaired = raw ? repairFilledPlaceholderHtml(element, element.content) : ''
  const body = repaired ? serializeRichTextHtml(repaired) : ''
  if (body && !needsHtmlBooth(body, element.vertical)) {
    await waitForFonts([element.defaultFontName || '', ...familiesFromHtml(body)])
    return paintKonvaText(element, body)
  }
  const inset = element.inset || [10, 10, 10, 10]
  const paragraphSpace = element.paragraphSpace === undefined ? 5 : element.paragraphSpace
  const justify = textBoxJustify(resolveTextBoxLayout(element))
  const outline = element.outline
  const border = outline?.width
    ? `border:${outline.width}px ${outline.style || 'solid'} ${outline.color || '#e4e4e7'};`
    : ''
  const fitScale = lockedFitScale(element, body)
  const fitHost = fitScale < 1
    ? `display:flex;flex-direction:column;justify-content:${justify || 'flex-start'};`
    : (justify ? `display:flex;flex-direction:column;justify-content:${justify};` : '')
  const fittedBody = fitScale < 1
    ? `<div data-text-fit-host style="zoom:${fitScale};width:100%">${body}</div>`
    : body
  const html = `<style>.fika-booth-text p{margin:0 0 ${paragraphSpace}px}</style><div class="ProseMirror ProseMirror-static fika-booth-text" style="width:100%;height:100%;box-sizing:border-box;overflow:hidden;word-break:break-word;${border}background:${element.fill || 'transparent'};opacity:${element.opacity ?? 1};line-height:${element.lineHeight ?? 1.5};letter-spacing:${element.wordSpace || 0}px;color:${escapeBoothText(element.defaultColor || '#333')};font-family:${escapeBoothText(quoteFontFamily(element.defaultFontName || 'sans-serif'))};writing-mode:${element.vertical ? 'vertical-rl' : 'horizontal-tb'};padding:${inset[0]}px ${inset[1]}px ${inset[2]}px ${inset[3]}px;${fitHost}">${fittedBody}</div>`
  return rasterHtml(html, element.width, element.height, captureScale).then(node => {
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
  })
}
