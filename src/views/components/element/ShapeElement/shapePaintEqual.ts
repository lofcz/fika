import type { PPTShapeElement } from '@/types/slides'

type ShapeElementProps = {
  elementInfo: PPTShapeElement
  isEditing?: boolean
}

/** Shape ids currently hosting a live ProseMirror session. */
export const editingShapeIds = new Set<string>()

function deepishEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null || b == null) return a === b
  if (typeof a !== typeof b) return false
  if (typeof a !== 'object') return a === b
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepishEqual(v, b[i]))
  }
  if (Array.isArray(a) || Array.isArray(b)) return false
  const ao = a as Record<string, unknown>
  const bo = b as Record<string, unknown>
  const keys = Object.keys(ao)
  if (keys.length !== Object.keys(bo).length) return false
  return keys.every(key => deepishEqual(ao[key], bo[key]))
}

export function shapeInfoEqual(
  prev: PPTShapeElement,
  next: PPTShapeElement,
  ignoreTextContent = false,
): boolean {
  if (prev === next) return true
  if (!ignoreTextContent) return deepishEqual(prev, next)

  const { text: prevText, ...prevRest } = prev
  const { text: nextText, ...nextRest } = next
  if (!deepishEqual(prevRest, nextRest)) return false
  if (prevText === nextText) return true
  if (!prevText || !nextText) return true

  const { content: _pc, ...prevMeta } = prevText
  const { content: _nc, ...nextMeta } = nextText
  return deepishEqual(prevMeta, nextMeta)
}

export function areShapeElementPropsEqual(prev: ShapeElementProps, next: ShapeElementProps): boolean {
  if (prev.isEditing !== next.isEditing) return false
  const editing = editingShapeIds.has(next.elementInfo.id) || editingShapeIds.has(prev.elementInfo.id)
  return shapeInfoEqual(prev.elementInfo, next.elementInfo, editing)
}

export function areBaseShapePropsEqual(
  prev: { elementInfo: PPTShapeElement },
  next: { elementInfo: PPTShapeElement },
): boolean {
  return shapeInfoEqual(prev.elementInfo, next.elementInfo, false)
}
