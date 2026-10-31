import { useMainStore, useSlidesStore } from '@/store'
import type { EditorView } from 'prosemirror-view'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import type { PPTElement, ShapeText } from '@/types/slides'
import { repairFilledPlaceholderHtml } from '@/utils/placeholderPaint'
import { getEditorView } from './caret'
import { normalizeFittedFontSizes } from './index'
import { editorHtmlLooksEmpty, shouldWriteEditorHtml } from './commitPolicy'

export { editorHtmlLooksEmpty, shouldWriteEditorHtml } from './commitPolicy'

/** Exclude transient node-selection decorations from persisted rich text. */
export function cleanEditorHtml(dom: HTMLElement): string {
  if (!dom.querySelector('.ProseMirror-selectednode')) return dom.innerHTML
  const clone = dom.cloneNode(true) as HTMLElement
  for (const node of clone.querySelectorAll('.ProseMirror-selectednode')) {
    node.classList.remove('ProseMirror-selectednode')
    if (!node.className) node.removeAttribute('class')
    node.removeAttribute('draggable')
  }
  return clone.innerHTML
}

export const richTextHtmlLooksEmpty = editorHtmlLooksEmpty

export const storeHtmlForElement = (elementId: string): string => {
  const found = findElementInPresentation(elementId)
  if (!found) return ''
  if (found.el.type === 'text') return found.el.content || ''
  if (found.el.type === 'shape') return found.el.text?.content || ''
  return ''
}

const editorSources = new WeakMap<EditorView, string>()

/** Remember which store content this view has actually synchronized. */
export function rememberEditorSource(view: EditorView, elementId: string) {
  editorSources.set(view, storeHtmlForElement(elementId))
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
  const html = empty ? '' : normalizeFittedFontSizes(cleanEditorHtml(view.dom))
  const found = findElementInPresentation(elementId)
  if (!found) return
  const { slideId, el } = found
  const isAuthoritative = view.hasFocus() || useMainStore.getState().editingElementId === elementId
  const source = editorSources.get(view)
  const storeHtml = el.type === 'text' ? el.content : el.type === 'shape' ? el.text?.content || '' : ''
  // Undo and external updates can replace the store before React updates or
  // unmounts this view. An idle view must not overwrite that newer content.
  if (!isAuthoritative && source !== undefined && source !== storeHtml) return
  const history = options?.history !== false
  if (el.type === 'text') {
    const next = el.placeholder ? repairFilledPlaceholderHtml(el, html) : html
    if (!shouldWriteEditorHtml({
      nextHtml: next,
      storeHtml: el.content || '',
      isAuthoritative,
    })) return
    useSlidesStore.getState().updateElement({ id: elementId, slideId, props: { content: next } })
    rememberEditorSource(view, elementId)
    // oxlint-disable-next-line react/rules-of-hooks -- zustand snapshot helper, not a React hook
    if (history) useHistorySnapshot().addHistorySnapshot()
    return
  }
  if (el.type !== 'shape') return
  if (!html) {
    if (!el.text) return
    if (!isAuthoritative) return
    useSlidesStore.getState().removeElementProps({ id: elementId, propName: 'text' })
    rememberEditorSource(view, elementId)
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
  rememberEditorSource(view, elementId)
  // oxlint-disable-next-line react/rules-of-hooks -- zustand snapshot helper, not a React hook
  if (history) useHistorySnapshot().addHistorySnapshot()
}
