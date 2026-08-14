import { nanoid } from 'nanoid'
import { useSlidesStore, useMainStore, selectCurrentSlide } from '@/store'
import type { PPTElement, Slide } from '@/types/slides'
import { createSlideIdMap, createElementIdMap, getElementRange } from '@/utils/element'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'

export default () => {
  const { addHistorySnapshot } = useHistorySnapshot()

  const addElementsFromData = (elements: PPTElement[]) => {
    const currentSlide = selectCurrentSlide(useSlidesStore.getState())
    if (!currentSlide) return
    const { groupIdMap, elIdMap } = createElementIdMap(elements)
    const firstElement = elements[0]
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
    for (const element of elements) {
      element.id = elIdMap[element.id]
      element.left = element.left + offset
      element.top = element.top + offset
      if (element.groupId) element.groupId = groupIdMap[element.groupId]
    }
    useSlidesStore.getState().addElement(elements)
    useMainStore.getState().setActiveElementIdList(Object.values(elIdMap))
    addHistorySnapshot()
  }

  const addSlidesFromData = (slides: Slide[]) => {
    const slideIdMap = createSlideIdMap(slides)
    const newSlides = slides.map(slide => {
      const { groupIdMap, elIdMap } = createElementIdMap(slide.elements)
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
      return {
        ...slide,
        id: slideIdMap[slide.id],
      }
    })
    useSlidesStore.getState().addSlide(newSlides)
    addHistorySnapshot()
  }

  return {
    addElementsFromData,
    addSlidesFromData,
  }
}
