import RBush from 'rbush'
import type { SnapBox } from '@/utils/snap'

/** Country-sized chips / map shards. Cards and titles stay individual targets. */
const SMALL_AREA = 60 * 60
const MERGE_PAD = 8
const MIN_SMALL = 16

type Item = SnapBox & { i: number }

export const isSmallSnapBox = (box: SnapBox) => {
  const w = box.maxX - box.minX
  const h = box.maxY - box.minY
  return w * h < SMALL_AREA || (w < 48 && h < 48)
}

const unionGroup = (group: SnapBox[]): SnapBox => {
  let minX = group[0].minX
  let maxX = group[0].maxX
  let minY = group[0].minY
  let maxY = group[0].maxY
  for (let i = 1; i < group.length; i++) {
    const box = group[i]
    if (box.minX < minX) minX = box.minX
    if (box.maxX > maxX) maxX = box.maxX
    if (box.minY < minY) minY = box.minY
    if (box.maxY > maxY) maxY = box.maxY
  }
  return { minX, maxX, minY, maxY }
}

/**
 * Collapse a dense field of tiny adjacent boxes (world-map countries, icon
 * scatter) into cluster AABBs via RBush + union-find. Large objects pass
 * through unchanged. No-op when there aren't enough small boxes to matter.
 */
export const segmentSnapBoxes = (boxes: SnapBox[]): SnapBox[] => {
  if (boxes.length < MIN_SMALL) return boxes
  const smallIdx: number[] = []
  for (let i = 0; i < boxes.length; i++) {
    if (isSmallSnapBox(boxes[i])) smallIdx.push(i)
  }
  if (smallIdx.length < MIN_SMALL) return boxes

  const items: Item[] = smallIdx.map((source, i) => ({ ...boxes[source], i }))
  const tree = new RBush<Item>()
  tree.load(items)

  const parent = items.map((_, i) => i)
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }
  const unite = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }

  for (const item of items) {
    const hits = tree.search({
      minX: item.minX - MERGE_PAD,
      minY: item.minY - MERGE_PAD,
      maxX: item.maxX + MERGE_PAD,
      maxY: item.maxY + MERGE_PAD,
    })
    for (const hit of hits) {
      if (hit.i !== item.i) unite(item.i, hit.i)
    }
  }

  const groups = new Map<number, SnapBox[]>()
  for (const item of items) {
    const root = find(item.i)
    const box: SnapBox = { minX: item.minX, maxX: item.maxX, minY: item.minY, maxY: item.maxY }
    const list = groups.get(root)
    if (list) list.push(box)
    else groups.set(root, [box])
  }

  const clustered: SnapBox[] = []
  for (const group of groups.values()) clustered.push(unionGroup(group))

  const smallSet = new Set(smallIdx)
  const large: SnapBox[] = []
  for (let i = 0; i < boxes.length; i++) {
    if (!smallSet.has(i)) large.push(boxes[i])
  }
  return large.length ? [...large, ...clustered] : clustered
}
