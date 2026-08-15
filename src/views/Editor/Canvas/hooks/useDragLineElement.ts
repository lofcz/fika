import { useRef, useCallback } from 'react'
import { useKeyboardStore, useMainStore, useSlidesStore, selectCtrlOrShiftKeyActive } from '@/store'
import type { PPTElement, PPTLineElement } from '@/types/slides'
import { OperateLineHandlers } from '@/types/edit'
import { getBroken2LineDirection } from '@/utils/element'
import { findSlideViewport, getPointerClient, pointerDeltaToCanvas } from '@/utils/canvasPointer'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import { commitSlideElements } from '@/utils/commitSlideElements'

interface AdsorptionPoint {
  x: number
  y: number
}

export default (elementList: PPTElement[],
  setElementList: (value: PPTElement[]) => void,) => {
  const canvasScale = useMainStore(s => s.canvasScale)
  const viewportSize = useSlidesStore(s => s.viewportSize)
  const viewportRatio = useSlidesStore(s => s.viewportRatio)
  const ctrlOrShiftKeyActive = useKeyboardStore(selectCtrlOrShiftKeyActive)
  const elementListRef = useRef(elementList)
  const draggingRef = useRef(false)
  if (!draggingRef.current) elementListRef.current = elementList
  const canvasScaleRef = useRef(canvasScale)
  canvasScaleRef.current = canvasScale
  const viewportSizeRef = useRef(viewportSize)
  viewportSizeRef.current = viewportSize
  const viewportRatioRef = useRef(viewportRatio)
  viewportRatioRef.current = viewportRatio
  const ctrlOrShiftKeyActiveRef = useRef(ctrlOrShiftKeyActive)
  ctrlOrShiftKeyActiveRef.current = ctrlOrShiftKeyActive
  const { addHistorySnapshot } = useHistorySnapshot()

  const dragLineElement = useCallback((e: MouseEvent, element: PPTLineElement, command: OperateLineHandlers) => {
    draggingRef.current = true
    let isMouseDown = true

    const sorptionRange = 8

    const viewport = findSlideViewport(e.target)
    const startPointer = getPointerClient(e)

    const adsorptionPoints: AdsorptionPoint[] = []
    const canvasWidth = viewportSizeRef.current
    const canvasHeight = viewportSizeRef.current * viewportRatioRef.current

    adsorptionPoints.push(
      { x: 0, y: 0 },
      { x: canvasWidth / 2, y: 0 },
      { x: canvasWidth, y: 0 },
      { x: 0, y: canvasHeight / 2 },
      { x: canvasWidth, y: canvasHeight / 2 },
      { x: 0, y: canvasHeight },
      { x: canvasWidth / 2, y: canvasHeight },
      { x: canvasWidth, y: canvasHeight },
    )

    for (let i = 0; i < elementListRef.current.length; i++) {
      const _element = elementListRef.current[i]
      if (_element.type === 'line' || _element.rotate) continue

      const left = _element.left
      const top = _element.top
      const width = _element.width
      const height = _element.height
      
      const right = left + width
      const bottom = top + height
      const centerX = top + height / 2
      const centerY = left + width / 2

      const topPoint = { x: centerY, y: top }
      const bottomPoint = { x: centerY, y: bottom }
      const leftPoint = { x: left, y: centerX }
      const rightPoint = { x: right, y: centerX }

      const leftTopPoint = { x: left, y: top }
      const rightTopPoint = { x: right, y: top }
      const leftBottomPoint = { x: left, y: bottom }
      const rightBottomPoint = { x: right, y: bottom }

      adsorptionPoints.push(
        topPoint,
        bottomPoint,
        leftPoint,
        rightPoint,
        leftTopPoint,
        rightTopPoint,
        leftBottomPoint,
        rightBottomPoint,
      )
    }

    const commitLiveList = (next: PPTElement[]) => {
      elementListRef.current = next
      setElementList(next)
    }

    document.onmousemove = e => {
      if (!isMouseDown) return

      const { x: moveX, y: moveY } = pointerDeltaToCanvas(startPointer, e, viewport, canvasScaleRef.current)
      
      let startX = element.left + element.start[0]
      let startY = element.top + element.start[1]
      let endX = element.left + element.end[0]
      let endY = element.top + element.end[1]

      const mid = element.broken || element.broken2 || element.curve || [0, 0]
      let midX = element.left + mid[0]
      let midY = element.top + mid[1]

      const [c1, c2] = element.cubic || [[0, 0], [0, 0]]
      let c1X = element.left + c1[0]
      let c1Y = element.top + c1[1]
      let c2X = element.left + c2[0]
      let c2Y = element.top + c2[1]

      if (command === OperateLineHandlers.START) {
        startX = startX + moveX
        startY = startY + moveY

        if (Math.abs(startX - endX) < sorptionRange) startX = endX
        if (Math.abs(startY - endY) < sorptionRange) startY = endY

        for (const adsorptionPoint of adsorptionPoints) {
          const { x, y } = adsorptionPoint
          if (Math.abs(x - startX) < sorptionRange && Math.abs(y - startY) < sorptionRange) {
            startX = x
            startY = y
            break
          }
        }
      }
      else if (command === OperateLineHandlers.END) {
        endX = endX + moveX
        endY = endY + moveY

        if (Math.abs(startX - endX) < sorptionRange) endX = startX
        if (Math.abs(startY - endY) < sorptionRange) endY = startY

        for (const adsorptionPoint of adsorptionPoints) {
          const { x, y } = adsorptionPoint
          if (Math.abs(x - endX) < sorptionRange && Math.abs(y - endY) < sorptionRange) {
            endX = x
            endY = y
            break
          }
        }
      }
      else if (command === OperateLineHandlers.C) {
        midX = midX + moveX
        midY = midY + moveY

        if (Math.abs(midX - startX) < sorptionRange) midX = startX
        if (Math.abs(midY - startY) < sorptionRange) midY = startY
        if (Math.abs(midX - endX) < sorptionRange) midX = endX
        if (Math.abs(midY - endY) < sorptionRange) midY = endY
        if (Math.abs(midX - (startX + endX) / 2) < sorptionRange && Math.abs(midY - (startY + endY) / 2) < sorptionRange) {
          midX = (startX + endX) / 2
          midY = (startY + endY) / 2
        }
      }
      else if (command === OperateLineHandlers.C1) {
        c1X = c1X + moveX
        c1Y = c1Y + moveY

        if (Math.abs(c1X - startX) < sorptionRange) c1X = startX
        if (Math.abs(c1Y - startY) < sorptionRange) c1Y = startY
        if (Math.abs(c1X - endX) < sorptionRange) c1X = endX
        if (Math.abs(c1Y - endY) < sorptionRange) c1Y = endY
      }
      else if (command === OperateLineHandlers.C2) {
        c2X = c2X + moveX
        c2Y = c2Y + moveY

        if (Math.abs(c2X - startX) < sorptionRange) c2X = startX
        if (Math.abs(c2Y - startY) < sorptionRange) c2Y = startY
        if (Math.abs(c2X - endX) < sorptionRange) c2X = endX
        if (Math.abs(c2Y - endY) < sorptionRange) c2Y = endY
      }

      const minX = Math.min(startX, endX)
      const minY = Math.min(startY, endY)
      const maxX = Math.max(startX, endX)
      const maxY = Math.max(startY, endY)

      const start: [number, number] = [0, 0]
      const end: [number, number] = [maxX - minX, maxY - minY]
      if (startX > endX) {
        start[0] = maxX - minX
        end[0] = 0
      }
      if (startY > endY) {
        start[1] = maxY - minY
        end[1] = 0
      }

      commitLiveList(elementListRef.current.map(el => {
        if (el.id === element.id) {
          const newEl: PPTLineElement = {
            ...(el as PPTLineElement),
            left: minX,
            top: minY,
            start: start,
            end: end,
          }
          if (command === OperateLineHandlers.START || command === OperateLineHandlers.END) {
            if (ctrlOrShiftKeyActiveRef.current) {
              if (element.broken) newEl.broken = [midX - minX, midY - minY]
              if (element.curve) newEl.curve = [midX - minX, midY - minY]
              if (element.cubic) newEl.cubic = [[c1X - minX, c1Y - minY], [c2X - minX, c2Y - minY]]
            }
            else {
              if (element.broken) newEl.broken = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]
              if (element.curve) newEl.curve = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]
              if (element.cubic) newEl.cubic = [[(start[0] + end[0]) / 2, (start[1] + end[1]) / 2], [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]]
            }
            if (element.broken2) newEl.broken2 = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]
          }
          else if (command === OperateLineHandlers.C) {
            if (element.broken) newEl.broken = [midX - minX, midY - minY]
            if (element.curve) newEl.curve = [midX - minX, midY - minY]
            if (element.broken2) {
              const direction = getBroken2LineDirection(element)
              if (direction === 'horizontal') newEl.broken2 = [midX - minX, newEl.broken2![1]]
              else newEl.broken2 = [newEl.broken2![0], midY - minY]
            }
          }
          else {
            if (element.cubic) newEl.cubic = [[c1X - minX, c1Y - minY], [c2X - minX, c2Y - minY]]
          }
          return newEl
        }
        return el
      }))
    }

    document.onmouseup = e => {
      isMouseDown = false
      document.onmousemove = null
      document.onmouseup = null

      const currentPointer = getPointerClient(e)
      const liveList = elementListRef.current
      draggingRef.current = false

      if (startPointer.x === currentPointer.x && startPointer.y === currentPointer.y) return

      commitSlideElements(liveList)
      addHistorySnapshot()
    }
  }, [setElementList, addHistorySnapshot])

  return {
    dragLineElement,
  }
}
