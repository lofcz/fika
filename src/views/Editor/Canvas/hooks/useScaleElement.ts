import { useRef, useCallback } from 'react'
import { useMainStore, useKeyboardStore, selectCtrlOrShiftKeyActive } from '@/store'
import type { PPTElement, PPTImageElement, PPTLineElement, PPTShapeElement } from '@/types/slides'
import { OperateResizeHandlers, type MultiSelectRange } from '@/types/edit'
import { MIN_SIZE } from '@/configs/element'
import { SHAPE_PATH_FORMULAS } from '@/configs/shapes'
import { clonePlain } from '@/utils/clonePlain'
import { bindDocumentDrag, rafCoalesce } from '@/utils/gestureBind'
import { findSlideViewport, getPointerClient, getViewportRenderedScale, pointerDeltaToCanvas } from '@/utils/canvasPointer'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import { applyLiveSize, autoHeightInsetSum, measureAutoTextHeight, tableCellMinHeight } from '@/utils/liveElementSize'
import { commitSlideElements } from '@/utils/commitSlideElements'

const applyLiveMultiSelectBox = (minX: number, minY: number, maxX: number, maxY: number, canvasScale: number) => {
  const multi = document.querySelector('.multi-select-operate') as HTMLElement | null
  if (!multi) return
  multi.style.left = `${minX * canvasScale}px`
  multi.style.top = `${minY * canvasScale}px`
  multi.style.width = `${(maxX - minX) * canvasScale}px`
  multi.style.height = `${(maxY - minY) * canvasScale}px`
}

const bindLiveGesture = (
  onMove: (event: MouseEvent | TouchEvent) => void,
  onEnd: (event: MouseEvent | TouchEvent) => void,
) => {
  const coalesced = rafCoalesce(onMove)
  const unbind = bindDocumentDrag({
    onDrag: state => coalesced(state.event as MouseEvent | TouchEvent),
    onDragEnd: state => onEnd(state.event as MouseEvent | TouchEvent),
  })
  return () => {
    coalesced.cancel()
    unbind()
  }
}

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
 * Live resize follows the pointer only. Snap/guides belong on move, not scale —
 * setAlignmentLines during the gesture re-renders the canvas (even `[] !== []`)
 * and makes the preview lag.
 */
