import { useMainStore, useSlidesStore, useKeyboardStore, selectCurrentSlide } from '@/store'
import type { PPTElement } from '@/types/slides'
import { KEYS } from '@/configs/hotkey'
import { FINE_GRID_SIZE } from '@/utils/snap'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import { commitAllLiveEditors, commitSlideElements } from '@/utils/commitSlideElements'

export default () => {
  const { addHistorySnapshot } = useHistorySnapshot()

  const moveElement = (command: string) => {
    const { altKeyState, shiftKeyState } = useKeyboardStore.getState()
    const gridLineSize = useMainStore.getState().gridLineSize
    const step = altKeyState
      ? (gridLineSize > 0 ? gridLineSize : FINE_GRID_SIZE)
      : shiftKeyState ? 10 : 1
    const { activeElementIdList, activeGroupElementId } = useMainStore.getState()
    commitAllLiveEditors()
    const currentSlide = selectCurrentSlide(useSlidesStore.getState())
    if (!currentSlide) return
    const move = (el: PPTElement) => {
      let { left, top } = el
      switch (command) {
        case KEYS.LEFT:
          left = left - step
          break
        case KEYS.RIGHT:
          left = left + step
          break
        case KEYS.UP:
          top = top - step
          break
        case KEYS.DOWN:
          top = top + step
          break
        default:
          break
      }
      return { ...el, left, top }
    }
    const newElementList = activeGroupElementId
      ? currentSlide.elements.map(el => (activeGroupElementId === el.id ? move(el) : el))
      : currentSlide.elements.map(el => (activeElementIdList.includes(el.id) ? move(el) : el))
    commitSlideElements(newElementList)
    addHistorySnapshot()
  }

  return { moveElement }
}
