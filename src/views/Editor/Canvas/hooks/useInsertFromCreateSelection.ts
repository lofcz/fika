import { useMainStore } from '@/store'
import type { CreateElementSelectionData } from '@/types/edit'
import { clientToCanvasPoint, getScaleRoot, getViewportRenderedScale } from '@/utils/canvasPointer'
import useCreateElement from '@/hooks/useCreateElement'

export default (viewportRef: { current: HTMLElement | null }) => {
  const { createTextElement, createShapeElement, createLineElement } = useCreateElement()

  const selectionBoxFromClient = (selectionData: CreateElementSelectionData) => {
    const { start, end } = selectionData
    if (!viewportRef.current) return

    const viewport = viewportRef.current
    const scale = getViewportRenderedScale(viewport, useMainStore.getState().canvasScale)
    const root = getScaleRoot(viewport) ?? viewport
    const rect = root.getBoundingClientRect()

    const [startX, startY] = start
    const [endX, endY] = end
    const minX = Math.min(startX, endX)
    const maxX = Math.max(startX, endX)
    const minY = Math.min(startY, endY)
    const maxY = Math.max(startY, endY)
    const origin = clientToCanvasPoint(minX, minY, rect.left, rect.top, scale)

    return {
      startX,
      startY,
      endX,
      endY,
      minX,
      minY,
      left: origin.x,
      top: origin.y,
      width: (maxX - minX) / scale,
      height: (maxY - minY) / scale,
    }
  }

  const formatCreateSelection = (selectionData: CreateElementSelectionData) => {
    const box = selectionBoxFromClient(selectionData)
    if (!box) return
    return { left: box.left, top: box.top, width: box.width, height: box.height }
  }

  const formatCreateSelectionForLine = (selectionData: CreateElementSelectionData) => {
    const box = selectionBoxFromClient(selectionData)
    if (!box) return

    const { startX, startY, endX, endY, minX, minY, left, top, width, height } = box
    const _start: [number, number] = [
      startX === minX ? 0 : width,
      startY === minY ? 0 : height,
    ]
    const _end: [number, number] = [
      endX === minX ? 0 : width,
      endY === minY ? 0 : height,
    ]

    return {
      left,
      top,
      start: _start,
      end: _end,
    }
  }

  const insertElementFromCreateSelection = (selectionData: CreateElementSelectionData) => {
    const creating = useMainStore.getState().creatingElement
    if (!creating) return

    const type = creating.type
    if (type === 'text') {
      const position = formatCreateSelection(selectionData)
      position && createTextElement(position, { vertical: creating.vertical })
    }
    else if (type === 'shape') {
      const position = formatCreateSelection(selectionData)
      position && createShapeElement(position, creating.data)
    }
    else if (type === 'line') {
      const position = formatCreateSelectionForLine(selectionData)
      position && createLineElement(position, creating.data)
    }
    useMainStore.getState().setCreatingElement(null)
  }

  return {
    formatCreateSelection,
    insertElementFromCreateSelection,
  }
}
