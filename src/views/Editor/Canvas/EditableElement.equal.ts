import type { CSSProperties } from 'react'
import type { PPTElement, PPTLineElement, PPTShapeElement } from '@/types/slides'
import { deepEqualIgnore } from './Operate/operateCompare'

export type EditableElementCompareProps = {
  elementInfo: PPTElement
  elementIndex: number
  isMultiSelect: boolean
  isEditing?: boolean
  style?: CSSProperties
}

const NO_IGNORE_KEYS = new Set<string>()
const TEXT_CONTENT_IGNORE_KEYS = new Set<string>(['content'])

const samePair = (a?: [number, number], b?: [number, number]) => {
  if (a === b) return true
  if (!a || !b) return a === b
  return a[0] === b[0] && a[1] === b[1]
}

const sameCubic = (a?: [[number, number], [number, number]], b?: [[number, number], [number, number]]) => {
  if (a === b) return true
  if (!a || !b) return a === b
  return samePair(a[0], b[0]) && samePair(a[1], b[1])
}

export const sameEditableGeometry = (a: PPTElement, b: PPTElement): boolean => {
  if (a.left !== b.left || a.top !== b.top || a.width !== b.width) return false
  if ('height' in a || 'height' in b) {
    if ((a as { height?: number }).height !== (b as { height?: number }).height) return false
  }
  if ('rotate' in a || 'rotate' in b) {
    if ((a as { rotate?: number }).rotate !== (b as { rotate?: number }).rotate) return false
  }
  if (a.type === 'line' && b.type === 'line') {
    const la = a as PPTLineElement
    const lb = b as PPTLineElement
    return (
      samePair(la.start, lb.start) &&
      samePair(la.end, lb.end) &&
      samePair(la.broken, lb.broken) &&
      samePair(la.broken2, lb.broken2) &&
      samePair(la.curve, lb.curve) &&
      sameCubic(la.cubic, lb.cubic)
    )
  }
  return true
}

const elementsEqualForEditable = (a: PPTElement, b: PPTElement, skipOwnedContent: boolean): boolean => {
  if (!skipOwnedContent) return deepEqualIgnore(a, b, NO_IGNORE_KEYS)
  if (a.type === 'text' && b.type === 'text') {
    return deepEqualIgnore(a, b, TEXT_CONTENT_IGNORE_KEYS)
  }
  if (a.type === 'shape' && b.type === 'shape') {
    const sa = a as PPTShapeElement
    const sb = b as PPTShapeElement
    if (!sa.text && !sb.text) return deepEqualIgnore(sa, sb, NO_IGNORE_KEYS)
    if (!deepEqualIgnore(sa, sb, new Set(['text']))) return false
    if (sa.text === sb.text) return true
    if (!sa.text || !sb.text) return false
    return deepEqualIgnore(sa.text, sb.text, TEXT_CONTENT_IGNORE_KEYS)
  }
  return deepEqualIgnore(a, b, NO_IGNORE_KEYS)
}

/**
 * EditableElement is a per-element instance: sibling content cannot invalidate
 * this wrapper. Canvas clones the list on store writes, so compare identity /
 * geometry / lock / edit flags structurally — not object identity, and not
 * ProseMirror-owned content while this element is editing.
 */
export const areEditableElementPropsEqual = (
  prev: EditableElementCompareProps,
  next: EditableElementCompareProps,
): boolean => {
  if (!!prev.isEditing !== !!next.isEditing) return false
  if (prev.isMultiSelect !== next.isMultiSelect) return false
  if (prev.elementIndex !== next.elementIndex) return false
  if (prev.style?.display !== next.style?.display || prev.style?.clipPath !== next.style?.clipPath) return false

  const a = prev.elementInfo
  const b = next.elementInfo
  if (a === b) return true
  if (a.id !== b.id || a.type !== b.type) return false
  if (!!a.lock !== !!b.lock) return false
  if (!sameEditableGeometry(a, b)) return false

  const skipOwnedContent = !!(prev.isEditing || next.isEditing)
  return elementsEqualForEditable(a, b, skipOwnedContent)
}
