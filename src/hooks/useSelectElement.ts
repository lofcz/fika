import { isElementSelectable } from '@/utils/selection'
import { useMainStore, useSlidesStore, selectCurrentSlide } from '@/store'

export default () => {
  const selectAllElements = () => {
    const { hiddenElementIdList, setActiveElementIdList } = useMainStore.getState()
    const currentSlide = selectCurrentSlide(useSlidesStore.getState())
    if (!currentSlide) return
    const unlockedElements = currentSlide.elements.filter(el => isElementSelectable(el, currentSlide.elements, hiddenElementIdList))
    setActiveElementIdList(unlockedElements.map(el => el.id))
  }

  const selectElement = (id: string) => {
    const { handleElementId, hiddenElementIdList, setActiveElementIdList } = useMainStore.getState()
    if (handleElementId === id) return
    if (hiddenElementIdList.includes(id)) return
    const currentSlide = selectCurrentSlide(useSlidesStore.getState())
    if (!currentSlide) return
    const element = currentSlide.elements.find(el => el.id === id)
    if (!element || !isElementSelectable(element, currentSlide.elements, hiddenElementIdList)) return
    setActiveElementIdList([id])
  }

  return {
    selectAllElements,
    selectElement,
  }
}
