import { useRef, useCallback } from 'react'
import { commitSlideElements } from '@/utils/commitSlideElements'
import type { PPTElement, PPTShapeElement } from '@/types/slides'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import { SHAPE_PATH_FORMULAS } from '@/configs/shapes'
import { findSlideViewport, getPointerClient, pointerDeltaToCanvas } from '@/utils/canvasPointer'

interface ShapePathData {
  baseSize: number,
  originPos: number,
  min: number,
  max: number,
  relative: string,
}

export default (
  elementList: PPTElement[],
  setElementList: (value: PPTElement[]) => void,
  canvasScale: number,
) => {
  const elementListRef = useRef(elementList)
  elementListRef.current = elementList
  const canvasScaleRef = useRef(canvasScale)
  canvasScaleRef.current = canvasScale

  const { addHistorySnapshot } = useHistorySnapshot()

  const moveShapeKeypoint = useCallback((e: MouseEvent | TouchEvent, element: PPTShapeElement, index = 0) => {
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
  
    const viewport = findSlideViewport(e.target)
    const startPointer = getPointerClient(e)

    const originKeypoints = element.keypoints!

    const pathFormula = SHAPE_PATH_FORMULAS[element.pathFormula!]
    let shapePathData: ShapePathData | null = null
    if ('editable' in pathFormula && pathFormula.editable) {
      const getBaseSize = pathFormula.getBaseSize![index]
      const range = pathFormula.range![index]
      const relative = pathFormula.relative![index]
      const keypoint = originKeypoints[index]

      const baseSize = getBaseSize(element.width, element.height)
      const originPos = baseSize * keypoint
      const [min, max] = range

      shapePathData = { baseSize, originPos, min, max, relative }
    }

    const handleMousemove = (e: MouseEvent | TouchEvent) => {
      if (!isMouseDown) return

      const { x: moveX, y: moveY } = pointerDeltaToCanvas(startPointer, e, viewport, canvasScale)

      commitElements(liveList.map(el => {
        if (el.id === element.id && shapePathData) {
          const { baseSize, originPos, min, max, relative } = shapePathData
          const shapeElement = el as PPTShapeElement

          let keypoint = 0

          if (relative === 'center') keypoint = (originPos - moveX * 2) / baseSize
          else if (relative === 'left') keypoint = (originPos + moveX) / baseSize
          else if (relative === 'right') keypoint = (originPos - moveX) / baseSize
          else if (relative === 'top') keypoint = (originPos + moveY) / baseSize
          else if (relative === 'bottom') keypoint = (originPos - moveY) / baseSize
          else if (relative === 'left_bottom') keypoint = (originPos + moveX) / baseSize
          else if (relative === 'right_bottom') keypoint = (originPos - moveX) / baseSize
          else if (relative === 'top_right') keypoint = (originPos + moveY) / baseSize
          else if (relative === 'bottom_right') keypoint = (originPos - moveY) / baseSize

          if (keypoint < min) keypoint = min
          if (keypoint > max) keypoint = max

          let keypoints: number[] = []
          if (Array.isArray(originKeypoints)) {
            keypoints = [...originKeypoints]
            keypoints[index] = keypoint
          }
          else keypoints = [keypoint]

          return {
            ...el,
            keypoints,
            path: pathFormula.formula(shapeElement.width, shapeElement.height, keypoints),
          }
        }
        return el
      }))
    }

    const handleMouseup = (e: MouseEvent | TouchEvent) => {
      isMouseDown = false
      
      document.ontouchmove = null
      document.ontouchend = null
      document.onmousemove = null
      document.onmouseup = null

      const currentPointer = getPointerClient(e)

      if (startPointer.x === currentPointer.x && startPointer.y === currentPointer.y) return

      commitSlideElements(liveList)
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
  }, [setElementList, addHistorySnapshot])

  return {
    moveShapeKeypoint,
  }
}