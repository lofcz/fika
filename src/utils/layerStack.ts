import type { PPTElement } from '@/types/slides'
import { elementVisualHitRect, pointInVisualHitRect } from '@/utils/canvasHitTest'

/**
 * One row of the Alt+Click layer picker: an element (or a whole group)
 * whose visual box contains the probed point.
 */
export interface LayerStackEntry {
  /** Representative element — for groups, the topmost member under the point. */
  element: PPTElement
  /** Ids applied to the selection when this entry is picked (empty when locked). */
  memberIds: string[]
  groupId?: string
  groupSize?: number
  locked: boolean
}

/**
 * All layers under a wrapper-space point, top → bottom.
 *
 * Group members collapse into a single entry (picking one selects the whole
 * group, matching canvas click behavior). Hidden elements are skipped; locked
 * elements are listed but marked non-selectable.
 */
export function layerStackAtPoint(
  elementList: PPTElement[],
  canvasScale: number,
  hiddenElementIdList: Iterable<string>,
  x: number,
  y: number,
): LayerStackEntry[] {
  const hidden = hiddenElementIdList instanceof Set ? hiddenElementIdList : new Set(hiddenElementIdList)
  const entries: LayerStackEntry[] = []
  const seenGroups = new Set<string>()
  for (let i = elementList.length - 1; i >= 0; i--) {
    const element = elementList[i]
    if (hidden.has(element.id)) continue
    const rect = elementVisualHitRect(element, canvasScale, i + 1)
    if (!pointInVisualHitRect(x, y, rect)) continue
    if (element.groupId) {
      if (seenGroups.has(element.groupId)) continue
      seenGroups.add(element.groupId)
      const members = elementList.filter(el => el.groupId === element.groupId)
      const selectable = members.filter(el => !el.lock && !hidden.has(el.id))
      entries.push({
        element,
        memberIds: selectable.map(el => el.id),
        groupId: element.groupId,
        groupSize: members.length,
        locked: selectable.length === 0,
      })
      continue
    }
    entries.push({
      element,
      memberIds: element.lock ? [] : [element.id],
      locked: !!element.lock,
    })
  }
  return entries
}

/** Index of the next selectable entry below `fromIndex`, wrapping. -1 when none. */
export function nextSelectableLayer(entries: LayerStackEntry[], fromIndex: number): number {
  if (!entries.length) return -1
  const start = fromIndex < 0 ? -1 : fromIndex
  for (let step = 1; step <= entries.length; step++) {
    const index = (start + step + entries.length) % entries.length
    if (!entries[index].locked) return index
  }
  return -1
}
