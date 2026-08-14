import { useRef, useCallback } from 'react'
import { useMainStore, useSlidesStore, useKeyboardStore, syncPointerModifiers } from '@/store'
import type { PPTElement } from '@/types/slides'
import type { AlignmentLineProps } from '@/types/edit'
import { createElementIdMap, getElementRange, getRectRotatedRange } from '@/utils/element'
import { resolveGridSize, snapMovingBox, type SnapBox } from '@/utils/snap'
import { findSlideViewport, getPointerClient, pointerDeltaToCanvas } from '@/utils/canvasPointer'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'

export default (
  elementList: PPTElement[],
  setElementList: (value: PPTElement[]) => void,
  _alignmentLines: AlignmentLineProps[],
  setAlignmentLines: (value: AlignmentLineProps[]) => void,
  canvasScale: number,
) => {
  const activeElementIdList = useMainStore(s => s.activeElementIdList)
  const activeGroupElementId = useMainStore(s => s.activeGroupElementId)
  const shiftKeyState = useKeyboardStore(s => s.shiftKeyState)
  const gridLineSize = useMainStore(s => s.gridLineSize)
  const viewportRatio = useSlidesStore(s => s.viewportRatio)
  const viewportSize = useSlidesStore(s => s.viewportSize)

  const elementListRef = useRef(elementList)
  const draggingRef = useRef(false)
  if (!draggingRef.current) elementListRef.current = elementList
  const canvasScaleRef = useRef(canvasScale)
  canvasScaleRef.current = canvasScale
  const activeElementIdListRef = useRef(activeElementIdList)
  activeElementIdListRef.current = activeElementIdList
  const activeGroupElementIdRef = useRef(activeGroupElementId)
  activeGroupElementIdRef.current = activeGroupElementId
  const shiftKeyStateRef = useRef(shiftKeyState)
  shiftKeyStateRef.current = shiftKeyState
  const gridLineSizeRef = useRef(gridLineSize)
  gridLineSizeRef.current = gridLineSize
  const viewportRatioRef = useRef(viewportRatio)
  viewportRatioRef.current = viewportRatio
  const viewportSizeRef = useRef(viewportSize)
  viewportSizeRef.current = viewportSize

  const { addHistorySnapshot } = useHistorySnapshot()

  const dragElement = useCallback((e: MouseEvent | TouchEvent, element: PPTElement) => {
    const isTouchEvent = !(e instanceof MouseEvent)
    if (isTouchEvent && (!e.changedTouches || !e.changedTouches[0])) return

    const activeElementIdList = useMainStore.getState().activeElementIdList
    const activeGroupElementId = activeGroupElementIdRef.current
    const viewportSize = viewportSizeRef.current
    const viewportRatio = viewportRatioRef.current

    if (!activeElementIdList.includes(element.id)) return
    draggingRef.current = true
    let isMouseDown = true

    const edgeWidth = viewportSize
    const edgeHeight = viewportSize * viewportRatio
    
    const sorptionRange = 5

    const originElementList: PPTElement[] = JSON.parse(JSON.stringify(elementListRef.current))
    let originActiveElementList = originElementList.filter(el => activeElementIdList.includes(el.id))

    let dragTargetElement = element
    let elOriginLeft = element.left
    let elOriginTop = element.top
    let elOriginWidth = element.width
    let elOriginHeight = ('height' in element && element.height) ? element.height : 0
    let elOriginRotate = ('rotate' in element && element.rotate) ? element.rotate : 0
  
    const viewport = findSlideViewport(e.target)
    const startPointer = getPointerClient(e)
    const copyOnDrag = !isTouchEvent && (e.ctrlKey || e.metaKey)

    let isMisoperation: boolean | null = null
    let duplicateTriggered = false 

    const isActiveGroupElement = element.id === activeGroupElementId

    const dragSingleElement = activeElementIdList.length === 1 || isActiveGroupElement

    const others: SnapBox[] = []
    for (const el of elementListRef.current) {
      if (isActiveGroupElement && el.id === element.id) continue
      if (!isActiveGroupElement && activeElementIdList.includes(el.id)) continue
      others.push(getElementRange(el))
    }

    const commitLiveList = (next: PPTElement[]) => {
      elementListRef.current = next
      setElementList(next)
    }

    const duplicateElement = () => {
      const sourceElements = JSON.parse(JSON.stringify(dragSingleElement ? [dragTargetElement] : originActiveElementList)) as PPTElement[]

      const { groupIdMap, elIdMap } = createElementIdMap(sourceElements)

      const duplicatedElements = sourceElements.map(item => {
        item.id = elIdMap[item.id]
        if (isActiveGroupElement && item.groupId) delete item.groupId
        else if (item.groupId) item.groupId = groupIdMap[item.groupId]
        return item
      })

      commitLiveList([...elementListRef.current, ...duplicatedElements])
      useSlidesStore.getState().updateSlide({ elements: elementListRef.current })

      const duplicatedActiveElementIdList = duplicatedElements.map(item => item.id)
      const duplicatedHandleElementId = elIdMap[dragTargetElement.id]
      const duplicatedHandleElement = duplicatedElements.find(item => item.id === duplicatedHandleElementId)
      if (!duplicatedHandleElement) return

      const mainStore = useMainStore.getState()
      mainStore.setActiveElementIdList(duplicatedActiveElementIdList)
      mainStore.setHandleElementId(duplicatedHandleElementId)
      mainStore.setActiveGroupElementId('')
      activeElementIdListRef.current = duplicatedActiveElementIdList
      activeGroupElementIdRef.current = ''

      dragTargetElement = duplicatedHandleElement
      originActiveElementList = duplicatedElements

      elOriginLeft = duplicatedHandleElement.left
      elOriginTop = duplicatedHandleElement.top
      elOriginWidth = duplicatedHandleElement.width
      elOriginHeight = ('height' in duplicatedHandleElement && duplicatedHandleElement.height) ? duplicatedHandleElement.height : 0
      elOriginRotate = ('rotate' in duplicatedHandleElement && duplicatedHandleElement.rotate) ? duplicatedHandleElement.rotate : 0

      duplicateTriggered = true
    }

    const handleMousemove = (e: MouseEvent | TouchEvent) => {
      const currentPointer = getPointerClient(e)

      if (isMisoperation !== false) {
        isMisoperation = Math.abs(startPointer.x - currentPointer.x) < sorptionRange && 
                         Math.abs(startPointer.y - currentPointer.y) < sorptionRange
      }
      if (!isMouseDown || isMisoperation) return

      if (!duplicateTriggered && copyOnDrag) duplicateElement()
      
      let { x: moveX, y: moveY } = pointerDeltaToCanvas(startPointer, e, viewport, canvasScaleRef.current)

      if (shiftKeyStateRef.current) {
        if (Math.abs(moveX) > Math.abs(moveY)) moveY = 0
        if (Math.abs(moveX) < Math.abs(moveY)) moveX = 0
      }

      let targetLeft = elOriginLeft + moveX
      let targetTop = elOriginTop + moveY

      let targetMinX: number, targetMaxX: number, targetMinY: number, targetMaxY: number

      if (dragSingleElement) {
        if (elOriginRotate) {
          const { xRange, yRange } = getRectRotatedRange({
            left: targetLeft,
            top: targetTop,
            width: elOriginWidth,
            height: elOriginHeight,
            rotate: elOriginRotate,
          })
          targetMinX = xRange[0]
          targetMaxX = xRange[1]
          targetMinY = yRange[0]
          targetMaxY = yRange[1]
        }
        else if (dragTargetElement.type === 'line') {
          targetMinX = targetLeft
          targetMaxX = targetLeft + Math.max(dragTargetElement.start[0], dragTargetElement.end[0])
          targetMinY = targetTop
          targetMaxY = targetTop + Math.max(dragTargetElement.start[1], dragTargetElement.end[1])
        }
        else {
          targetMinX = targetLeft
          targetMaxX = targetLeft + elOriginWidth
          targetMinY = targetTop
          targetMaxY = targetTop + elOriginHeight
        }
      }
      else {
        const leftValues = []
        const topValues = []
        const rightValues = []
        const bottomValues = []
        
        for (let i = 0; i < originActiveElementList.length; i++) {
          const element = originActiveElementList[i]
          const left = element.left + moveX
          const top = element.top + moveY
          const width = element.width
          const height = ('height' in element && element.height) ? element.height : 0
          const rotate = ('rotate' in element && element.rotate) ? element.rotate : 0

          if ('rotate' in element && element.rotate) {
            const { xRange, yRange } = getRectRotatedRange({ left, top, width, height, rotate })
            leftValues.push(xRange[0])
            topValues.push(yRange[0])
            rightValues.push(xRange[1])
            bottomValues.push(yRange[1])
          }
          else if (element.type === 'line') {
            leftValues.push(left)
            topValues.push(top)
            rightValues.push(left + Math.max(element.start[0], element.end[0]))
            bottomValues.push(top + Math.max(element.start[1], element.end[1]))
          }
          else {
            leftValues.push(left)
            topValues.push(top)
            rightValues.push(left + width)
            bottomValues.push(top + height)
          }
        }

        targetMinX = Math.min(...leftValues)
        targetMaxX = Math.max(...rightValues)
        targetMinY = Math.min(...topValues)
        targetMaxY = Math.max(...bottomValues)
      }
      
      if ('altKey' in e) syncPointerModifiers(e)
      const altGrid = 'altKey' in e && e.altKey
      const { offsetX, offsetY, guides } = snapMovingBox(
        { minX: targetMinX, maxX: targetMaxX, minY: targetMinY, maxY: targetMaxY },
        others,
        {
          mode: altGrid ? 'grid' : 'smart',
          canvas: { width: edgeWidth, height: edgeHeight },
          gridSize: resolveGridSize(gridLineSizeRef.current, altGrid),
        },
      )
      targetLeft += offsetX
      targetTop += offsetY
      setAlignmentLines(guides)
       
      if (dragSingleElement) {
        commitLiveList(elementListRef.current.map(el => {
          return el.id === dragTargetElement.id ? { ...el, left: targetLeft, top: targetTop } : el
        }))
      }

      else {
        const handleElement = elementListRef.current.find(el => el.id === dragTargetElement.id)
        if (!handleElement) return

        commitLiveList(elementListRef.current.map(el => {
          if (activeElementIdListRef.current.includes(el.id)) {
            if (el.id === dragTargetElement.id) {
              return {
                ...el,
                left: targetLeft,
                top: targetTop,
              }
            }
            return {
              ...el,
              left: el.left + (targetLeft - handleElement.left),
              top: el.top + (targetTop - handleElement.top),
            }
          }
          return el
        }))
      }
    }

    const handleMouseup = (e: MouseEvent | TouchEvent) => {
      isMouseDown = false
      
      document.ontouchmove = null
      document.ontouchend = null
      document.onmousemove = null
      document.onmouseup = null

      setAlignmentLines([])

      const currentPointer = getPointerClient(e)
      const liveList = elementListRef.current
      draggingRef.current = false

      if (startPointer.x === currentPointer.x && startPointer.y === currentPointer.y) return

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
  }, [setElementList, setAlignmentLines, addHistorySnapshot])

  return {
    dragElement,
  }
}
