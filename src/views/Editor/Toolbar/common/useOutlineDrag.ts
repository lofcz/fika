import { useRef } from 'react'
import { selectCurrentSlide, useSlidesStore } from '@/store'
import type { PPTElement } from '@/types/slides'
import { captureOutlineRestore } from '@/utils/elementOutline'

/** Roll back live border previews only while they still own the stored objects. */
export default function useOutlineDrag() {
  const pending = useRef<{
    slideId: string
    originals: ReturnType<typeof captureOutlineRestore>[]
    previews: Map<string, PPTElement>
    restoreUI?: () => void
  } | null>(null)

  const begin = (elements: PPTElement[], restoreUI?: () => void) => {
    const slide = selectCurrentSlide(useSlidesStore.getState())
    if (!slide) return
    pending.current = { slideId: slide.id, originals: elements.map(captureOutlineRestore), previews: new Map(), restoreUI }
  }
  const track = () => {
    const drag = pending.current
    if (!drag) return
    const slide = useSlidesStore.getState().slides.find(slide => slide.id === drag.slideId)
    for (const { id } of drag.originals) {
      const el = slide?.elements.find(el => el.id === id)
      if (el) drag.previews.set(id, el)
    }
  }
  const cancel = () => {
    const drag = pending.current
    pending.current = null
    if (!drag) return
    const store = useSlidesStore.getState()
    const slide = store.slides.find(slide => slide.id === drag.slideId)
    let restored = false
    for (const { id, props, absent } of drag.originals) {
      const current = slide?.elements.find(el => el.id === id)
      if (!current || current !== drag.previews.get(id)) continue
      store.updateElement({ id, props, slideId: drag.slideId })
      if (absent.length) store.removeElementProps({ id, propName: absent, slideId: drag.slideId })
      restored = true
    }
    if (restored) drag.restoreUI?.()
  }
  const finish = () => { pending.current = null }
  return { begin, track, cancel, finish }
}
