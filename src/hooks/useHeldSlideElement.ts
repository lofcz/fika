import { useRef } from 'react'

import { selectCurrentSlide, useSlidesStore } from '@/store'
import type { PPTElement } from '@/types/slides'

/**
 * Keep the last matching slide element while a modal is open.
 * Store identity churn (new `elements` array, brief miss) must not unmount the editor.
 */
export function useHeldSlideElement<T extends PPTElement>(
  editingElementId: string,
  visible: boolean,
  isMatch: (el: PPTElement) => el is T,
) {
  const live = useSlidesStore(s => {
    if (!editingElementId) return null
    const slide = selectCurrentSlide(s)
    const el = slide?.elements.find(item => item.id === editingElementId)
    return el && isMatch(el) ? el : null
  })

  const heldRef = useRef<T | null>(null)
  if (live) heldRef.current = live
  if (!editingElementId) heldRef.current = null

  const present = useSlidesStore(s => {
    if (!editingElementId) return false
    const slide = selectCurrentSlide(s)
    return !!slide?.elements.some(item => item.id === editingElementId)
  })

  const element = live ?? (visible ? heldRef.current : null)

  return { element, present }
}
