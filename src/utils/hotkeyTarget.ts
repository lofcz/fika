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

/** Controls own navigation and activation keys, even while the canvas retains selection. */
export const isInteractiveControlTarget = (target: EventTarget | null): boolean => {
  if (!target || typeof target !== 'object') return false
  const el = target as { closest?: (selector: string) => Element | null }
  const control = el.closest?.('button, a[href], [role="button"], [role="slider"], [role="spinbutton"], [role="combobox"], [role="menuitem"], [role="tab"]')
  // Sortable slide rows carry dnd-kit's button role but own slide hotkeys.
  return !!control && !(control.matches('[data-sortable-id]') && control.closest('.thumbnails'))
}