export default (
  elementList: PPTElement[],
  setElementList: (value: PPTElement[]) => void,
  canvasScale: number,
) => {
  const activeElementIdList = useMainStore(s => s.activeElementIdList)
  const ctrlOrShiftKeyActive = useKeyboardStore(selectCtrlOrShiftKeyActive)

  const elementListRef = useRef(elementList)
  const gesturingRef = useRef(false)
  if (!gesturingRef.current) elementListRef.current = elementList
  const canvasScaleRef = useRef(canvasScale)
  canvasScaleRef.current = canvasScale
  const activeElementIdListRef = useRef(activeElementIdList)
  activeElementIdListRef.current = activeElementIdList
  const ctrlOrShiftKeyActiveRef = useRef(ctrlOrShiftKeyActive)
  ctrlOrShiftKeyActiveRef.current = ctrlOrShiftKeyActive

  const { addHistorySnapshot } = useHistorySnapshot()

  const scaleElement = useCallback((e: MouseEvent | TouchEvent, element: Exclude<PPTElement, PPTLineElement>, command: OperateResizeHandlers) => {
    const elementList = elementListRef.current
    const canvasScale = canvasScaleRef.current
    const ctrlOrShiftKeyActive = ctrlOrShiftKeyActiveRef.current
    let liveList = elementList
    const isTouchEvent = !(e instanceof MouseEvent)
    if (isTouchEvent && (!e.changedTouches || !e.changedTouches[0])) return

    let isMouseDown = true
    let stopGesture: (() => void) | null = null
    gesturingRef.current = true
    useMainStore.getState().setScalingState(true)
    useMainStore.getState().setGesturingState(true)

    const elOriginLeft = element.left
    const elOriginTop = element.top
    const elOriginWidth = element.width
    const elOriginHeight = element.height

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

    let baseLeft = 0
    let baseTop = 0

    if ('rotate' in element && element.rotate) {
      const oppositePoint = getOppositePoint(command, getRotateElementPoints(element, elRotate))
      baseLeft = oppositePoint.left
      baseTop = oppositePoint.top
    }

    const handleMousemove = (e: MouseEvent | TouchEvent) => {
      if (!isMouseDown) return

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
      }

      else {
        let moveX = x / renderedScale
        let moveY = y / renderedScale

        if (fixedRatio) {
          if (command === OperateResizeHandlers.RIGHT_BOTTOM || command === OperateResizeHandlers.LEFT_TOP) moveY = moveX / aspectRatio
          if (command === OperateResizeHandlers.LEFT_BOTTOM || command === OperateResizeHandlers.RIGHT_TOP) moveY = -moveX / aspectRatio
        }

        if (command === OperateResizeHandlers.RIGHT_BOTTOM) {
          width = getSizeWithinRange(elOriginWidth + moveX, 'width')
          height = getSizeWithinRange(elOriginHeight + moveY, 'height')
        }
        else if (command === OperateResizeHandlers.LEFT_BOTTOM) {
          width = getSizeWithinRange(elOriginWidth - moveX, 'width')
          height = getSizeWithinRange(elOriginHeight + moveY, 'height')
          left = elOriginLeft - (width - elOriginWidth)
        }
        else if (command === OperateResizeHandlers.LEFT_TOP) {
          width = getSizeWithinRange(elOriginWidth - moveX, 'width')
          height = getSizeWithinRange(elOriginHeight - moveY, 'height')
          left = elOriginLeft - (width - elOriginWidth)
          top = elOriginTop - (height - elOriginHeight)
        }
        else if (command === OperateResizeHandlers.RIGHT_TOP) {
          width = getSizeWithinRange(elOriginWidth + moveX, 'width')
          height = getSizeWithinRange(elOriginHeight - moveY, 'height')
          top = elOriginTop - (height - elOriginHeight)
        }
        else if (command === OperateResizeHandlers.LEFT) {
          width = getSizeWithinRange(elOriginWidth - moveX, 'width')
          left = elOriginLeft - (width - elOriginWidth)
        }
        else if (command === OperateResizeHandlers.RIGHT) {
          width = getSizeWithinRange(elOriginWidth + moveX, 'width')
        }
        else if (command === OperateResizeHandlers.TOP) {
          height = getSizeWithinRange(elOriginHeight - moveY, 'height')
          top = elOriginTop - (height - elOriginHeight)
        }
        else if (command === OperateResizeHandlers.BOTTOM) {
          height = getSizeWithinRange(elOriginHeight + moveY, 'height')
        }
      }
      
      let livePaint: { path: string, viewBox: [number, number] } | undefined
      liveList = liveList.map(el => {
        if (element.id !== el.id) return el
        if (el.type === 'shape' && 'pathFormula' in el && el.pathFormula) {
          const pathFormula = SHAPE_PATH_FORMULAS[el.pathFormula]

          let path = ''
          if ('editable' in pathFormula) path = pathFormula.formula(width, height, el.keypoints!)
          else path = pathFormula.formula(width, height)

          livePaint = { path, viewBox: [width, height] }
          return {
            ...el, left, top, width, height,
            viewBox: [width, height],
            path,
          }
        }
        if (el.type === 'table') {
          return {
            ...el, left, top, width, height,
            cellMinHeight: tableCellMinHeight(height, el.data.length),
          }
        }
        return { ...el, left, top, width, height }
      })
      // Auto-height boxes: the drag owns the height — paint the live width,
      // measure the text at that width, then paint the measured height. ONE
      // writer per frame; the measured height also lands in the drop commit.
      const autoInset = autoHeightInsetSum(element)
      if (autoInset != null) {
        applyLiveSize(element.id, left, top, width, height, canvasScaleRef.current, livePaint)
        const measured = measureAutoTextHeight(element.id, autoInset)
        if (measured != null && Math.abs(measured - height) > 0.5) {
          height = measured
          liveList = liveList.map(el => el.id === element.id ? { ...el, height } : el)
        }
        applyLiveSize(element.id, left, top, width, height, canvasScaleRef.current, livePaint, { forceHeight: true })
      }
      else {
        applyLiveSize(element.id, left, top, width, height, canvasScaleRef.current, livePaint)
      }
    }

    const handleMouseup = (e: MouseEvent | TouchEvent) => {
      if (!isMouseDown) return
      handleMousemove(e)
      isMouseDown = false
      stopGesture?.()
      stopGesture = null

      const currentPointer = getPointerClient(e)
      const moved = startPointer.x !== currentPointer.x || startPointer.y !== currentPointer.y
      if (moved) {
        const merged = commitSlideElements(liveList)
        elementListRef.current = merged
        setElementList(merged)
        addHistorySnapshot()
      }

      gesturingRef.current = false
      useMainStore.getState().setScalingState(false)
      useMainStore.getState().setGesturingState(false)
    }

    stopGesture = bindLiveGesture(handleMousemove, handleMouseup)
  }, [setElementList, addHistorySnapshot])

  const scaleMultiElement = useCallback((e: MouseEvent, range: MultiSelectRange, command: OperateResizeHandlers) => {
    const elementList = elementListRef.current
    const activeElementIdList = activeElementIdListRef.current
    const ctrlOrShiftKeyActive = ctrlOrShiftKeyActiveRef.current
    let liveList = elementList
    let isMouseDown = true
    let stopGesture: (() => void) | null = null
    gesturingRef.current = true
    useMainStore.getState().setScalingState(true)
    useMainStore.getState().setGesturingState(true)
    
    const { minX, maxX, minY, maxY } = range
    const operateWidth = maxX - minX
    const operateHeight = maxY - minY
    const aspectRatio = operateWidth / operateHeight

    const viewport = findSlideViewport(e.target)
    const startPointer = getPointerClient(e)

    const activeIds = new Set(activeElementIdList)
    const originElementList: PPTElement[] = elementList.map(el => (
      activeIds.has(el.id) ? clonePlain(el) : el
    ))

    const handleMousemove = (e: MouseEvent | TouchEvent) => {
      if (!isMouseDown) return
      
      const { x, y: scaledY } = pointerDeltaToCanvas(startPointer, e, viewport, canvasScaleRef.current)
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
      
      liveList = liveList.map(el => {
        if ((el.type === 'image' || el.type === 'shape') && activeElementIdList.includes(el.id)) {
          const originElement = originElementList.find(originEl => originEl.id === el.id) as PPTImageElement | PPTShapeElement
          const next = {
            ...el,
            width: originElement.width * widthScale,
            height: originElement.height * heightScale,
            left: currentMinX + (originElement.left - minX) * widthScale,
            top: currentMinY + (originElement.top - minY) * heightScale,
          }
          let livePaint: { path: string, viewBox: [number, number] } | undefined
          if (next.type === 'shape' && next.pathFormula) {
            const pathFormula = SHAPE_PATH_FORMULAS[next.pathFormula]
            const path = 'editable' in pathFormula
              ? pathFormula.formula(next.width, next.height, next.keypoints!)
              : pathFormula.formula(next.width, next.height)
            next.path = path
            next.viewBox = [next.width, next.height]
            livePaint = { path, viewBox: [next.width, next.height] }
          }
          applyLiveSize(el.id, next.left, next.top, next.width, next.height, canvasScaleRef.current, livePaint)
          return next
        }
        return el
      })
      applyLiveMultiSelectBox(currentMinX, currentMinY, currentMaxX, currentMaxY, canvasScaleRef.current)
    }

    const handleMouseup = (e: MouseEvent | TouchEvent) => {
      if (!isMouseDown) return
      handleMousemove(e)
      isMouseDown = false
      stopGesture?.()
      stopGesture = null

      const currentPointer = getPointerClient(e)
      const moved = startPointer.x !== currentPointer.x || startPointer.y !== currentPointer.y
      if (moved) {
        const merged = commitSlideElements(liveList)
        elementListRef.current = merged
        setElementList(merged)
        addHistorySnapshot()
      }

      gesturingRef.current = false
      useMainStore.getState().setScalingState(false)
      useMainStore.getState().setGesturingState(false)
    }

    stopGesture = bindLiveGesture(handleMousemove, handleMouseup)
  }, [setElementList, addHistorySnapshot])

  return {
    scaleElement,
    scaleMultiElement,
  }
}
