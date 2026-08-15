/** Shared text layout + the HTML booth markup the live editor paints.
 *  Konva.Text can only paint one uniform run (one size/color/font/weight).
 *  Any other rich text SnapDOMs this same ProseMirror HTML.
 *
 *  Browser: DOMParser + CSSOM. Node (rstest): parse5 + style-to-object.
 */

import { parseFragment } from 'parse5'
import type { DefaultTreeAdapterMap } from 'parse5'
import styleToObject from 'style-to-object'
import tinycolor from 'tinycolor2'
import { cssLengthToPx } from '../utils/cssLength'
import { DEFAULT_TEXT_FONT_SIZE } from '../utils/textFit'

/** Structure and marks Konva.Text cannot paint at all. */
const BOOTH_TAGS = new Set([
  'table', 'ul', 'ol', 'li', 'sup', 'sub', 'blockquote',
  'a', 'mark', 'u', 's', 'del', 'ins', 'code', 'pre',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
])
const ALIGN = new Set(['left', 'center', 'right', 'justify'])

type P5Child = DefaultTreeAdapterMap['childNode']
type P5Element = DefaultTreeAdapterMap['element']
type P5Text = DefaultTreeAdapterMap['textNode']

type InlineStyle = {
  fontSize?: string
  color?: string
  textAlign?: string
  fontStyle?: string
  fontWeight?: string
  fontFamily?: string
  textDecoration?: string
  backgroundColor?: string
}

type RichTextNode = {
  tag: string
  indent: boolean
  style: InlineStyle
}

const isP5Element = (node: P5Child): node is P5Element => (
  'tagName' in node && 'attrs' in node
)

const isP5Text = (node: P5Child): node is P5Text => node.nodeName === '#text'

const fromStyleAttr = (attr: string | null | undefined): InlineStyle => {
  const obj = attr ? styleToObject(attr) : null
  if (!obj) return {}
  return {
    fontSize: obj['font-size'],
    color: obj.color,
    textAlign: obj['text-align'],
    fontStyle: obj['font-style'],
    fontWeight: obj['font-weight'],
    fontFamily: obj['font-family'],
    textDecoration: obj['text-decoration'] || obj['text-decoration-line'],
    backgroundColor: obj['background-color'] || obj.background,
  }
}

const fromCssom = (style: CSSStyleDeclaration): InlineStyle => ({
  fontSize: style.fontSize || undefined,
  color: style.color || undefined,
  textAlign: style.textAlign || undefined,
  fontStyle: style.fontStyle || undefined,
  fontWeight: style.fontWeight || undefined,
  fontFamily: style.fontFamily || undefined,
  textDecoration: style.textDecoration || style.textDecorationLine || undefined,
  backgroundColor: style.backgroundColor || undefined,
})

const walkDomParser = (html: string, visit: (node: RichTextNode) => void) => {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const walk = (el: Element) => {
    visit({
      tag: el.tagName.toLowerCase(),
      indent: el.hasAttribute('data-indent'),
      style: fromCssom((el as HTMLElement).style),
    })
    for (const child of el.children) walk(child)
  }
  for (const child of doc.body.children) walk(child)
}

const walkParse5 = (html: string, visit: (node: RichTextNode) => void) => {
  const walk = (nodes: P5Child[]) => {
    for (const node of nodes) {
      if (!isP5Element(node)) continue
      visit({
        tag: node.tagName,
        indent: node.attrs.some((attr) => attr.name === 'data-indent'),
        style: fromStyleAttr(node.attrs.find((attr) => attr.name === 'style')?.value),
      })
      walk(node.childNodes)
    }
  }
  walk(parseFragment(html).childNodes)
}

const forEachRichTextNode = (html: string, visit: (node: RichTextNode) => void) => {
  if (!html) return
  if (typeof DOMParser !== 'undefined') walkDomParser(html, visit)
  else walkParse5(html, visit)
}

const isBoldWeight = (weight?: string) => {
  if (!weight) return false
  const n = parseInt(weight, 10)
  if (Number.isFinite(n)) return n >= 600
  return weight === 'bold' || weight === 'bolder'
}

