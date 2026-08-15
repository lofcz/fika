/** Shrink-to-fit. Only explicit fixed-height (list placeholders start this way). */
export const textElementLocksSize = (
  el: { fixedHeight?: boolean; vertical?: boolean },
) => !el.vertical && !!el.fixedHeight

/** Shape text defaults to a locked box; `fixedHeight: false` is auto-height. */
export const shapeTextLocksSize = (text?: { fixedHeight?: boolean } | null) => (
  text?.fixedHeight !== false
)

export const elementLocksTextBox = (
  el: { type?: string; fixedHeight?: boolean; vertical?: boolean; text?: { fixedHeight?: boolean } | null },
) => {
  if (el.type === 'text') return textElementLocksSize(el)
  if (el.type === 'shape') return shapeTextLocksSize(el.text)
  return false
}
