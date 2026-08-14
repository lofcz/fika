import { useMainStore, useSlidesStore, selectCurrentSlide } from '@/store'
import type { PPTElement } from '@/types/slides'
import { ElementOrderCommands } from '@/types/edit'
import { orderElementList } from '@/utils/elementOrder'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'

export default () => {
  const { addHistorySnapshot } = useHistorySnapshot()

  const orderElement = (element: PPTElement, command: ElementOrderCommands) => {
    const { activeElementIdList } = useMainStore.getState()
    const currentSlide = selectCurrentSlide(useSlidesStore.getState())
    if (!currentSlide) return
    const seedIds = activeElementIdList.length ? [...activeElementIdList] : [element.id]
    const newElementList = orderElementList(currentSlide.elements, seedIds, command)
    if (!newElementList) return
    useSlidesStore.getState().updateSlide({ elements: newElementList })
    addHistorySnapshot()
  }

  return { orderElement }
}