const isNormalWeight = (weight?: string) => (
  weight === 'normal' || weight === '400'
)

const sizePx = (raw?: string) => cssLengthToPx(raw, DEFAULT_TEXT_FONT_SIZE)

const normalizeColor = (raw?: string) => {
  if (!raw) return ''
  const color = tinycolor(raw)
  if (!color.isValid()) return raw.trim().toLowerCase()
  if (color.getAlpha() <= 0.05) return ''
  return color.toHexString()
}

const hasInk = (text?: string | null) => !!text?.replace(/\s+/g, '')

type InheritedPaint = {
  fontSize?: string
  color?: string
  fontFamily?: string
  fontWeight?: string
  fontStyle?: string
  textDecoration?: string
  backgroundColor?: string
  bold: boolean
  italic: boolean
}

const inheritPaint = (parent: InheritedPaint, tag: string, style: InlineStyle): InheritedPaint => {
  let bold = parent.bold || isBoldWeight(style.fontWeight) || tag === 'strong' || tag === 'b'
  if (isNormalWeight(style.fontWeight)) bold = false
  let italic = parent.italic || style.fontStyle === 'italic' || tag === 'em' || tag === 'i'
  if (style.fontStyle === 'normal') italic = false
  return {
    fontSize: style.fontSize || parent.fontSize,
    color: style.color || parent.color,
    fontFamily: style.fontFamily || parent.fontFamily,
    fontWeight: style.fontWeight || parent.fontWeight,
    fontStyle: style.fontStyle || parent.fontStyle,
    textDecoration: style.textDecoration || parent.textDecoration,
    backgroundColor: style.backgroundColor || parent.backgroundColor,
    bold,
    italic,
  }
}

const ROOT_PAINT: InheritedPaint = { bold: false, italic: false }

/** Konva.Text cannot paint decoration or a span fill. */
const konvaCannotPaint = (paint: InheritedPaint) => {
  const deco = (paint.textDecoration || '').toLowerCase()
  if (deco && deco !== 'none') return true
  return !!normalizeColor(paint.backgroundColor)
}

