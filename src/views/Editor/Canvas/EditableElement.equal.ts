import type { CSSProperties } from 'react'
import type { PPTElement, PPTLineElement, PPTShapeElement, PPTTextElement } from '@/types/slides'

export type EditableElementCompareProps = {
  elementInfo: PPTElement
  elementIndex: number
  isMultiSelect: boolean
  isEditing?: boolean
  style?: CSSProperties
}

const samePair = (a?: [number, number], b?: [number, number]) => {
  if (a === b) return true
  if (!a || !b) return a === b
  return a[0] === b[0] && a[1] === b[1]
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
      JSON.stringify(la.cubic) === JSON.stringify(lb.cubic)
    )
  }
  return true
}

const snapshotForCompare = (el: PPTElement, skipOwnedContent: boolean): string => {
  if (!skipOwnedContent) return JSON.stringify(el)
  if (el.type === 'text') {
    const { content: _content, ...rest } = el as PPTTextElement
    return JSON.stringify(rest)
  }
  if (el.type === 'shape') {
    const shape = el as PPTShapeElement
    if (!shape.text) return JSON.stringify(el)
    const { content: _content, ...textRest } = shape.text
    return JSON.stringify({ ...shape, text: textRest })
  }
  return JSON.stringify(el)
}

/**
 * EditableElement is a per-element instance: sibling content cannot invalidate
 * this wrapper. Canvas JSON-clones the whole list on every store write, so
 * compare identity / geometry / lock / edit flags — not object identity, and
 * not ProseMirror-owned content while this element is editing.
 */
export const areEditableElementPropsEqual = (
  prev: EditableElementCompareProps,
  next: EditableElementCompareProps,
): boolean => {
  if (!!prev.isEditing !== !!next.isEditing) return false
  if (prev.isMultiSelect !== next.isMultiSelect) return false
  if (prev.elementIndex !== next.elementIndex) return false
  if (prev.style?.display !== next.style?.display) return false

  const a = prev.elementInfo
  const b = next.elementInfo
  if (a === b) return true
  if (a.id !== b.id || a.type !== b.type) return false
  if (!!a.lock !== !!b.lock) return false
  if (!sameEditableGeometry(a, b)) return false

  const skipOwnedContent = !!(prev.isEditing || next.isEditing)
  return snapshotForCompare(a, skipOwnedContent) === snapshotForCompare(b, skipOwnedContent)
}
