import { useMainStore, useSlidesStore } from '@/store'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import type { PPTElement, ShapeText } from '@/types/slides'
import { repairFilledPlaceholderHtml } from '@/utils/placeholderPaint'
import { getEditorView } from './caret'
import { normalizeFittedFontSizes } from './index'
import { editorHtmlLooksEmpty, shouldWriteEditorHtml } from './commitPolicy'

export { editorHtmlLooksEmpty, shouldWriteEditorHtml } from './commitPolicy'

export const richTextHtmlLooksEmpty = editorHtmlLooksEmpty

export const storeHtmlForElement = (elementId: string): string => {
  const found = findElementInPresentation(elementId)
  if (!found) return ''
  if (found.el.type === 'text') return found.el.content || ''
  if (found.el.type === 'shape') return found.el.text?.content || ''
  return ''
}

/** Activity remounts must not rebuild an empty view over store-owned text. */
export const resolveEditorMountHtml = (elementId: string, value: string): string => {
  if (!editorHtmlLooksEmpty(value)) return value
  const storeHtml = storeHtmlForElement(elementId)
  return editorHtmlLooksEmpty(storeHtml) ? value : storeHtml
}

const findElementInPresentation = (elementId: string): { slideId: string; el: PPTElement } | null => {
  for (const slide of useSlidesStore.getState().slides) {
    const el = slide.elements.find(item => item.id === elementId)
    if (el) return { slideId: slide.id, el }
  }
  return null
}

/** Persist the live ProseMirror HTML. History is for explicit flushes, not every key. */
export function commitLiveEditorToStore(elementId: string, options?: { history?: boolean }) {
  const view = getEditorView(elementId)
  if (!view) return
  const empty = view.state.doc.textContent.trim().length === 0 && richTextHtmlLooksEmpty(view.dom.innerHTML)
  const html = empty ? '' : normalizeFittedFontSizes(view.dom.innerHTML)
  const found = findElementInPresentation(elementId)
  if (!found) return
  const { slideId, el } = found
  const isAuthoritative = view.hasFocus() || useMainStore.getState().editingElementId === elementId
  const history = options?.history !== false
  if (el.type === 'text') {
    const next = el.placeholder ? repairFilledPlaceholderHtml(el, html) : html
    if (!shouldWriteEditorHtml({
      nextHtml: next,
      storeHtml: el.content || '',
      isAuthoritative,
    })) return
    useSlidesStore.getState().updateElement({ id: elementId, slideId, props: { content: next } })
    // oxlint-disable-next-line react/rules-of-hooks -- zustand snapshot helper, not a React hook
    if (history) useHistorySnapshot().addHistorySnapshot()
    return
  }
  if (el.type !== 'shape') return
  if (!html) {
    if (!el.text) return
    if (!isAuthoritative) return
    useSlidesStore.getState().removeElementProps({ id: elementId, propName: 'text' })
    // oxlint-disable-next-line react/rules-of-hooks -- zustand snapshot helper, not a React hook
    if (history) useHistorySnapshot().addHistorySnapshot()
    return
  }
  if (!shouldWriteEditorHtml({
    nextHtml: html,
    storeHtml: el.text?.content || '',
    isAuthoritative,
  })) return
  const text: ShapeText = {
    align: 'middle',
    defaultFontName: '',
    defaultColor: '#333',
    ...(el.text || {}),
    content: html,
  }
  useSlidesStore.getState().updateElement({ id: elementId, slideId, props: { text } })
  // oxlint-disable-next-line react/rules-of-hooks -- zustand snapshot helper, not a React hook
  if (history) useHistorySnapshot().addHistorySnapshot()
}
