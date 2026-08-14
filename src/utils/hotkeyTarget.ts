/** True when canvas/element hotkeys must yield to a focused text field. */
export const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!target || typeof target !== 'object') return false
  const el = target as {
    isContentEditable?: boolean
    closest?: (selector: string) => unknown
    tagName?: string
  }
  if (el.isContentEditable) return true
  if (typeof el.closest === 'function' && el.closest('.ProseMirror')) return true
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}
