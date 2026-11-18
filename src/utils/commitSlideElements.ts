import type { PPTElement } from '@/types/slides'
import { selectCurrentSlide, useSlidesStore } from '@/store'
import { commitLiveEditorToStore } from '@/utils/prosemirror/commitEditor'
import { liveEditorIds } from '@/utils/prosemirror/caret'
import { mergeGestureLayout } from '@/utils/liveLayoutCommit'

export { applyLiveLayoutOntoStore } from '@/utils/liveLayoutCommit'

export const commitAllLiveEditors = () => {
  for (const id of liveEditorIds()) commitLiveEditorToStore(id)
}

export const commitAuthoritativeEditors = commitAllLiveEditors

/** The slide a gesture edits and its elements when the pointer went down. */
export interface SlideCommitBase {
  slideId: string
  elements: PPTElement[]
}

/** Capture at gesture start; pass to `commitSlideElements` at gesture end. */
export const captureSlideCommitBase = (): SlideCommitBase | undefined => {
  const slide = selectCurrentSlide(useSlidesStore.getState())
  return slide ? { slideId: slide.id, elements: slide.elements } : undefined
}

/**
 * Flush the active editor, then persist live layout onto store-owned elements.
 *
 * With a `base`, the commit lands on the slide the gesture started on, even if
 * the host switched slides meanwhile. Returns the element list the canvas
 * should show now: the CURRENT slide's.
 */
export const commitSlideElements = (liveList: PPTElement[], base?: SlideCommitBase) => {
  commitAuthoritativeEditors()
  const state = useSlidesStore.getState()
  const current = selectCurrentSlide(state)
  const target = base ? state.slides.find(slide => slide.id === base.slideId) : current
  // The gesture's slide was deleted meanwhile: there is nothing to write to.
  if (!target) return current?.elements || []
  const ownIds = new Set(target.elements.map(el => el.id))
  const foreignIds = new Set<string>()
  for (const slide of state.slides) {
    if (slide === target) continue
    for (const el of slide.elements) if (!ownIds.has(el.id)) foreignIds.add(el.id)
  }
  const next = mergeGestureLayout(liveList, base?.elements ?? target.elements, target.elements, foreignIds)
  if (next !== target.elements) state.updateSlide({ elements: next }, target.id)
  return selectCurrentSlide(useSlidesStore.getState())?.elements || next
}
