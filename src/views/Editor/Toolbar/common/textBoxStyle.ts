import type { PPTElement, PPTShapeElement, PPTTextElement, ShapeText, TextAlignVertical, TextInset } from '@/types/slides'
import { placeholderFixedRestoreHeight, resolveTextBoxLayout, shapeTextLocksSize } from '@/utils/placeholderLayout'

export const DEFAULT_TEXT_INSET: TextInset = [10, 10, 10, 10]

export type TextBoxStyle = {
  fill: string
  lineHeight: number
  paragraphSpace: number
  inset: TextInset
  fixedHeight: boolean
  vAlign: TextAlignVertical
}

export function isShapeTextFixedHeight(text?: ShapeText): boolean {
  return shapeTextLocksSize(text)
}

export type TextBoxStylePatch = {
  fill?: string
  lineHeight?: number
  paragraphSpace?: number
  inset?: TextInset
  fixedHeight?: boolean
  vAlign?: TextAlignVertical
}

export function isTextStyleTarget(el: PPTElement | null): el is PPTTextElement | PPTShapeElement {
  return !!el && (el.type === 'text' || el.type === 'shape')
}

export function readTextBoxStyle(el: PPTElement | null): TextBoxStyle | null {
  if (!el) return null
  if (el.type === 'text') {
    return {
      fill: el.fill || '',
      lineHeight: el.lineHeight || 1.5,
      paragraphSpace: el.paragraphSpace === undefined ? 5 : el.paragraphSpace,
      inset: el.inset || DEFAULT_TEXT_INSET,
      fixedHeight: !!el.fixedHeight,
      vAlign: resolveTextBoxLayout(el).vAlign,
    }
  }
  if (el.type === 'shape') {
    return {
      fill: el.fill || '',
      lineHeight: el.text?.lineHeight || 1.5,
      paragraphSpace: el.text?.paragraphSpace === undefined ? 5 : el.text.paragraphSpace,
      inset: el.text?.inset || DEFAULT_TEXT_INSET,
      fixedHeight: isShapeTextFixedHeight(el.text),
      vAlign: (el.text?.align || 'middle') as TextAlignVertical,
    }
  }
  return null
}

export function applyTextBoxStylePatch(
  el: PPTElement,
  patch: TextBoxStylePatch,
  defaultShapeText: ShapeText,
): { props?: Partial<PPTTextElement> | Partial<PPTShapeElement>; remove?: Array<keyof PPTTextElement> } | null {
  if (el.type === 'text') {
    if (patch.fixedHeight === false) {
      return { remove: ['fixedHeight', 'vAlign'] }
    }
    const props: Partial<PPTTextElement> = {}
    if (patch.fill !== undefined) props.fill = patch.fill
    if (patch.lineHeight !== undefined) props.lineHeight = patch.lineHeight
    if (patch.paragraphSpace !== undefined) props.paragraphSpace = patch.paragraphSpace
    if (patch.inset !== undefined) props.inset = patch.inset
    if (patch.vAlign !== undefined) props.vAlign = patch.vAlign
    if (patch.fixedHeight === true) {
      props.fixedHeight = true
      props.vAlign = patch.vAlign ?? resolveTextBoxLayout(el).vAlign
      // A placeholder's fixed size is its designed slot — restore it instead
      // of locking whatever the text last hugged in auto mode.
      props.height = placeholderFixedRestoreHeight(el)
    }
    return { props }
  }
  if (el.type === 'shape') {
    const text: ShapeText = { ...(el.text || defaultShapeText) }
    if (patch.lineHeight !== undefined) text.lineHeight = patch.lineHeight
    if (patch.paragraphSpace !== undefined) text.paragraphSpace = patch.paragraphSpace
    if (patch.inset !== undefined) text.inset = patch.inset
    if (patch.vAlign !== undefined) text.align = patch.vAlign
    if (patch.fixedHeight !== undefined) text.fixedHeight = patch.fixedHeight
    const props: Partial<PPTShapeElement> = { text }
    if (patch.fill !== undefined) props.fill = patch.fill
    return { props }
  }
  return null
}
