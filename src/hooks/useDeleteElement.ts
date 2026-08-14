import { useMainStore, useSlidesStore, selectCurrentSlide } from '@/store'
import type { PPTElement } from '@/types/slides'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'

export default () => {
  const { addHistorySnapshot } = useHistorySnapshot()

  const deleteElement = () => {
    const { activeElementIdList, activeGroupElementId, setActiveElementIdList } = useMainStore.getState()
    const currentSlide = selectCurrentSlide(useSlidesStore.getState())
    if (!activeElementIdList.length || !currentSlide) return
    let newElementList: PPTElement[] = []
    if (activeGroupElementId) {
      newElementList = currentSlide.elements.filter(el => el.id !== activeGroupElementId)
    }
    else {
      newElementList = currentSlide.elements.filter(el => !activeElementIdList.includes(el.id))
    }
    setActiveElementIdList([])
    useSlidesStore.getState().updateSlide({ elements: newElementList })
    addHistorySnapshot()
  }

  const deleteAllElements = () => {
    const currentSlide = selectCurrentSlide(useSlidesStore.getState())
    if (!currentSlide?.elements.length) return
    useMainStore.getState().setActiveElementIdList([])
    useSlidesStore.getState().updateSlide({ elements: [] })
    addHistorySnapshot()
  }

  return {
    deleteElement,
    deleteAllElements,
  }
}
