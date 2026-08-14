import { useRef, useCallback } from 'react'
import { useSlidesStore } from '@/store'
import type { PPTElement, PPTLineElement, PPTVideoElement, PPTAudioElement, PPTChartElement } from '@/types/slides'
import { clientToCanvas } from '@/utils/canvasPointer'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'

/**
 * Angle from the origin to the given coordinate, in degrees.
 */
const getAngleFromCoordinate = (x: number, y: number) => {
  const radian = Math.atan2(x, y)
  const angle = 180 / Math.PI * radian
  return angle
}

export default (
  elementList: PPTElement[],
  setElementList: (value: PPTElement[]) => void,
  viewportRef: { current: HTMLElement | null },
  canvasScale: number,
) => {
  const elementListRef = useRef(elementList)
  elementListRef.current = elementList
  const canvasScaleRef = useRef(canvasScale)
  canvasScaleRef.current = canvasScale

  const { addHistorySnapshot } = useHistorySnapshot()

  const rotateElement = useCallback((e: MouseEvent | TouchEvent, element: Exclude<PPTElement, PPTChartElement | PPTLineElement | PPTVideoElement | PPTAudioElement>) => {
    const elementList = elementListRef.current
    const canvasScale = canvasScaleRef.current
    let liveList = elementList
    const commitElements = (next: PPTElement[]) => {
      liveList = next
      elementListRef.current = next
      setElementList(next)
    }
    const isTouchEvent = !(e instanceof MouseEvent)
    if (isTouchEvent && (!e.changedTouches || !e.changedTouches[0])) return
  
    let isMouseDown = true
    let angle = 0
    const elOriginRotate = element.rotate || 0

    const elLeft = element.left
    const elTop = element.top
    const elWidth = element.width
    const elHeight = element.height

    const centerX = elLeft + elWidth / 2
    const centerY = elTop + elHeight / 2

    if (!viewportRef.current) return

    const handleMousemove = (e: MouseEvent | TouchEvent) => {
      if (!isMouseDown) return
      if (!viewportRef.current) return

      const { x: mouseX, y: mouseY } = clientToCanvas(e, viewportRef.current, canvasScale)
      const x = mouseX - centerX
      const y = centerY - mouseY

      angle = getAngleFromCoordinate(x, y)

      const sorptionRange = 5
      if ( Math.abs(angle) <= sorptionRange ) angle = 0
      else if ( angle > 0 && Math.abs(angle - 45) <= sorptionRange ) angle -= (angle - 45)
      else if ( angle < 0 && Math.abs(angle + 45) <= sorptionRange ) angle -= (angle + 45)
      else if ( angle > 0 && Math.abs(angle - 90) <= sorptionRange ) angle -= (angle - 90)
      else if ( angle < 0 && Math.abs(angle + 90) <= sorptionRange ) angle -= (angle + 90)
      else if ( angle > 0 && Math.abs(angle - 135) <= sorptionRange ) angle -= (angle - 135)
      else if ( angle < 0 && Math.abs(angle + 135) <= sorptionRange ) angle -= (angle + 135)
      else if ( angle > 0 && Math.abs(angle - 180) <= sorptionRange ) angle -= (angle - 180)
      else if ( angle < 0 && Math.abs(angle + 180) <= sorptionRange ) angle -= (angle + 180)

      commitElements(liveList.map(el => element.id === el.id ? { ...el, rotate: angle } : el))
    }

    const handleMouseup = () => {
      isMouseDown = false
      document.onmousemove = null
      document.onmouseup = null

      if (elOriginRotate === angle) return

      useSlidesStore.getState().updateSlide({ elements: liveList })
      addHistorySnapshot()
    }

    if (isTouchEvent) {
      document.ontouchmove = handleMousemove
      document.ontouchend = handleMouseup
    }
    else {
      document.onmousemove = handleMousemove
      document.onmouseup = handleMouseup
    }
  }, [setElementList, viewportRef, addHistorySnapshot])

  return {
    rotateElement,
  }
}