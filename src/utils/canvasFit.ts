import { clampCanvasZoom } from './canvasZoom'
export const FIT_CANVAS_BOUNDS_EVENT = 'fika:fit-canvas-bounds'
export type CanvasFitRequest = {
  minX: number; maxX: number; minY: number; maxY: number
  leftInset?: number; rightInset?: number; topInset?: number; bottomInset?: number
}
/** Fit document-space bounds into the visible editor area, including rotated bounds. */
export function calculateCanvasFit(bounds: CanvasFitRequest, width: number, height: number) {
  const { minX, maxX, minY, maxY } = bounds
  if (![minX, maxX, minY, maxY, width, height].every(Number.isFinite) || maxX < minX || maxY < minY || width <= 0 || height <= 0) return null
  const leftInset = Math.max(0, bounds.leftInset || 0)
  const topInset = Math.max(0, bounds.topInset || 0)
  const availableWidth = width - leftInset - Math.max(0, bounds.rightInset || 0)
  const availableHeight = height - topInset - Math.max(0, bounds.bottomInset || 0)
  if (availableWidth < 64 || availableHeight < 64) return null
  const padding = 32
  const scale = clampCanvasZoom(Math.min((availableWidth - padding * 2) / Math.max(1, maxX - minX), (availableHeight - padding * 2) / Math.max(1, maxY - minY)) * 100) / 100
  return {
    scale,
    left: leftInset + availableWidth / 2 - (minX + maxX) / 2 * scale,
    top: topInset + availableHeight / 2 - (minY + maxY) / 2 * scale,
  }
}
