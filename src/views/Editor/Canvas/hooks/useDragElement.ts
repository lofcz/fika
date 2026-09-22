import { frameDomClip } from '@/utils/frameDomClip'
import { queryFika } from '@/utils/portal'
import { frameDescendantIds } from '@/utils/nestedFrames'
import type { MynaViewPreferences } from '@/views/Myna/viewStore'
import { snapToPageGuides, validPageGuides } from '@/utils/pageGuides'
import { useRef, useCallback } from 'react'
import { useMainStore, useSlidesStore, useKeyboardStore, syncPointerModifiers, selectCurrentSlide } from '@/store'
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
import { resolvePagePositions } from '@/views/Myna/pageLayout'
import { clientToCanvas } from '@/utils/canvasPointer'

export default (
  elementList: PPTElement[],
  setElementList: (value: PPTElement[]) => void,
  _alignmentLines: AlignmentLineProps[],
  setAlignmentLines: (value: AlignmentLineProps[]) => void,
  canvasScale: number,
  mynaView?: MynaViewPreferences,
) => {
  const mynaViewRef = useRef(mynaView)
  mynaViewRef.current = mynaView
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

    const activeElementIdList = frameDescendantIds(elementListRef.current, useMainStore.getState().activeElementIdList)
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
    const sourcePageId = selectCurrentSlide(useSlidesStore.getState())?.id
    const clip = viewport?.parentElement
    const oldOverflow = clip?.style.overflow || ''
    const dragRoots = mynaViewRef.current ? originActiveElementList
      .filter(el => !el.parentFrameId || !activeIds.has(el.parentFrameId))
      .flatMap(el => { const node = document.getElementById(`editable-element-${el.id}`); return node ? [node] : [] }) : []
    for (const node of dragRoots) node.setAttribute('data-myna-drag-root', '')
    if (mynaViewRef.current && clip) clip.style.overflow = 'visible'
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
      if (clip) clip.style.overflow = oldOverflow
      for (const node of dragRoots) node.removeAttribute('data-myna-drag-root')
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
        if (item.parentFrameId) item.parentFrameId = elIdMap[item.parentFrameId]
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
          const range = getElementRange({ ...element, left: targetLeft, top: targetTop })
          targetMinX = range.minX
          targetMaxX = range.maxX
          targetMinY = range.minY
          targetMaxY = range.maxY
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
            const range = getElementRange({ ...element, left, top })
            leftValues.push(range.minX)
            topValues.push(range.minY)
            rightValues.push(range.maxX)
            bottomValues.push(range.maxY)
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
      
      const eventCtrl = 'ctrlKey' in e && !!(e.ctrlKey || e.metaKey)
      if ('altKey' in e) syncPointerModifiers(e)
      const altGrid = 'altKey' in e && e.altKey
      const ctrlHeld = eventCtrl || useKeyboardStore.getState().ctrlKeyState
      const view = mynaViewRef.current
      let snapped = snapMovingBox(
        { minX: targetMinX, maxX: targetMaxX, minY: targetMinY, maxY: targetMaxY },
        others,
        {
          mode: altGrid ? 'grid' : 'smart',
          canvas: { width: edgeWidth, height: edgeHeight },
          gridSize: resolveGridSize(view ? (altGrid ? view.gridSize : 0) : gridLineSizeRef.current, altGrid),
          index: snapIndex,
          ctrlMeasures: ctrlHeld,
        },
      )
      if (!altGrid && view?.showGuides && view.snapToGuides) {
        snapped = snapToPageGuides(
          { minX: targetMinX, maxX: targetMaxX, minY: targetMinY, maxY: targetMaxY },
          validPageGuides(selectCurrentSlide(useSlidesStore.getState())?.guides), canvasScaleRef.current, snapped,
        )
      }
      const { offsetX, offsetY, guides } = snapped
      targetLeft += offsetX
      targetTop += offsetY
      if (!sameSnapGuides(lastGuides, guides)) {
        lastGuides = guides
        setAlignmentLines(guides)
      }
      setLiveElementOffset(liveOrigins, targetLeft - elOriginLeft, targetTop - elOriginTop, canvasScaleRef.current, multiOrigin)
      if (originElementList.some(el => el.parentFrameId)) {
        const live = originElementList.map(el => movingIds.includes(el.id) ? { ...el, left: el.left + targetLeft - elOriginLeft, top: el.top + targetTop - elOriginTop, ...(mynaViewRef.current && el.parentFrameId && !movingIds.includes(el.parentFrameId) ? { parentFrameId: undefined } : {}) } : el)
        for (const el of live) if (el.parentFrameId) {
          const node = queryFika<HTMLElement>(`#editable-element-${CSS.escape(el.id)}`)
          if (node) node.style.clipPath = String(frameDomClip(el, live)?.clipPath || '')
        }
      }
      lastLeft = targetLeft
      lastTop = targetTop
    }

    const handleMouseup = (e: MouseEvent | TouchEvent) => {
      if (!isMouseDown) return
      // Include the release position even when the last RAF-coalesced move has
      // not run yet; otherwise fast cross-page drops use stale geometry.
      handleMousemove(e)
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
      if (mynaViewRef.current && viewport && sourcePageId) {
        const store = useSlidesStore.getState()
        const positions = resolvePagePositions(store.slides, store.viewportSize, store.viewportSize * store.viewportRatio)
        const from = positions.get(sourcePageId)!
        const local = clientToCanvas(e, viewport, canvasScaleRef.current)
        const x = local.x + from.x, y = local.y + from.y
        const target = [...store.slides].reverse().find(page => {
          const point = positions.get(page.id)!
          return x >= point.x && y >= point.y && x <= point.x + store.viewportSize && y <= point.y + store.viewportSize * store.viewportRatio
        })
        if (target && target.id !== sourcePageId) {
          const transferIds = duplicateTriggered ? next.filter(el => !originElementList.some(old => old.id === el.id)).map(el => el.id) : movingIds
          store.transferPageElements(sourcePageId, target.id, transferIds)
          commitLiveList(selectCurrentSlide(useSlidesStore.getState()).elements)
        }
        else if (!target && !duplicateTriggered) {
          // A pasteboard drop escapes the old clipping frame while retaining
          // the source page as its serialization/export owner.
          const source = store.slides.find(page => page.id === sourcePageId)!
          if (source.elements.some(el => movingIds.includes(el.id) && el.parentFrameId && !movingIds.includes(el.parentFrameId))) {
            store.updateSlide({ elements: source.elements.map(el => movingIds.includes(el.id) && el.parentFrameId && !movingIds.includes(el.parentFrameId) ? { ...el, parentFrameId: undefined } : el) }, sourcePageId)
            commitLiveList(selectCurrentSlide(useSlidesStore.getState()).elements)
          }
        }
      }
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
