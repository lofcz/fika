import { useState, useRef, useCallback } from 'react'
import { useKeyboardStore, useMainStore, selectCtrlOrShiftKeyActive } from '@/store'
import type { PPTElement } from '@/types/slides'
import { elementIdsIntersectingSelection } from '@/utils/canvasHitTest'
import { clientToWrapper } from '@/utils/canvasPointer'

const MIN_SELECTION_PX = 5

export default (elementList: PPTElement[], viewportRef: { current: HTMLElement | null }) => {
  const canvasScale = useMainStore(s => s.canvasScale)
  const hiddenElementIdList = useMainStore(s => s.hiddenElementIdList)
  const activeElementIdList = useMainStore(s => s.activeElementIdList)
  const ctrlOrShiftKeyActive = useKeyboardStore(selectCtrlOrShiftKeyActive)

  const elementListRef = useRef(elementList)
  elementListRef.current = elementList
  const canvasScaleRef = useRef(canvasScale)
  canvasScaleRef.current = canvasScale
  const hiddenElementIdListRef = useRef(hiddenElementIdList)
  hiddenElementIdListRef.current = hiddenElementIdList
  const activeElementIdListRef = useRef(activeElementIdList)
  activeElementIdListRef.current = activeElementIdList
  const ctrlOrShiftKeyActiveRef = useRef(ctrlOrShiftKeyActive)
  ctrlOrShiftKeyActiveRef.current = ctrlOrShiftKeyActive

  const [mouseSelectionVisible, setMouseSelectionVisible] = useState(false)
  const [mouseSelection, setMouseSelection] = useState({
    top: 0,
    left: 0,
    width: 0,
    height: 0,
  })
  const mouseSelectionRef = useRef(mouseSelection)
  mouseSelectionRef.current = mouseSelection

  const updateMouseSelection = useCallback((e: MouseEvent) => {
    if (!viewportRef.current) return

    let isMouseDown = true
    const viewport = viewportRef.current
    const start = clientToWrapper(e, viewport)

    const nextSelection = {
      top: start.y,
      left: start.x,
      width: 0,
      height: 0,
    }
    mouseSelectionRef.current = nextSelection
    setMouseSelection(nextSelection)
    setMouseSelectionVisible(false)

    document.onmousemove = ev => {
      if (!isMouseDown) return

      const current = clientToWrapper(ev, viewport)
      const width = Math.abs(current.x - start.x)
      const height = Math.abs(current.y - start.y)
      if (width < MIN_SELECTION_PX || height < MIN_SELECTION_PX) return

      const updated = {
        left: Math.min(start.x, current.x),
        top: Math.min(start.y, current.y),
        width,
        height,
      }
      mouseSelectionRef.current = updated
      setMouseSelection(updated)
      setMouseSelectionVisible(true)
    }

    document.onmouseup = () => {
      document.onmousemove = null
      document.onmouseup = null
      isMouseDown = false

      const box = mouseSelectionRef.current
      if (box.width >= MIN_SELECTION_PX && box.height >= MIN_SELECTION_PX) {
        const ids = elementIdsIntersectingSelection(
          elementListRef.current,
          box,
          canvasScaleRef.current,
          hiddenElementIdListRef.current,
        )
        if (ctrlOrShiftKeyActiveRef.current) {
          const merged = new Set([...activeElementIdListRef.current, ...ids])
          useMainStore.getState().setActiveElementIdList([...merged])
        }
        else {
          useMainStore.getState().setActiveElementIdList(ids)
        }
      }

      setMouseSelectionVisible(false)
    }
  }, [viewportRef])

  return {
    mouseSelection,
    mouseSelectionVisible,
    updateMouseSelection,
  }
}
