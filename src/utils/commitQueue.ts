import { useMainStore } from '@/store'
import { commitAllLiveEditors } from '@/utils/commitSlideElements'
import { getEditorView } from '@/utils/prosemirror/caret'

type Flusher = () => void

const flushers = new Set<Flusher>()
const afterDrain = new Set<Flusher>()

const register = (bucket: Set<Flusher>, flush: Flusher) => {
  bucket.add(flush)
  return () => {
    bucket.delete(flush)
  }
}

/** Pending editor/table drafts. Returns an unregister function. */
export function registerCommitFlusher(flush: Flusher) {
  return register(flushers, flush)
}

/** Runs after drafts are persisted — canvas list sync, etc. */
export function registerAfterCommitDrain(flush: Flusher) {
  return register(afterDrain, flush)
}

/** Persist in-flight drafts without leaving the editor. */
export function flushCommitQueue() {
  for (const flush of [...flushers]) flush()
}

/**
 * Persist every in-flight draft, then sync dependents off the store.
 * Presentation (and any other Activity hide) must call this before unmounting editors.
 */
export function drainCommitQueue() {
  flushCommitQueue()
  commitAllLiveEditors()
  const main = useMainStore.getState()
  const editingId = main.editingElementId
  if (editingId) {
    const view = getEditorView(editingId)
    if (view?.hasFocus()) view.dom.blur()
    main.setEditingElementId('')
  }
  for (const flush of [...afterDrain]) flush()
}
