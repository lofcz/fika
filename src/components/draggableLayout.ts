import type { VirtualItem } from '@tanstack/react-virtual'

export type DragTranslate = {
  x: number
  y: number
  scaleX: number
  scaleY: number
}

export type OverlayPaint = {
  slideId: string
  width: number
  height: number
  thumbX: number
  thumbY: number
  thumbW: number
  thumbH: number
}

/** dnd-kit strips CSS transforms when measuring. Virtual Y must be layout (`top`), not translateY. */
export const virtualRowBox = (
  row: Pick<VirtualItem, 'start' | 'size'>,
  drag: Pick<DragTranslate, 'x' | 'y'> | null,
) => ({
  top: row.start,
  height: row.size,
  x: drag?.x ?? 0,
  y: drag?.y ?? 0,
})

export const restrictDragToVertical = ({ transform }: { transform: DragTranslate }) => ({
  ...transform,
  x: 0,
})

export const overlayFromNode = (node: HTMLElement, slideId: string): OverlayPaint => {
  const nodeRect = node.getBoundingClientRect()
  const thumb = node.querySelector<HTMLElement>('[data-thumbnail-slide]')
  const thumbRect = thumb?.getBoundingClientRect() ?? nodeRect
  return {
    slideId,
    width: nodeRect.width,
    height: nodeRect.height,
    thumbX: thumbRect.left - nodeRect.left,
    thumbY: thumbRect.top - nodeRect.top,
    thumbW: thumbRect.width,
    thumbH: thumbRect.height,
  }
}

export const wheelDeltaPx = (delta: number, deltaMode: number, pageSize: number, lineSize = 16) => {
  if (deltaMode === 1) return delta * lineSize
  if (deltaMode === 2) return delta * pageSize
  return delta
}

export const clampScrollTop = (scrollTop: number, delta: number, max: number) => (
  Math.max(0, Math.min(max, scrollTop + delta))
)

export const mergeActiveVirtualRow = <T extends Pick<VirtualItem, 'index'>>(
  rows: readonly T[],
  activeIndex: number,
  measured: T | undefined,
): T[] => {
  if (activeIndex < 0 || rows.some(row => row.index === activeIndex)) return [...rows]
  if (!measured) return [...rows]
  return [...rows, measured]
}
