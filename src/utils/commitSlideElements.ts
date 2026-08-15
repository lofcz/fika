import type { PPTElement } from '@/types/slides'
import { selectCurrentSlide, useSlidesStore } from '@/store'
import { commitLiveEditorToStore } from '@/utils/prosemirror/commitEditor'
import { liveEditorIds } from '@/utils/prosemirror/caret'
import { applyLiveLayoutOntoStore } from '@/utils/liveLayoutCommit'

export { applyLiveLayoutOntoStore } from '@/utils/liveLayoutCommit'

export const commitAllLiveEditors = () => {
  for (const id of liveEditorIds()) commitLiveEditorToStore(id)
}

export const commitAuthoritativeEditors = commitAllLiveEditors

/** Flush the active editor, then persist live layout onto store-owned elements. */
export const commitSlideElements = (liveList: PPTElement[]) => {
  commitAuthoritativeEditors()
  const storeSlide = selectCurrentSlide(useSlidesStore.getState())
  const next = storeSlide ? applyLiveLayoutOntoStore(liveList, storeSlide.elements) : liveList
  useSlidesStore.getState().updateSlide({ elements: next })
  return next
}
