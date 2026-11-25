import type { PPTElement } from '@/types/slides'

export const editorHtmlLooksEmpty = (html: string) => (
  !html.replace(/<!--[\s\S]*?-->/g, '').replace(/<\/?[a-z][^>]*>/gi, '').replace(/&nbsp;/g, ' ').trim()
)

export const findElementInSlides = (
  slides: readonly { id: string; elements: PPTElement[] }[],
  slideIndex: number,
  elementId: string,
  preferredSlideId?: string,
): { slideId: string; el: PPTElement } | null => {
  if (preferredSlideId) {
    const preferred = slides.find(slide => slide.id === preferredSlideId)
    const hit = preferred?.elements.find(item => item.id === elementId)
    if (preferred && hit) return { slideId: preferred.id, el: hit }
    return null
  }
  // Live editors are mounted on the visible slide; resolve there first so a
  // deck with ids repeated across slides never commits into another slide.
  const current = slides[slideIndex]
  const own = current?.elements.find(item => item.id === elementId)
  if (current && own) return { slideId: current.id, el: own }
  for (const slide of slides) {
    const el = slide.elements.find(item => item.id === elementId)
    if (el) return { slideId: slide.id, el }
  }
  return null
}

/**
 * Store owns authored HTML. A live view that has text always writes.
 * An idle empty view must not erase store text — only the focused/editing
 * editor may clear.
 */
export const shouldWriteEditorHtml = (opts: {
  nextHtml: string
  storeHtml: string
  isAuthoritative: boolean
}): boolean => {
  if (opts.nextHtml === opts.storeHtml) return false
  if (editorHtmlLooksEmpty(opts.nextHtml) && !editorHtmlLooksEmpty(opts.storeHtml)) {
    return opts.isAuthoritative
  }
  return true
}
