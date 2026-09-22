import { useMainStore } from '@/store'
import { queryFika } from '@/utils/portal'

/** Select inserted elements and hand keyboard interaction back to the canvas. */
export function selectInsertedElements(ids: string[]) {
  if (!ids.length) return
  useMainStore.getState().setActiveElementIdList(ids)

  // The insertion click still reaches the canvas's click-outside handler.
  // Restore focus after that event, without stealing a new text editor's caret.
  setTimeout(() => {
    const main = useMainStore.getState()
    if (main.activeElementIdList.length !== ids.length
      || !ids.every(id => main.activeElementIdList.includes(id))) return
    if (!ids.includes(main.editingElementId)) {
      queryFika<HTMLElement>('[data-fika-canvas]')?.focus({ preventScroll: true })
    }
    main.setThumbnailsFocus(false)
    main.setEditorareaFocus(true)
  }, 0)
}
