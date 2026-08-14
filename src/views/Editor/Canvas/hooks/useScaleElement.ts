import { useRef, useCallback } from 'react'
import { useMainStore, useSlidesStore, useKeyboardStore, selectCtrlOrShiftKeyActive, syncPointerModifiers } from '@/store'
import type { PPTElement, PPTImageElement, PPTLineElement, PPTShapeElement } from '@/types/slides'
import { OperateResizeHandlers, type AlignmentLineProps, type MultiSelectRange } from '@/types/edit'
import { MIN_SIZE } from '@/configs/element'
import { SHAPE_PATH_FORMULAS } from '@/configs/shapes'
import { getElementRange } from '@/utils/element'
import { resolveGridSize, snapResizePoint, type SnapBox } from '@/utils/snap'
import { findSlideViewport, getPointerClient, getViewportRenderedScale, pointerDeltaToCanvas } from '@/utils/canvasPointer'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'

interface RotateElementData {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Positions of the eight resize handles after rotation.
 */
const getRotateElementPoints = (element: RotateElementData, angle: number) => {
  const { left, top, width, height } = element

  const radius = Math.sqrt( Math.pow(width, 2) + Math.pow(height, 2) ) / 2
  const auxiliaryAngle = Math.atan(height / width) * 180 / Math.PI

  const tlbraRadian = (180 - angle - auxiliaryAngle) * Math.PI / 180
  const trblaRadian = (auxiliaryAngle - angle) * Math.PI / 180
  const taRadian = (90 - angle) * Math.PI / 180
  const raRadian = angle * Math.PI / 180

  const halfWidth = width / 2
  const halfHeight = height / 2

  const middleLeft = left + halfWidth
  const middleTop = top + halfHeight

  const leftTopPoint = {
    left: middleLeft + radius * Math.cos(tlbraRadian),
    top: middleTop - radius * Math.sin(tlbraRadian),
  }
  const topPoint = {
    left: middleLeft + halfHeight * Math.cos(taRadian),
    top: middleTop - halfHeight * Math.sin(taRadian),
  }
  const rightTopPoint = {
    left: middleLeft + radius * Math.cos(trblaRadian),
    top: middleTop - radius * Math.sin(trblaRadian),
  }
  const rightPoint = {
    left: middleLeft + halfWidth * Math.cos(raRadian),
    top: middleTop + halfWidth * Math.sin(raRadian),
  }
  const rightBottomPoint = {
    left: middleLeft - radius * Math.cos(tlbraRadian),
    top: middleTop + radius * Math.sin(tlbraRadian),
  }
  const bottomPoint = {
    left: middleLeft - halfHeight * Math.sin(raRadian),
    top: middleTop + halfHeight * Math.cos(raRadian),
  }
  const leftBottomPoint = {
    left: middleLeft - radius * Math.cos(trblaRadian),
    top: middleTop + radius * Math.sin(trblaRadian),
  }
  const leftPoint = {
    left: middleLeft - halfWidth * Math.cos(raRadian),
    top: middleTop - halfWidth * Math.sin(raRadian),
  }

  return { leftTopPoint, topPoint, rightTopPoint, rightPoint, rightBottomPoint, bottomPoint, leftBottomPoint, leftPoint }
}

/**
 * Opposite handle of the active resize point (top↔bottom, top-left↔bottom-right).
 */
const getOppositePoint = (direction: OperateResizeHandlers, points: ReturnType<typeof getRotateElementPoints>): { left: number; top: number } => {
  const oppositeMap = {
    [OperateResizeHandlers.RIGHT_BOTTOM]: points.leftTopPoint,
    [OperateResizeHandlers.LEFT_BOTTOM]: points.rightTopPoint,
    [OperateResizeHandlers.LEFT_TOP]: points.rightBottomPoint,
    [OperateResizeHandlers.RIGHT_TOP]: points.leftBottomPoint,
    [OperateResizeHandlers.TOP]: points.bottomPoint,
    [OperateResizeHandlers.BOTTOM]: points.topPoint,
    [OperateResizeHandlers.LEFT]: points.rightPoint,
    [OperateResizeHandlers.RIGHT]: points.leftPoint,
  }
  return oppositeMap[direction]
}

/**
 * Whether the active handle is a corner.
 */
const isCornerResizeHandler = (direction: OperateResizeHandlers) => {
  return direction === OperateResizeHandlers.RIGHT_BOTTOM ||
    direction === OperateResizeHandlers.LEFT_BOTTOM ||
    direction === OperateResizeHandlers.LEFT_TOP ||
    direction === OperateResizeHandlers.RIGHT_TOP
}

/**
 * Position of the active resize handle.
 */
const getResizeHandlerPoint = (direction: OperateResizeHandlers, points: ReturnType<typeof getRotateElementPoints>): { left: number; top: number } => {
  const pointMap = {
    [OperateResizeHandlers.RIGHT_BOTTOM]: points.rightBottomPoint,
    [OperateResizeHandlers.LEFT_BOTTOM]: points.leftBottomPoint,
    [OperateResizeHandlers.LEFT_TOP]: points.leftTopPoint,
    [OperateResizeHandlers.RIGHT_TOP]: points.rightTopPoint,
    [OperateResizeHandlers.TOP]: points.topPoint,
    [OperateResizeHandlers.BOTTOM]: points.bottomPoint,
    [OperateResizeHandlers.LEFT]: points.leftPoint,
    [OperateResizeHandlers.RIGHT]: points.rightPoint,
  }
  return pointMap[direction]
}

export default (
  elementList: PPTElement[],
  setElementList: (value: PPTElement[]) => void,
  _alignmentLines: AlignmentLineProps[],
  setAlignmentLines: (value: AlignmentLineProps[]) => void,
  canvasScale: number,
) => {
  const activeElementIdList = useMainStore(s => s.activeElementIdList)
  const activeGroupElementId = useMainStore(s => s.activeGroupElementId)
  const viewportRatio = useSlidesStore(s => s.viewportRatio)
  const viewportSize = useSlidesStore(s => s.viewportSize)
  const gridLineSize = useMainStore(s => s.gridLineSize)
  const ctrlOrShiftKeyActive = useKeyboardStore(selectCtrlOrShiftKeyActive)

  const elementListRef = useRef(elementList)
  elementListRef.current = elementList
  const canvasScaleRef = useRef(canvasScale)
  canvasScaleRef.current = canvasScale
  const activeElementIdListRef = useRef(activeElementIdList)
  activeElementIdListRef.current = activeElementIdList
  const activeGroupElementIdRef = useRef(activeGroupElementId)
  activeGroupElementIdRef.current = activeGroupElementId
  const viewportRatioRef = useRef(viewportRatio)
  viewportRatioRef.current = viewportRatio
  const viewportSizeRef = useRef(viewportSize)
  viewportSizeRef.current = viewportSize
  const gridLineSizeRef = useRef(gridLineSize)
  gridLineSizeRef.current = gridLineSize
  const ctrlOrShiftKeyActiveRef = useRef(ctrlOrShiftKeyActive)
  ctrlOrShiftKeyActiveRef.current = ctrlOrShiftKeyActive

  const { addHistorySnapshot } = useHistorySnapshot()

  const scaleElement = useCallback((e: MouseEvent | TouchEvent, element: Exclude<PPTElement, PPTLineElement>, command: OperateResizeHandlers) => {
    const elementList = elementListRef.current
    const canvasScale = canvasScaleRef.current
    const activeElementIdList = activeElementIdListRef.current
    const activeGroupElementId = activeGroupElementIdRef.current
    const viewportRatio = viewportRatioRef.current
    const viewportSize = viewportSizeRef.current
    const ctrlOrShiftKeyActive = ctrlOrShiftKeyActiveRef.current
    let liveList = elementList
    const commitElements = (next: PPTElement[]) => {
      liveList = next
      elementListRef.current = next
      setElementList(next)
    }
    const isTouchEvent = !(e instanceof MouseEvent)
    if (isTouchEvent && (!e.changedTouches || !e.changedTouches[0])) return

    let isMouseDown = true
    useMainStore.getState().setScalingState(true)

    const elOriginLeft = element.left
    const elOriginTop = element.top
    const elOriginWidth = element.width
    const elOriginHeight = element.height

    const originTableCellMinHeight = element.type === 'table' ? element.cellMinHeight : 0
    
    const elRotate = ('rotate' in element && element.rotate) ? element.rotate : 0
    const rotateRadian = Math.PI * elRotate / 180

    const fixedRatio = ctrlOrShiftKeyActive || ('fixedRatio' in element && element.fixedRatio)
    const aspectRatio = elOriginWidth / elOriginHeight

    const viewport = findSlideViewport(e.target)
    const startPointer = getPointerClient(e)
    const getRenderedScale = () => getViewportRenderedScale(viewport, canvasScale)

    const minSize = MIN_SIZE[element.type] || 20
    const getSizeWithinRange = (size: number, type: 'width' | 'height') => {
      if (!fixedRatio) return size < minSize ? minSize : size

      let minWidth = minSize
      let minHeight = minSize
      const ratio = element.width / element.height
      if (ratio < 1) minHeight = minSize / ratio
      if (ratio > 1) minWidth = minSize * ratio

      if (type === 'width') return size < minWidth ? minWidth : size
      return size < minHeight ? minHeight : size
    }

    let points: ReturnType<typeof getRotateElementPoints>
    let baseLeft = 0
    let baseTop = 0
    const isCornerScaling = elRotate ? isCornerResizeHandler(command) : false
    const others: SnapBox[] = []

    if ('rotate' in element && element.rotate) {
      const { left, top, width, height } = element
      points = getRotateElementPoints({ left, top, width, height }, elRotate)
      const oppositePoint = getOppositePoint(command, points)

      baseLeft = oppositePoint.left
      baseTop = oppositePoint.top
    }

    if (!elRotate || isCornerScaling) {
      const isActiveGroupElement = element.id === activeGroupElementId
      for (const el of elementList) {
        if (isActiveGroupElement && el.id === element.id) continue
        if (!isActiveGroupElement && activeElementIdList.includes(el.id)) continue
        others.push(getElementRange(el))
      }
    }

    let currentEvent: MouseEvent | TouchEvent | null = null
    const alignedAdsorption = (currentX: number | null, currentY: number | null) => {
      if (currentEvent && 'altKey' in currentEvent) syncPointerModifiers(currentEvent)
      const altGrid = !!currentEvent && 'altKey' in currentEvent && currentEvent.altKey
      const result = snapResizePoint(currentX, currentY, others, {
        mode: altGrid ? 'grid' : 'smart',
        canvas: { width: viewportSize, height: viewportSize * viewportRatio },
        gridSize: resolveGridSize(gridLineSizeRef.current, altGrid),
        moving: {
          minX: elOriginLeft,
          maxX: elOriginLeft + elOriginWidth,
          minY: elOriginTop,
          maxY: elOriginTop + elOriginHeight,
        },
        resizeWidth: currentX !== null,
        resizeHeight: currentY !== null,
      })
      setAlignmentLines(result.guides)
      return result
    }

    const handleMousemove = (e: MouseEvent | TouchEvent) => {
      if (!isMouseDown) return
      currentEvent = e

      const currentPointer = getPointerClient(e)

      const x = currentPointer.x - startPointer.x
      const y = currentPointer.y - startPointer.y
      const renderedScale = getRenderedScale()

      let width = elOriginWidth
      let height = elOriginHeight
      let left = elOriginLeft
      let top = elOriginTop
      
      if (elRotate) {
        let revisedX = (Math.cos(rotateRadian) * x + Math.sin(rotateRadian) * y) / renderedScale
        let revisedY = (Math.cos(rotateRadian) * y - Math.sin(rotateRadian) * x) / renderedScale

        if (fixedRatio) {
          if (command === OperateResizeHandlers.RIGHT_BOTTOM || command === OperateResizeHandlers.LEFT_TOP) revisedY = revisedX / aspectRatio
          if (command === OperateResizeHandlers.LEFT_BOTTOM || command === OperateResizeHandlers.RIGHT_TOP) revisedY = -revisedX / aspectRatio
        }

        const updateRotatedElementSize = () => {
          width = elOriginWidth
          height = elOriginHeight
          left = elOriginLeft
          top = elOriginTop

          if (command === OperateResizeHandlers.RIGHT_BOTTOM) {
            width = getSizeWithinRange(elOriginWidth + revisedX, 'width')
            height = getSizeWithinRange(elOriginHeight + revisedY, 'height')
          }
          else if (command === OperateResizeHandlers.LEFT_BOTTOM) {
            width = getSizeWithinRange(elOriginWidth - revisedX, 'width')
            height = getSizeWithinRange(elOriginHeight + revisedY, 'height')
            left = elOriginLeft - (width - elOriginWidth)
          }
          else if (command === OperateResizeHandlers.LEFT_TOP) {
            width = getSizeWithinRange(elOriginWidth - revisedX, 'width')
            height = getSizeWithinRange(elOriginHeight - revisedY, 'height')
            left = elOriginLeft - (width - elOriginWidth)
            top = elOriginTop - (height - elOriginHeight)
          }
          else if (command === OperateResizeHandlers.RIGHT_TOP) {
            width = getSizeWithinRange(elOriginWidth + revisedX, 'width')
            height = getSizeWithinRange(elOriginHeight - revisedY, 'height')
            top = elOriginTop - (height - elOriginHeight)
          }
          else if (command === OperateResizeHandlers.TOP) {
            height = getSizeWithinRange(elOriginHeight - revisedY, 'height')
            top = elOriginTop - (height - elOriginHeight)
          }
          else if (command === OperateResizeHandlers.BOTTOM) {
            height = getSizeWithinRange(elOriginHeight + revisedY, 'height')
          }
          else if (command === OperateResizeHandlers.LEFT) {
            width = getSizeWithinRange(elOriginWidth - revisedX, 'width')
            left = elOriginLeft - (width - elOriginWidth)
          }
          else if (command === OperateResizeHandlers.RIGHT) {
            width = getSizeWithinRange(elOriginWidth + revisedX, 'width')
          }
        }

        const correctRotatedElementPosition = () => {
          const currentPoints = getRotateElementPoints({ width, height, left, top }, elRotate)
          const currentOppositePoint = getOppositePoint(command, currentPoints)
          const currentBaseLeft = currentOppositePoint.left
          const currentBaseTop = currentOppositePoint.top

          const offsetX = currentBaseLeft - baseLeft
          const offsetY = currentBaseTop - baseTop

          left = left - offsetX
          top = top - offsetY
        }

        updateRotatedElementSize()
        correctRotatedElementPosition()

        if (isCornerScaling) {
          const currentPoints = getRotateElementPoints({ width, height, left, top }, elRotate)
          const currentHandlerPoint = getResizeHandlerPoint(command, currentPoints)
          const { offsetX, offsetY } = alignedAdsorption(currentHandlerPoint.left, currentHandlerPoint.top)

          if (offsetX || offsetY) {
            const worldCorrectionX = -offsetX
            const worldCorrectionY = -offsetY

            if (fixedRatio) {
              const ratioDirection = command === OperateResizeHandlers.RIGHT_BOTTOM || command === OperateResizeHandlers.LEFT_TOP ? 1 : -1
              const vectorX = Math.cos(rotateRadian) - Math.sin(rotateRadian) * ratioDirection / aspectRatio
              const vectorY = Math.sin(rotateRadian) + Math.cos(rotateRadian) * ratioDirection / aspectRatio

              if (offsetY && vectorY) revisedX = revisedX + worldCorrectionY / vectorY
              else if (offsetX && vectorX) revisedX = revisedX + worldCorrectionX / vectorX
              revisedY = ratioDirection * revisedX / aspectRatio
            }
            else {
              const localCorrectionX = Math.cos(rotateRadian) * worldCorrectionX + Math.sin(rotateRadian) * worldCorrectionY
              const localCorrectionY = Math.cos(rotateRadian) * worldCorrectionY - Math.sin(rotateRadian) * worldCorrectionX

              revisedX = revisedX + localCorrectionX
              revisedY = revisedY + localCorrectionY
            }

            updateRotatedElementSize()
            correctRotatedElementPosition()
          }
        }
      }

      else {
        let moveX = x / renderedScale
        let moveY = y / renderedScale

        if (fixedRatio) {
          if (command === OperateResizeHandlers.RIGHT_BOTTOM || command === OperateResizeHandlers.LEFT_TOP) moveY = moveX / aspectRatio
          if (command === OperateResizeHandlers.LEFT_BOTTOM || command === OperateResizeHandlers.RIGHT_TOP) moveY = -moveX / aspectRatio
        }

        if (command === OperateResizeHandlers.RIGHT_BOTTOM) {
          const { offsetX, offsetY } = alignedAdsorption(elOriginLeft + elOriginWidth + moveX, elOriginTop + elOriginHeight + moveY)
          moveX = moveX - offsetX
          moveY = moveY - offsetY
          if (fixedRatio) {
            if (offsetY) moveX = moveY * aspectRatio
            else moveY = moveX / aspectRatio
          }
          width = getSizeWithinRange(elOriginWidth + moveX, 'width')
          height = getSizeWithinRange(elOriginHeight + moveY, 'height')
        }
        else if (command === OperateResizeHandlers.LEFT_BOTTOM) {
          const { offsetX, offsetY } = alignedAdsorption(elOriginLeft + moveX, elOriginTop + elOriginHeight + moveY)
          moveX = moveX - offsetX
          moveY = moveY - offsetY
          if (fixedRatio) {
            if (offsetY) moveX = -moveY * aspectRatio
            else moveY = -moveX / aspectRatio
          }
          width = getSizeWithinRange(elOriginWidth - moveX, 'width')
          height = getSizeWithinRange(elOriginHeight + moveY, 'height')
          left = elOriginLeft - (width - elOriginWidth)
        }
        else if (command === OperateResizeHandlers.LEFT_TOP) {
          const { offsetX, offsetY } = alignedAdsorption(elOriginLeft + moveX, elOriginTop + moveY)
          moveX = moveX - offsetX
          moveY = moveY - offsetY
          if (fixedRatio) {
            if (offsetY) moveX = moveY * aspectRatio
            else moveY = moveX / aspectRatio
          }
          width = getSizeWithinRange(elOriginWidth - moveX, 'width')
          height = getSizeWithinRange(elOriginHeight - moveY, 'height')
          left = elOriginLeft - (width - elOriginWidth)
          top = elOriginTop - (height - elOriginHeight)
        }
        else if (command === OperateResizeHandlers.RIGHT_TOP) {
          const { offsetX, offsetY } = alignedAdsorption(elOriginLeft + elOriginWidth + moveX, elOriginTop + moveY)
          moveX = moveX - offsetX
          moveY = moveY - offsetY
          if (fixedRatio) {
            if (offsetY) moveX = -moveY * aspectRatio
            else moveY = -moveX / aspectRatio
          }
          width = getSizeWithinRange(elOriginWidth + moveX, 'width')
          height = getSizeWithinRange(elOriginHeight - moveY, 'height')
          top = elOriginTop - (height - elOriginHeight)
        }
        else if (command === OperateResizeHandlers.LEFT) {
          const { offsetX } = alignedAdsorption(elOriginLeft + moveX, null)
          moveX = moveX - offsetX
          width = getSizeWithinRange(elOriginWidth - moveX, 'width')
          left = elOriginLeft - (width - elOriginWidth)
        }
        else if (command === OperateResizeHandlers.RIGHT) {
          const { offsetX } = alignedAdsorption(elOriginLeft + elOriginWidth + moveX, null)
          moveX = moveX - offsetX
          width = getSizeWithinRange(elOriginWidth + moveX, 'width')
        }
        else if (command === OperateResizeHandlers.TOP) {
          const { offsetY } = alignedAdsorption(null, elOriginTop + moveY)
          moveY = moveY - offsetY
          height = getSizeWithinRange(elOriginHeight - moveY, 'height')
          top = elOriginTop - (height - elOriginHeight)
        }
        else if (command === OperateResizeHandlers.BOTTOM) {
          const { offsetY } = alignedAdsorption(null, elOriginTop + elOriginHeight + moveY)
          moveY = moveY - offsetY
          height = getSizeWithinRange(elOriginHeight + moveY, 'height')
        }
      }
      
      commitElements(liveList.map(el => {
        if (element.id !== el.id) return el
        if (el.type === 'shape' && 'pathFormula' in el && el.pathFormula) {
          const pathFormula = SHAPE_PATH_FORMULAS[el.pathFormula]

          let path = ''
          if ('editable' in pathFormula) path = pathFormula.formula(width, height, el.keypoints!)
          else path = pathFormula.formula(width, height)

          return {
            ...el, left, top, width, height,
            viewBox: [width, height],
            path,
          }
        }
        if (el.type === 'table') {
          let cellMinHeight = originTableCellMinHeight + (height - elOriginHeight) / el.data.length
          cellMinHeight = cellMinHeight < 36 ? 36 : cellMinHeight

          if (cellMinHeight === originTableCellMinHeight) return { ...el, left, width }
          return {
            ...el, left, top, width, height,
            cellMinHeight: cellMinHeight < 36 ? 36 : cellMinHeight,
          }
        }
        return { ...el, left, top, width, height }
      }))
    }

    const handleMouseup = (e: MouseEvent | TouchEvent) => {
      isMouseDown = false
      
      document.ontouchmove = null
      document.ontouchend = null
      document.onmousemove = null
      document.onmouseup = null

      setAlignmentLines([])

      const currentPointer = getPointerClient(e)
      
      if (startPointer.x === currentPointer.x && startPointer.y === currentPointer.y) return
      
      useSlidesStore.getState().updateSlide({ elements: liveList })
      useMainStore.getState().setScalingState(false)
      
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
  }, [setElementList, setAlignmentLines, addHistorySnapshot])

  const scaleMultiElement = useCallback((e: MouseEvent, range: MultiSelectRange, command: OperateResizeHandlers) => {
    const elementList = elementListRef.current
    const canvasScale = canvasScaleRef.current
    const activeElementIdList = activeElementIdListRef.current
    const ctrlOrShiftKeyActive = ctrlOrShiftKeyActiveRef.current
    let liveList = elementList
    const commitElements = (next: PPTElement[]) => {
      liveList = next
      elementListRef.current = next
      setElementList(next)
    }
    let isMouseDown = true
    
    const { minX, maxX, minY, maxY } = range
    const operateWidth = maxX - minX
    const operateHeight = maxY - minY
    const aspectRatio = operateWidth / operateHeight

    const viewport = findSlideViewport(e.target)
    const startPointer = getPointerClient(e)

    const originElementList: PPTElement[] = JSON.parse(JSON.stringify(elementList))

    document.onmousemove = e => {
      if (!isMouseDown) return
      
      const { x, y: scaledY } = pointerDeltaToCanvas(startPointer, e, viewport, canvasScale)
      let y = scaledY

      if (ctrlOrShiftKeyActive) {
        if (command === OperateResizeHandlers.RIGHT_BOTTOM || command === OperateResizeHandlers.LEFT_TOP) y = x / aspectRatio
        if (command === OperateResizeHandlers.LEFT_BOTTOM || command === OperateResizeHandlers.RIGHT_TOP) y = -x / aspectRatio
      }

      let currentMinX = minX
      let currentMaxX = maxX
      let currentMinY = minY
      let currentMaxY = maxY

      if (command === OperateResizeHandlers.RIGHT_BOTTOM) {
        currentMaxX = maxX + x
        currentMaxY = maxY + y
      }
      else if (command === OperateResizeHandlers.LEFT_BOTTOM) {
        currentMinX = minX + x
        currentMaxY = maxY + y
      }
      else if (command === OperateResizeHandlers.LEFT_TOP) {
        currentMinX = minX + x
        currentMinY = minY + y
      }
      else if (command === OperateResizeHandlers.RIGHT_TOP) {
        currentMaxX = maxX + x
        currentMinY = minY + y
      }
      else if (command === OperateResizeHandlers.TOP) {
        currentMinY = minY + y
      }
      else if (command === OperateResizeHandlers.BOTTOM) {
        currentMaxY = maxY + y
      }
      else if (command === OperateResizeHandlers.LEFT) {
        currentMinX = minX + x
      }
      else if (command === OperateResizeHandlers.RIGHT) {
        currentMaxX = maxX + x
      }

      const currentOppositeWidth = currentMaxX - currentMinX
      const currentOppositeHeight = currentMaxY - currentMinY

      let widthScale = currentOppositeWidth / operateWidth
      let heightScale = currentOppositeHeight / operateHeight

      if (widthScale <= 0) widthScale = 0
      if (heightScale <= 0) heightScale = 0
      
      commitElements(liveList.map(el => {
        if ((el.type === 'image' || el.type === 'shape') && activeElementIdList.includes(el.id)) {
          const originElement = originElementList.find(originEl => originEl.id === el.id) as PPTImageElement | PPTShapeElement
          return {
            ...el,
            width: originElement.width * widthScale,
            height: originElement.height * heightScale,
            left: currentMinX + (originElement.left - minX) * widthScale,
            top: currentMinY + (originElement.top - minY) * heightScale,
          }
        }
        return el
      }))
    }

    document.onmouseup = e => {
      isMouseDown = false
      document.onmousemove = null
      document.onmouseup = null

      const currentPointer = getPointerClient(e)
      if (startPointer.x === currentPointer.x && startPointer.y === currentPointer.y) return

      useSlidesStore.getState().updateSlide({ elements: liveList })
      addHistorySnapshot()
    }
  }, [setElementList, addHistorySnapshot])

  return {
    scaleElement,
    scaleMultiElement,
  }
}
