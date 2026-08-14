import { useMainStore, useSlidesStore, selectCurrentSlide } from '@/store'

export default () => {
  const selectAllElements = () => {
    const { hiddenElementIdList, setActiveElementIdList } = useMainStore.getState()
    const currentSlide = selectCurrentSlide(useSlidesStore.getState())
    if (!currentSlide) return
    const unlockedElements = currentSlide.elements.filter(el => !el.lock && !hiddenElementIdList.includes(el.id))
    setActiveElementIdList(unlockedElements.map(el => el.id))
  }

  const selectElement = (id: string) => {
    const { handleElementId, hiddenElementIdList, setActiveElementIdList } = useMainStore.getState()
    if (handleElementId === id) return
    if (hiddenElementIdList.includes(id)) return
    const currentSlide = selectCurrentSlide(useSlidesStore.getState())
    if (!currentSlide) return
    const lockedElements = currentSlide.elements.filter(el => el.lock)
    if (lockedElements.some(el => el.id === id)) return
    setActiveElementIdList([id])
  }

  return {
    selectAllElements,
    selectElement,
  }
}
