import { nanoid } from 'nanoid'
import { useSlidesStore, useMainStore, selectCurrentSlide } from '@/store'
import type { PPTElement, Slide } from '@/types/slides'
import { clonePlain } from '@/utils/clonePlain'
import { createSlideIdMap, createElementIdMap, getElementRange } from '@/utils/element'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'

export default () => {
  const { addHistorySnapshot } = useHistorySnapshot()

  const addElementsFromData = (elements: PPTElement[]) => {
    const currentSlide = selectCurrentSlide(useSlidesStore.getState())
    if (!currentSlide) return
    const cloned = clonePlain(elements)
    const { groupIdMap, elIdMap } = createElementIdMap(cloned)
    const firstElement = cloned[0]
    let offset = 0
    let lastSameElement: PPTElement | undefined
    do {
      lastSameElement = currentSlide.elements.find(el => {
        if (el.type !== firstElement.type) return false
        const { minX: oMinX, maxX: oMaxX, minY: oMinY, maxY: oMaxY } = getElementRange(el)
        const { minX: nMinX, maxX: nMaxX, minY: nMinY, maxY: nMaxY } = getElementRange({
          ...firstElement,
          left: firstElement.left + offset,
          top: firstElement.top + offset,
        })
        if (oMinX === nMinX && oMaxX === nMaxX && oMinY === nMinY && oMaxY === nMaxY) return true
        return false
      })
      if (lastSameElement) offset += 10
    } while (lastSameElement)
    for (const element of cloned) {
      element.id = elIdMap[element.id]
      element.left = element.left + offset
      element.top = element.top + offset
      if (element.groupId) element.groupId = groupIdMap[element.groupId]
    }
    useSlidesStore.getState().addElement(cloned)
    useMainStore.getState().setActiveElementIdList(Object.values(elIdMap))
    addHistorySnapshot()
  }

  const addSlidesFromData = (slides: Slide[]) => {
    const cloned = clonePlain(slides)
    const slideIdMap = createSlideIdMap(cloned)
    for (const slide of cloned) {
      const { groupIdMap, elIdMap } = createElementIdMap(slide.elements)
      slide.id = slideIdMap[slide.id]
      for (const element of slide.elements) {
        element.id = elIdMap[element.id]
        if (element.groupId) element.groupId = groupIdMap[element.groupId]
        if (element.link && element.link.type === 'slide') {
          if (slideIdMap[element.link.target]) {
            element.link.target = slideIdMap[element.link.target]
          }
          else delete element.link
        }
      }
      if (slide.animations) {
        for (const animation of slide.animations) {
          animation.id = nanoid(10)
          animation.elId = elIdMap[animation.elId]
        }
      }
    }
    useSlidesStore.getState().addSlide(cloned)
    addHistorySnapshot()
  }

  return {
    addElementsFromData,
    addSlidesFromData,
  }
}