const paintSignature = (paint: InheritedPaint) => {
  if (paint.fontSize && sizePx(paint.fontSize) == null) return null
  const size = paint.fontSize ? Math.round(sizePx(paint.fontSize)!) : ''
  const family = (paint.fontFamily || '').replace(/['"]/g, '').trim().toLowerCase()
  return [
    size,
    normalizeColor(paint.color),
    family,
    paint.bold ? '1' : '0',
    paint.italic ? '1' : '0',
  ].join('|')
}

const walkTextLeaves = (
  html: string,
  visit: (paint: InheritedPaint) => void,
  onBoothTag: () => void,
) => {
  if (!html) return
  if (typeof DOMParser !== 'undefined') {
    const walk = (node: Node, paint: InheritedPaint) => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (hasInk(node.textContent)) visit(paint)
        return
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return
      const el = node as HTMLElement
      const tag = el.tagName.toLowerCase()
      if (BOOTH_TAGS.has(tag) || el.hasAttribute('data-indent')) {
        onBoothTag()
        return
      }
      const next = inheritPaint(paint, tag, fromCssom(el.style))
      for (const child of el.childNodes) walk(child, next)
    }
    const doc = new DOMParser().parseFromString(html, 'text/html')
    for (const child of doc.body.childNodes) walk(child, ROOT_PAINT)
    return
  }
  const walk = (nodes: P5Child[], paint: InheritedPaint) => {
    for (const node of nodes) {
      if (isP5Text(node)) {
        if (hasInk(node.value)) visit(paint)
        continue
      }
      if (!isP5Element(node)) continue
      if (BOOTH_TAGS.has(node.tagName) || node.attrs.some((attr) => attr.name === 'data-indent')) {
        onBoothTag()
        continue
      }
      const next = inheritPaint(
        paint,
        node.tagName,
        fromStyleAttr(node.attrs.find((attr) => attr.name === 'style')?.value),
      )
      walk(node.childNodes, next)
    }
  }
  walk(parseFragment(html).childNodes, ROOT_PAINT)
}

export const fontSizesPx = (html: string) => {
  const sizes = new Set<number>()
  forEachRichTextNode(html, (node) => {
    const px = sizePx(node.style.fontSize)
    if (px != null) sizes.add(Math.round(px))
  })
  return sizes
}

export const readTextPaintLayout = (html: string) => {
  let fontSize: number | undefined
  let align: 'left' | 'center' | 'right' | 'justify' | undefined
  let color: string | undefined
  let italic = false
  let bold = false
  forEachRichTextNode(html, (node) => {
    if (fontSize == null) {
      const px = sizePx(node.style.fontSize)
      if (px != null) fontSize = px
    }
    if (!align && node.style.textAlign && ALIGN.has(node.style.textAlign)) {
      align = node.style.textAlign as typeof align
    }
    if (!color && node.style.color) color = node.style.color.trim()
    if (node.style.fontStyle === 'italic' || node.tag === 'em' || node.tag === 'i') italic = true
    if (isBoldWeight(node.style.fontWeight) || node.tag === 'strong' || node.tag === 'b') bold = true
  })
  return { fontSize, align, color, italic, bold }
}

/**
 * Konva.Text paints one fill / size / font / weight for the whole box.
 * SnapDOM the live HTML unless every text leaf shares that one run.
 */
export const needsHtmlBooth = (html: string, vertical?: boolean) => {
  if (vertical) return true
  const signatures = new Set<string>()
  let booth = false
  walkTextLeaves(html, (paint) => {
    if (booth) return
    if (konvaCannotPaint(paint)) {
      booth = true
      return
    }
    const signature = paintSignature(paint)
    if (signature == null) {
      booth = true
      return
    }
    signatures.add(signature)
  }, () => {
    booth = true
  })
  return booth || signatures.size > 1
}

export const escapeBoothText = (value: string) => (
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
)

export const quoteFontFamily = (raw: string) => {
  const family = raw.split(',')[0].replace(/['"]/g, '').trim()
  if (!family) return 'sans-serif'
  return /[^a-zA-Z0-9-]/.test(family) ? `"${family}"` : family
}

export const familiesFromHtml = (html: string) => {
  const found: string[] = []
  forEachRichTextNode(html, (node) => {
    if (node.style.fontFamily) found.push(node.style.fontFamily)
  })
  return found
}

export type TextPaintHtmlBox = {
  body: string
  inset: [number, number, number, number]
  paragraphSpace: number
  lineHeight: number
  letterSpacing: number
  color: string
  fontFamily: string
  justify?: string
  writingMode?: 'horizontal-tb' | 'vertical-rl'
  background?: string
  opacity?: number
  border?: string
  fitScale?: number
}

export const textPaintHtml = (box: TextPaintHtmlBox) => {
  const inset = box.inset
  const fitScale = box.fitScale ?? 1
  const justify = box.justify
    ? `display:flex;flex-direction:column;justify-content:${box.justify};`
    : ''
  const inner = `<div class="ProseMirror ProseMirror-static" style="width:100%;word-break:break-word;white-space:pre-wrap">${box.body}</div>`
  const fitted = fitScale < 1
    ? `<div data-text-fit-host style="zoom:${fitScale};width:100%">${inner}</div>`
    : inner
  return `<div data-fika-text-paint="prosemirror" style="width:100%;height:100%;box-sizing:border-box;overflow:hidden;${box.border || ''}background:${box.background || 'transparent'};opacity:${box.opacity ?? 1};line-height:${box.lineHeight};letter-spacing:${box.letterSpacing}px;color:${escapeBoothText(box.color)};font-family:${escapeBoothText(quoteFontFamily(box.fontFamily || 'sans-serif'))};writing-mode:${box.writingMode || 'horizontal-tb'};padding:${inset[0]}px ${inset[1]}px ${inset[2]}px ${inset[3]}px;--paragraphSpace:${box.paragraphSpace}px;${justify}">${fitted}</div>`
}
