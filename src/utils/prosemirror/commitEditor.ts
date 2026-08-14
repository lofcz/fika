import { selectCurrentSlide, useSlidesStore } from '@/store'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import type { ShapeText } from '@/types/slides'
import { getEditorView } from './caret'

export const richTextHtmlLooksEmpty = (html: string) => (
  !html.replace(/<br\s*\/?>/gi, '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
)

/** Persist the live ProseMirror HTML before the canvas clone / idle paint. */
export function commitLiveEditorToStore(elementId: string) {
  const view = getEditorView(elementId)
  if (!view) return
  const empty = view.state.doc.textContent.trim().length === 0 && richTextHtmlLooksEmpty(view.dom.innerHTML)
  const html = empty ? '' : view.dom.innerHTML
  const el = selectCurrentSlide(useSlidesStore.getState())?.elements.find(item => item.id === elementId)
  if (!el) return
  if (el.type === 'text') {
    if (el.content === html) return
    useSlidesStore.getState().updateElement({ id: elementId, props: { content: html } })
    useHistorySnapshot().addHistorySnapshot()
    return
  }
  if (el.type !== 'shape') return
  if (!html) {
    if (!el.text) return
    useSlidesStore.getState().removeElementProps({ id: elementId, propName: 'text' })
    useHistorySnapshot().addHistorySnapshot()
    return
  }
  if (el.text?.content === html) return
  const text: ShapeText = {
    align: 'middle',
    defaultFontName: '',
    defaultColor: '#333',
    ...(el.text || {}),
    content: html,
  }
  useSlidesStore.getState().updateElement({ id: elementId, props: { text } })
  useHistorySnapshot().addHistorySnapshot()
}
