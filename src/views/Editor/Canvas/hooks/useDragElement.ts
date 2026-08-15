import { useRef, useCallback } from 'react'
import { useMainStore, useSlidesStore, useKeyboardStore, syncPointerModifiers } from '@/store'
import type { PPTElement } from '@/types/slides'
import type { AlignmentLineProps } from '@/types/edit'
import { createElementIdMap, getElementRange, getRectRotatedRange } from '@/utils/element'
import { clonePlain } from '@/utils/clonePlain'
import { bindDocumentDrag, rafCoalesce } from '@/utils/gestureBind'
import { clearLiveElementOffset, readLiveMultiOrigin, setLiveElementOffset, settleLiveElementOffset } from '@/utils/liveElementOffset'
import { buildSnapIndex } from '@/utils/spatial'
import { resolveGridSize, sameSnapGuides, snapMovingBox, type SnapBox } from '@/utils/snap'
import { findSlideViewport, getPointerClient, pointerDeltaToCanvas } from '@/utils/canvasPointer'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import { commitSlideElements } from '@/utils/commitSlideElements'

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

    const activeIds = new Set(activeElementIdList)
    const originElementList: PPTElement[] = elementListRef.current.map(el => (
      activeIds.has(el.id) ? clonePlain(el) : el
    ))
    useMainStore.getState().setGesturingState(true)
    const originActiveElementList = originElementList.filter(el => activeElementIdList.includes(el.id))

    const elOriginLeft = element.left
    const elOriginTop = element.top
    const elOriginWidth = element.width
    const elOriginHeight = ('height' in element && element.height) ? element.height : 0
    const elOriginRotate = ('rotate' in element && element.rotate) ? element.rotate : 0
  
    const viewport = findSlideViewport(e.target)
    const startPointer = getPointerClient(e)
    const copyOnDrag = !isTouchEvent && (e.ctrlKey || e.metaKey)

    let isMisoperation: boolean | null = null
    let duplicateTriggered = false
    let lastLeft = elOriginLeft
    let lastTop = elOriginTop
    let stopGesture: (() => void) | null = null 

    const isActiveGroupElement = element.id === activeGroupElementId

    const dragSingleElement = activeElementIdList.length === 1 || isActiveGroupElement

    const others: SnapBox[] = []
    for (const el of elementListRef.current) {
      if (isActiveGroupElement && el.id === element.id) continue
      if (!isActiveGroupElement && activeElementIdList.includes(el.id)) continue
      others.push(getElementRange(el))
    }
    const snapIndex = buildSnapIndex(others)
    const movingIds = isActiveGroupElement ? [element.id] : [...activeElementIdList]
    const liveOrigins = (isActiveGroupElement ? [element] : originActiveElementList).map(el => ({
      id: el.id,
      left: el.left,
      top: el.top,
    }))
    const multiOrigin = readLiveMultiOrigin(canvasScaleRef.current)
    let lastGuides: AlignmentLineProps[] = []
    const endGesture = () => {
      requestAnimationFrame(() => {
        useMainStore.getState().setGesturingState(false)
      })
    }

    const commitLiveList = (next: PPTElement[]) => {
      elementListRef.current = next
      setElementList(next)
    }

    const commitCopiedElements = (dx: number, dy: number) => {
      const sourceElements = clonePlain(dragSingleElement ? [element] : originActiveElementList)
      const { groupIdMap, elIdMap } = createElementIdMap(sourceElements)
      const duplicatedElements = sourceElements.map(item => {
        item.id = elIdMap[item.id]
        if (isActiveGroupElement && item.groupId) delete item.groupId
        else if (item.groupId) item.groupId = groupIdMap[item.groupId]
        item.left += dx
        item.top += dy
        return item
      })
      const next = [...elementListRef.current, ...duplicatedElements]
      const duplicatedHandleElementId = elIdMap[element.id]
      const mainStore = useMainStore.getState()
      mainStore.setActiveElementIdList(duplicatedElements.map(item => item.id))
      mainStore.setHandleElementId(duplicatedHandleElementId)
      mainStore.setActiveGroupElementId('')
      activeElementIdListRef.current = duplicatedElements.map(item => item.id)
      activeGroupElementIdRef.current = ''
      return next
    }

    const handleMousemove = (e: MouseEvent | TouchEvent) => {
      const currentPointer = getPointerClient(e)

      if (isMisoperation !== false) {
        isMisoperation = Math.abs(startPointer.x - currentPointer.x) < sorptionRange && 
                         Math.abs(startPointer.y - currentPointer.y) < sorptionRange
      }
      if (!isMouseDown || isMisoperation) return

      if (!duplicateTriggered && copyOnDrag) duplicateTriggered = true
      
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
        else if (element.type === 'line') {
          targetMinX = targetLeft
          targetMaxX = targetLeft + Math.max(element.start[0], element.end[0])
          targetMinY = targetTop
          targetMaxY = targetTop + Math.max(element.start[1], element.end[1])
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
          index: snapIndex,
        },
      )
      targetLeft += offsetX
      targetTop += offsetY
      if (!sameSnapGuides(lastGuides, guides)) {
        lastGuides = guides
        setAlignmentLines(guides)
      }
      setLiveElementOffset(liveOrigins, targetLeft - elOriginLeft, targetTop - elOriginTop, canvasScaleRef.current, multiOrigin)
      lastLeft = targetLeft
      lastTop = targetTop
    }

    const handleMouseup = (e: MouseEvent | TouchEvent) => {
      if (!isMouseDown) return
      isMouseDown = false
      stopGesture?.()
      stopGesture = null

      setAlignmentLines([])

      const currentPointer = getPointerClient(e)
      draggingRef.current = false

      if (startPointer.x === currentPointer.x && startPointer.y === currentPointer.y) {
        clearLiveElementOffset(liveOrigins, canvasScaleRef.current, multiOrigin)
        endGesture()
        return
      }

      const dx = lastLeft - elOriginLeft
      const dy = lastTop - elOriginTop
      const next = duplicateTriggered
        ? commitCopiedElements(dx, dy)
        : elementListRef.current.map(el => {
          if (!movingIds.includes(el.id)) return el
          if (el.id === element.id) return { ...el, left: lastLeft, top: lastTop }
          return { ...el, left: el.left + dx, top: el.top + dy }
        })
      if (duplicateTriggered) clearLiveElementOffset(liveOrigins, canvasScaleRef.current, multiOrigin)
      else {
        settleLiveElementOffset(
          next.filter(el => movingIds.includes(el.id)).map(el => ({
            id: el.id,
            left: el.left,
            top: el.top,
          })),
          canvasScaleRef.current,
        )
      }
      commitLiveList(commitSlideElements(next))
      addHistorySnapshot()
      endGesture()
    }

    const onMove = rafCoalesce(handleMousemove)
    const unbind = bindDocumentDrag({
      onDrag: state => {
        const event = state.event
        if (event instanceof KeyboardEvent) return
        onMove(event as MouseEvent | TouchEvent)
      },
      onDragEnd: state => {
        const event = state.event
        if (event instanceof KeyboardEvent) return
        handleMouseup(event as MouseEvent | TouchEvent)
      },
    })
    stopGesture = () => {
      onMove.cancel()
      unbind()
      document.ontouchmove = null
      document.ontouchend = null
    }
    if (isTouchEvent) {
      document.ontouchmove = onMove
      document.ontouchend = handleMouseup
    }
    else if (e instanceof MouseEvent) {
      document.documentElement.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: false,
        cancelable: true,
        view: window,
        clientX: e.clientX,
        clientY: e.clientY,
        screenX: e.screenX,
        screenY: e.screenY,
        buttons: 1,
        button: 0,
        pointerId: 1,
        pointerType: 'mouse',
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
      }))
    }
  }, [setElementList, setAlignmentLines, addHistorySnapshot])

  return {
    dragElement,
  }
}
