import { useMainStore, useSlidesStore, selectCurrentSlide } from '@/store'
import type { PPTElement } from '@/types/slides'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'

export default () => {
  const { addHistorySnapshot } = useHistorySnapshot()

  const lockElement = () => {
    const { activeElementIdList, setActiveElementIdList } = useMainStore.getState()
    const currentSlide = selectCurrentSlide(useSlidesStore.getState())
    if (!currentSlide) return
    const newElementList: PPTElement[] = JSON.parse(JSON.stringify(currentSlide.elements))
    for (const element of newElementList) {
      if (activeElementIdList.includes(element.id)) element.lock = true
    }
    useSlidesStore.getState().updateSlide({ elements: newElementList })
    setActiveElementIdList([])
    addHistorySnapshot()
  }

  const unlockElement = (handleElement: PPTElement) => {
    const currentSlide = selectCurrentSlide(useSlidesStore.getState())
    if (!currentSlide) return
    const newElementList: PPTElement[] = JSON.parse(JSON.stringify(currentSlide.elements))
    if (handleElement.groupId) {
      const groupElementIdList = []
      for (const element of newElementList) {
        if (element.groupId === handleElement.groupId) {
          element.lock = false
          groupElementIdList.push(element.id)
        }
      }
      useSlidesStore.getState().updateSlide({ elements: newElementList })
      useMainStore.getState().setActiveElementIdList(groupElementIdList)
    }
    else {
      for (const element of newElementList) {
        if (element.id === handleElement.id) {
          element.lock = false
          break
        }
      }
      useSlidesStore.getState().updateSlide({ elements: newElementList })
      useMainStore.getState().setActiveElementIdList([handleElement.id])
    }
    addHistorySnapshot()
  }

  return {
    lockElement,
    unlockElement,
  }
}
