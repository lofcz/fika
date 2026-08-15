import { useRef, useCallback } from 'react'
import { useMainStore } from '@/store'
import type { PPTElement, PPTLineElement, PPTVideoElement, PPTAudioElement, PPTChartElement } from '@/types/slides'
import { bindDocumentDrag, rafCoalesce } from '@/utils/gestureBind'
import { clientToCanvas } from '@/utils/canvasPointer'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import { commitSlideElements } from '@/utils/commitSlideElements'

/**
 * Angle from the origin to the given coordinate, in degrees.
 */
const getAngleFromCoordinate = (x: number, y: number) => {
  const radian = Math.atan2(x, y)
  const angle = 180 / Math.PI * radian
  return angle
}

const applyLiveRotateDelta = (id: string, delta: number) => {
  const css = delta ? `${delta}deg` : ''
  const box = document.getElementById(`editable-element-${id}`)?.firstElementChild as HTMLElement | null
  const operate = document.getElementById(`operate-element-${id}`)
  if (box) box.style.rotate = css
  if (operate) operate.style.rotate = css
}

export default (
  elementList: PPTElement[],
  setElementList: (value: PPTElement[]) => void,
  viewportRef: { current: HTMLElement | null },
  canvasScale: number,
) => {
  const elementListRef = useRef(elementList)
  const gesturingRef = useRef(false)
  if (!gesturingRef.current) elementListRef.current = elementList
  const canvasScaleRef = useRef(canvasScale)
  canvasScaleRef.current = canvasScale

  const { addHistorySnapshot } = useHistorySnapshot()

  const rotateElement = useCallback((e: MouseEvent | TouchEvent, element: Exclude<PPTElement, PPTChartElement | PPTLineElement | PPTVideoElement | PPTAudioElement>) => {
    const elementList = elementListRef.current
    const canvasScale = canvasScaleRef.current
    const isTouchEvent = !(e instanceof MouseEvent)
    if (isTouchEvent && (!e.changedTouches || !e.changedTouches[0])) return
  
    let isMouseDown = true
    let stopGesture: (() => void) | null = null
    let angle = 0
    const elOriginRotate = element.rotate || 0

    const elLeft = element.left
    const elTop = element.top
    const elWidth = element.width
    const elHeight = element.height

    const centerX = elLeft + elWidth / 2
    const centerY = elTop + elHeight / 2

    if (!viewportRef.current) return

    gesturingRef.current = true
    useMainStore.getState().setGesturingState(true)

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

      applyLiveRotateDelta(element.id, angle - elOriginRotate)
    }

    const handleMouseup = () => {
      if (!isMouseDown) return
      isMouseDown = false
      stopGesture?.()
      stopGesture = null

      applyLiveRotateDelta(element.id, 0)
      gesturingRef.current = false
      useMainStore.getState().setGesturingState(false)

      if (elOriginRotate === angle) return

      const next = commitSlideElements(elementList.map(el => element.id === el.id ? { ...el, rotate: angle } : el))
      elementListRef.current = next
      setElementList(next)
      addHistorySnapshot()
    }

    const onMove = rafCoalesce(handleMousemove)
    const unbind = bindDocumentDrag({
      onDrag: state => onMove(state.event as MouseEvent | TouchEvent),
      onDragEnd: () => handleMouseup(),
    })
    stopGesture = () => {
      onMove.cancel()
      unbind()
    }
  }, [setElementList, viewportRef, addHistorySnapshot])

  return {
    rotateElement,
  }
}
