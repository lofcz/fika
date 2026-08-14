import { nanoid } from 'nanoid'
import { useMainStore, useSlidesStore, selectActiveElementList, selectCurrentSlide } from '@/store'
import type { PPTElement } from '@/types/slides'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'

export const getCanCombine = () => {
  const activeElementList = selectActiveElementList(useMainStore.getState())
  if (activeElementList.length < 2) return false
  const firstGroupId = activeElementList[0].groupId
  if (!firstGroupId) return true
  const inSameGroup = activeElementList.every(el => el.groupId === firstGroupId)
  return !inSameGroup
}

export default () => {
  const { addHistorySnapshot } = useHistorySnapshot()

  const combineElements = () => {
    const { activeElementIdList } = useMainStore.getState()
    const currentSlide = selectCurrentSlide(useSlidesStore.getState())
    const activeElementList = selectActiveElementList(useMainStore.getState())
    if (!activeElementList.length || !currentSlide) return

    let newElementList: PPTElement[] = JSON.parse(JSON.stringify(currentSlide.elements))
    const groupId = nanoid(10)
    const combineElementList: PPTElement[] = []
    for (const element of newElementList) {
      if (activeElementIdList.includes(element.id)) {
        element.groupId = groupId
        combineElementList.push(element)
      }
    }

    const combineElementMaxLevel = newElementList.findIndex(_element => _element.id === combineElementList[combineElementList.length - 1].id)
    const combineElementIdList = combineElementList.map(_element => _element.id)
    newElementList = newElementList.filter(_element => !combineElementIdList.includes(_element.id))
    const insertLevel = combineElementMaxLevel - combineElementList.length + 1
    newElementList.splice(insertLevel, 0, ...combineElementList)
    useSlidesStore.getState().updateSlide({ elements: newElementList })
    addHistorySnapshot()
  }

  const uncombineElements = () => {
    const { activeElementIdList, handleElementId, setActiveElementIdList } = useMainStore.getState()
    const currentSlide = selectCurrentSlide(useSlidesStore.getState())
    const activeElementList = selectActiveElementList(useMainStore.getState())
    if (!activeElementList.length || !currentSlide) return
    const hasElementInGroup = activeElementList.some(item => item.groupId)
    if (!hasElementInGroup) return
    const newElementList: PPTElement[] = JSON.parse(JSON.stringify(currentSlide.elements))
    for (const element of newElementList) {
      if (activeElementIdList.includes(element.id) && element.groupId) delete element.groupId
    }
    useSlidesStore.getState().updateSlide({ elements: newElementList })
    setActiveElementIdList(handleElementId ? [handleElementId] : [])
    addHistorySnapshot()
  }

  return {
    get canCombine() {
      return getCanCombine()
    },
    combineElements,
    uncombineElements,
  }
}
