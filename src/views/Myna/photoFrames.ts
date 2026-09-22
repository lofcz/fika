import { nanoid } from 'nanoid'
import type { PPTImageElement, ImageClipDataRange } from '@/types/slides'
export const FRAME_LAYOUTS = ['rect', 'roundRect', 'ellipse', 'two', 'three', 'four', 'six', 'nine', 'hero'] as const
export type FrameLayout = typeof FRAME_LAYOUTS[number]
export const FRAME_PLACEHOLDER = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#e8e8eb"/><path d="M0 320L130 170 220 255 285 195 400 320V400H0Z" fill="#c6c6cc"/><circle cx="280" cy="110" r="36" fill="#b5b5bd"/></svg>')
/** Cell rectangles in fractional grid units. Mixed-span hero keeps a large left cell. */
export function frameCells(layout: FrameLayout): number[][] {
  if (layout === 'hero') return [[0, 0, 2 / 3, 1], [2 / 3, 0, 1 / 3, .5], [2 / 3, .5, 1 / 3, .5]]
  const count = ({ two: 2, three: 3, four: 4, six: 6, nine: 9 } as Record<string, number>)[layout] || 1
  const cols = count === 2 ? 2 : count === 4 ? 2 : count > 1 ? 3 : 1
  const rows = count / cols
  return Array.from({ length: count }, (_, i) => [i % cols / cols, Math.floor(i / cols) / rows, 1 / cols, 1 / rows])
}
export function coverRange(sourceWidth: number, sourceHeight: number, width: number, height: number): ImageClipDataRange {
  if (![sourceWidth, sourceHeight, width, height].every(value => Number.isFinite(value) && value > 0)) return [[0, 0], [100, 100]]
  const ratio = width / height / (sourceWidth / sourceHeight)
  const x = ratio < 1 ? (1 - ratio) * 50 : 0
  const y = ratio > 1 ? (1 - 1 / ratio) * 50 : 0
  return [[x, y], [100 - x, 100 - y]]
}
export function createPhotoFrames(layout: FrameLayout, width: number, height: number, gutter = 12, name = ''): PPTImageElement[] {
  const cells = frameCells(layout)
  const groupId = cells.length > 1 ? nanoid(10) : undefined
  const size = Math.min(width, height) * .7
  const elements: PPTImageElement[] = cells.map((_, index) => ({ id: nanoid(10), type: 'image', src: FRAME_PLACEHOLDER, fixedRatio: false, rotate: 0,
    left: (width - size) / 2, top: (height - size) / 2, width: size, height: size, groupId, name: `${name} ${index + 1}`,
    clip: { shape: cells.length === 1 ? layout : 'rect', range: [[0, 0], [100, 100]] },
    photoFrame: { layout, cell: index, gutter, empty: true },
  }))
  return layoutPhotoFrames(elements, gutter)
}
/** Uses current bounds, so moved/resized native groups keep their current location. */
export function layoutPhotoFrames(elements: PPTImageElement[], gutter: number): PPTImageElement[] {
  if (!elements.length) return []
  const layout = elements[0].photoFrame?.layout as FrameLayout
  if (!FRAME_LAYOUTS.includes(layout)) return elements
  const cells = frameCells(layout)
  const left = Math.min(...elements.map(e => e.left)), top = Math.min(...elements.map(e => e.top))
  const width = Math.max(...elements.map(e => e.left + e.width)) - left
  const height = Math.max(...elements.map(e => e.top + e.height)) - top
  const gap = Math.max(0, Math.min(Number.isFinite(gutter) ? gutter : 0, width / 10, height / 10))
  return elements.map(element => {
    const cell = cells[element.photoFrame?.cell ?? -1]
    if (!cell) return element
    const [x, y, w, h] = cell
    const l = x === 0 ? 0 : gap / 2, t = y === 0 ? 0 : gap / 2
    const r = x + w >= .999 ? 0 : gap / 2, b = y + h >= .999 ? 0 : gap / 2
    const next = { ...element, left: left + x * width + l, top: top + y * height + t, width: w * width - l - r, height: h * height - t - b, photoFrame: { ...element.photoFrame!, gutter: gap } }
    if (next.photoFrame.sourceWidth && next.photoFrame.sourceHeight) next.clip = { shape: element.clip?.shape || 'rect', range: coverRange(next.photoFrame.sourceWidth, next.photoFrame.sourceHeight, next.width, next.height) }
    return next
  })
}
export function fillPhotoFrame(element: PPTImageElement, src: string, sourceWidth: number, sourceHeight: number): PPTImageElement {
  return { ...element, src, clip: { shape: element.clip?.shape || 'rect', range: coverRange(sourceWidth, sourceHeight, element.width, element.height) }, photoFrame: { ...element.photoFrame!, empty: false, sourceWidth, sourceHeight } }
}
