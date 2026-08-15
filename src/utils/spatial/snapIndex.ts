import Flatbush from 'flatbush'
import type { SnapBox } from '@/utils/snap'
import { segmentSnapBoxes } from './segment'

/** Hard cap after a wide AABB hit — Flatbush.neighbors() keeps the closest K. */
export const SNAP_NEIGHBOR_K = 32

export type SnapLine = {
  value: number
  min: number
  max: number
  kind: 'edge' | 'center'
}

/** Segmented Flatbush 2D index plus 1D X/Y snap-line trees. Built on pointerdown. */
export type SnapIndex = {
  tree: Flatbush
  boxes: SnapBox[]
  linesX: Flatbush
  linesY: Flatbush
  metaX: SnapLine[]
  metaY: SnapLine[]
}

const emptyTree = (): Flatbush => {
  const tree = new Flatbush(1)
  tree.add(0, 0, 0, 0)
  tree.finish()
  return tree
}

const buildLineTrees = (boxes: SnapBox[]) => {
  const metaX: SnapLine[] = []
  const metaY: SnapLine[] = []
  for (const box of boxes) {
    const cx = (box.minX + box.maxX) / 2
    const cy = (box.minY + box.maxY) / 2
    metaX.push(
      { value: box.minX, min: box.minY, max: box.maxY, kind: 'edge' },
      { value: cx, min: box.minY, max: box.maxY, kind: 'center' },
      { value: box.maxX, min: box.minY, max: box.maxY, kind: 'edge' },
    )
    metaY.push(
      { value: box.minY, min: box.minX, max: box.maxX, kind: 'edge' },
      { value: cy, min: box.minX, max: box.maxX, kind: 'center' },
      { value: box.maxY, min: box.minX, max: box.maxX, kind: 'edge' },
    )
  }
  if (!metaX.length) {
    return { linesX: emptyTree(), linesY: emptyTree(), metaX, metaY }
  }
  const linesX = new Flatbush(metaX.length)
  const linesY = new Flatbush(metaY.length)
  for (const line of metaX) linesX.add(line.value, line.min, line.value, line.max)
  for (const line of metaY) linesY.add(line.min, line.value, line.max, line.value)
  linesX.finish()
  linesY.finish()
  return { linesX, linesY, metaX, metaY }
}

export const buildSnapIndex = (boxes: SnapBox[]): SnapIndex => {
  const segmented = segmentSnapBoxes(boxes)
  if (segmented.length === 0) {
    return { tree: emptyTree(), boxes: [], linesX: emptyTree(), linesY: emptyTree(), metaX: [], metaY: [] }
  }
  const tree = new Flatbush(segmented.length)
  for (const box of segmented) tree.add(box.minX, box.minY, box.maxX, box.maxY)
  tree.finish()
  return { tree, boxes: segmented, ...buildLineTrees(segmented) }
}

export const querySnap = (index: SnapIndex, moving: SnapBox, pad: number): number[] => {
  if (index.boxes.length === 0) return []
  const ids = index.tree.search(
    moving.minX - pad,
    moving.minY - pad,
    moving.maxX + pad,
    moving.maxY + pad,
  )
  if (ids.length <= SNAP_NEIGHBOR_K) return ids
  const cx = (moving.minX + moving.maxX) / 2
  const cy = (moving.minY + moving.maxY) / 2
  const reach = Math.hypot(moving.maxX - moving.minX, moving.maxY - moving.minY) / 2 + pad
  return index.tree.neighbors(cx, cy, SNAP_NEIGHBOR_K, reach)
}

export const boxesNear = (index: SnapIndex, moving: SnapBox, pad: number): SnapBox[] => {
  const ids = querySnap(index, moving, pad)
  const nearby: SnapBox[] = []
  for (const id of ids) {
    const box = index.boxes[id]
    if (box) nearby.push(box)
  }
  return nearby
}

export const queryLinesX = (
  index: SnapIndex,
  value: number,
  threshold: number,
  rangeMin: number,
  rangeMax: number,
): SnapLine[] => {
  if (!index.metaX.length) return []
  const ids = index.linesX.search(value - threshold, rangeMin, value + threshold, rangeMax)
  const out: SnapLine[] = []
  for (const id of ids) {
    const line = index.metaX[id]
    if (line) out.push(line)
  }
  return out
}

export const queryLinesY = (
  index: SnapIndex,
  value: number,
  threshold: number,
  rangeMin: number,
  rangeMax: number,
): SnapLine[] => {
  if (!index.metaY.length) return []
  const ids = index.linesY.search(rangeMin, value - threshold, rangeMax, value + threshold)
  const out: SnapLine[] = []
  for (const id of ids) {
    const line = index.metaY[id]
    if (line) out.push(line)
  }
  return out
}
