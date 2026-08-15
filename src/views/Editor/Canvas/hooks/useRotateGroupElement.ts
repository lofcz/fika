import { useRef, useCallback } from 'react'
import { useMainStore } from '@/store'
import type { PPTElement, PPTLineElement } from '@/types/slides'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import { canRotateGroupElements, getElementListRange, getGroupElementCenter, normalizeAngle, rotateLineElement, rotateRectLikeElement } from '@/utils/element'
import { bindDocumentDrag, rafCoalesce } from '@/utils/gestureBind'
import { commitSlideElements } from '@/utils/commitSlideElements'
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

const applyLiveGroupRotate = (
  originById: Map<string, PPTElement>,
  nextById: Map<string, PPTElement>,
  selectedIds: string[],
  delta: number,
  center: { x: number; y: number },
  canvasScale: number,
) => {
  const css = delta ? `${delta}deg` : ''
  for (const id of selectedIds) {
    const origin = originById.get(id)
    if (!origin) continue
    const box = document.getElementById(`editable-element-${id}`)?.firstElementChild as HTMLElement | null
    const operate = document.getElementById(`operate-element-${id}`)

    if (origin.type === 'line') {
      const originX = center.x - origin.left
      const originY = center.y - origin.top
      if (box) {
        box.style.transformOrigin = `${originX}px ${originY}px`
        box.style.rotate = css
      }
      if (operate) {
        operate.style.transformOrigin = `${originX * canvasScale}px ${originY * canvasScale}px`
        operate.style.rotate = css
      }
      continue
    }

    const next = nextById.get(id)
    if (box) {
      if (next) {
        box.style.left = `${next.left}px`
        box.style.top = `${next.top}px`
      }
      box.style.rotate = css
    }
    if (operate) {
      if (next) {
        operate.style.left = `${next.left * canvasScale}px`
        operate.style.top = `${next.top * canvasScale}px`
      }
      operate.style.rotate = css
    }
  }
}

const clearLiveGroupRotate = (selectedIds: string[], operateOrigins: Map<string, string>) => {
  for (const id of selectedIds) {
    const box = document.getElementById(`editable-element-${id}`)?.firstElementChild as HTMLElement | null
    const operate = document.getElementById(`operate-element-${id}`)
    if (box) {
      box.style.rotate = ''
      box.style.transformOrigin = ''
    }
    if (operate) {
      operate.style.rotate = ''
      const origin = operateOrigins.get(id)
      if (origin !== undefined) operate.style.transformOrigin = origin
    }
  }
  const multi = document.querySelector('.multi-select-operate') as HTMLElement | null
  if (multi) {
    multi.style.rotate = ''
    multi.style.transformOrigin = ''
  }
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

  const rotateGroupElement = useCallback((e: MouseEvent, elements: PPTElement[]) => {
    const elementList = elementListRef.current
    const canvasScale = canvasScaleRef.current
    if (!canRotateGroupElements(elements)) return
    if (!viewportRef.current) return

    let isMouseDown = true
    let stopGesture: (() => void) | null = null
    let deltaAngle = 0
    let liveList = elementList

    const selectedElementIdList = elements.map(element => element.id)
    const originElementList: PPTElement[] = structuredClone(elementList)
    const originElementMap = new Map(originElementList.map(element => [element.id, element]))
    const groupRotationReference = getGroupRotationReference(elements)
    const center = getGroupElementCenter(elements, groupRotationReference ?? 0)
    const range = getElementListRange(elements)
    const operateOrigins = new Map<string, string>()
    for (const id of selectedElementIdList) {
      const operate = document.getElementById(`operate-element-${id}`)
      if (operate) operateOrigins.set(id, operate.style.transformOrigin)
    }

    const multi = document.querySelector('.multi-select-operate') as HTMLElement | null
    if (multi) {
      multi.style.transformOrigin = `${(center.x - range.minX) * canvasScale}px ${(center.y - range.minY) * canvasScale}px`
    }

    const viewport = viewportRef.current
    const start = clientToCanvas(e, viewport, canvasScale)
    const startAngle = getAngleFromCoordinate(start.x - center.x, center.y - start.y)

    gesturingRef.current = true
    useMainStore.getState().setGesturingState(true)

    const handleMousemove = (e: MouseEvent | TouchEvent) => {
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

      const nextById = new Map<string, PPTElement>()
      liveList = originElementList.map(element => {
        if (!selectedElementIdList.includes(element.id)) return element

        const originElement = originElementMap.get(element.id)
        if (!originElement) return element

        const next = originElement.type === 'line'
          ? rotateLineElement(originElement, center, deltaAngle)
          : rotateRectLikeElement(originElement, center, deltaAngle)
        nextById.set(element.id, next)
        return next
      })
      applyLiveGroupRotate(originElementMap, nextById, selectedElementIdList, deltaAngle, center, canvasScaleRef.current)
      if (multi) multi.style.rotate = deltaAngle ? `${deltaAngle}deg` : ''
    }

    const handleMouseup = (e?: MouseEvent | TouchEvent) => {
      if (!isMouseDown) return
      if (e) handleMousemove(e)
      isMouseDown = false
      stopGesture?.()
      stopGesture = null

      clearLiveGroupRotate(selectedElementIdList, operateOrigins)
      gesturingRef.current = false
      useMainStore.getState().setGesturingState(false)

      if (!deltaAngle) return

      const merged = commitSlideElements(liveList)
      elementListRef.current = merged
      setElementList(merged)
      addHistorySnapshot()
    }

    const onMove = rafCoalesce(handleMousemove)
    const unbind = bindDocumentDrag({
      onDrag: state => onMove(state.event as MouseEvent | TouchEvent),
      onDragEnd: state => handleMouseup(state.event as MouseEvent | TouchEvent),
    })
    stopGesture = () => {
      onMove.cancel()
      unbind()
    }
  }, [setElementList, viewportRef, addHistorySnapshot])

  return {
    rotateGroupElement,
  }
}
