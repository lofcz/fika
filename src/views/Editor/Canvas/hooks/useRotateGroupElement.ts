import { useRef, useCallback } from 'react'
import { useSlidesStore } from '@/store'
import type { PPTElement, PPTLineElement } from '@/types/slides'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import { canRotateGroupElements, getGroupElementCenter, normalizeAngle, rotateLineElement, rotateRectLikeElement } from '@/utils/element'
import { clientToCanvas } from '@/utils/canvasPointer'

const getAngleFromCoordinate = (x: number, y: number) => {
  const radian = Math.atan2(x, y)
  return 180 / Math.PI * radian
}

const getSnappedAngle = (angle: number) => {
  const sorptionRange = 5

  let result = angle
  if ( Math.abs(result) <= sorptionRange ) result = 0
  else if ( result > 0 && Math.abs(result - 45) <= sorptionRange ) result -= (result - 45)
  else if ( result < 0 && Math.abs(result + 45) <= sorptionRange ) result -= (result + 45)
  else if ( result > 0 && Math.abs(result - 90) <= sorptionRange ) result -= (result - 90)
  else if ( result < 0 && Math.abs(result + 90) <= sorptionRange ) result -= (result + 90)
  else if ( result > 0 && Math.abs(result - 135) <= sorptionRange ) result -= (result - 135)
  else if ( result < 0 && Math.abs(result + 135) <= sorptionRange ) result -= (result + 135)
  else if ( result > 0 && Math.abs(result - 180) <= sorptionRange ) result -= (result - 180)
  else if ( result < 0 && Math.abs(result + 180) <= sorptionRange ) result -= (result + 180)

  return result
}

const getGroupRotationReference = (elements: PPTElement[]) => {
  const rotatableElements = elements.filter((element): element is Exclude<PPTElement, PPTLineElement> => element.type !== 'line')
  if (!rotatableElements.length) return null

  const baseRotate = rotatableElements[0].rotate
  const epsilon = 0.1
  const allSameRotate = rotatableElements.every(element => Math.abs(normalizeAngle(element.rotate - baseRotate)) <= epsilon)

  return allSameRotate ? baseRotate : null
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

  const rotateGroupElement = useCallback((e: MouseEvent, elements: PPTElement[]) => {
    const elementList = elementListRef.current
    const canvasScale = canvasScaleRef.current
    let liveList = elementList
    const commitElements = (next: PPTElement[]) => {
      liveList = next
      elementListRef.current = next
      setElementList(next)
    }
    if (!canRotateGroupElements(elements)) return
    if (!viewportRef.current) return

    let isMouseDown = true
    let deltaAngle = 0

    const selectedElementIdList = elements.map(element => element.id)
    const originElementList: PPTElement[] = JSON.parse(JSON.stringify(elementList))
    const originElementMap = new Map(originElementList.map(element => [element.id, element]))
    const groupRotationReference = getGroupRotationReference(elements)
    const center = getGroupElementCenter(elements, groupRotationReference ?? 0)

    const viewport = viewportRef.current
    const start = clientToCanvas(e, viewport, canvasScale)
    const startAngle = getAngleFromCoordinate(start.x - center.x, center.y - start.y)

    const handleMousemove = (e: MouseEvent) => {
      if (!isMouseDown) return

      const current = clientToCanvas(e, viewport, canvasScale)
      const currentAngle = getAngleFromCoordinate(current.x - center.x, center.y - current.y)
      const rawDeltaAngle = normalizeAngle(currentAngle - startAngle)
      if (groupRotationReference === null) {
        deltaAngle = rawDeltaAngle
      }
      else {
        const targetRotate = normalizeAngle(groupRotationReference + rawDeltaAngle)
        const snappedTargetRotate = getSnappedAngle(targetRotate)
        deltaAngle = normalizeAngle(snappedTargetRotate - groupRotationReference)
      }

      commitElements(originElementList.map(element => {
        if (!selectedElementIdList.includes(element.id)) return element

        const originElement = originElementMap.get(element.id)
        if (!originElement) return element

        if (originElement.type === 'line') return rotateLineElement(originElement, center, deltaAngle)
        return rotateRectLikeElement(originElement, center, deltaAngle)
      }))
    }

    const handleMouseup = () => {
      isMouseDown = false
      document.onmousemove = null
      document.onmouseup = null

      if (!deltaAngle) return

      useSlidesStore.getState().updateSlide({ elements: liveList })
      addHistorySnapshot()
    }

    document.onmousemove = handleMousemove
    document.onmouseup = handleMouseup
  }, [setElementList, viewportRef, addHistorySnapshot])

  return {
    rotateGroupElement,
  }
}
