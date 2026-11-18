import type { PPTElement, PPTLineElement, PPTShapeElement, PPTTableElement } from '@/types/slides'

/**
 * Store owns authored fields (content, styles, placeholder chrome).
 * The canvas list is a layout fork for gestures. Commits copy layout onto the
 * store element — they never write the fork's stale `content` back.
 */
const withLiveLayout = (store: PPTElement, live: PPTElement): PPTElement => {
  if (store.id !== live.id || store.type !== live.type) return store
  if (
    store.left === live.left
    && store.top === live.top
    && (!('width' in store) || !('width' in live) || store.width === live.width)
    && (!('height' in store) || !('height' in live) || store.height === live.height)
    && (!('rotate' in store) || !('rotate' in live) || store.rotate === live.rotate)
  ) {
    if (store.type === 'shape' && live.type === 'shape') {
      if (store.path === live.path && store.viewBox === live.viewBox && store.keypoints === live.keypoints) return store
    }
    else if (store.type === 'line' && live.type === 'line') {
      if (
        store.start === live.start
        && store.end === live.end
        && store.broken === live.broken
        && store.broken2 === live.broken2
        && store.curve === live.curve
        && store.cubic === live.cubic
      ) return store
    }
    else if (store.type === 'table' && live.type === 'table') {
      if (store.cellMinHeight === live.cellMinHeight) return store
    }
    else return store
  }

  if (store.type === 'shape' && live.type === 'shape') {
    const next: PPTShapeElement = {
      ...store,
      left: live.left,
      top: live.top,
      width: live.width,
      height: live.height,
      rotate: live.rotate,
      viewBox: live.viewBox,
      path: live.path,
      keypoints: live.keypoints,
    }
    return next
  }
  if (store.type === 'line' && live.type === 'line') {
    const next: PPTLineElement = {
      ...store,
      left: live.left,
      top: live.top,
      start: live.start,
      end: live.end,
      broken: live.broken,
      broken2: live.broken2,
      broken2Direction: live.broken2Direction,
      curve: live.curve,
      cubic: live.cubic,
    }
    return next
  }
  if (store.type === 'table' && live.type === 'table') {
    const next: PPTTableElement = {
      ...store,
      left: live.left,
      top: live.top,
      width: live.width,
      height: live.height,
      rotate: live.rotate,
      cellMinHeight: live.cellMinHeight,
    }
    return next
  }
  return {
    ...store,
    left: live.left,
    top: live.top,
    ...('width' in live ? { width: live.width } : {}),
    ...('height' in live ? { height: live.height } : {}),
    ...('rotate' in live ? { rotate: live.rotate } : {}),
  } as PPTElement
}

/**
 * Merge a gesture's live list onto the slide it started on.
 *
 * `base` is that slide's elements at gesture start, `store` its elements now,
 * `foreignIds` the ids that live only on OTHER slides. A host can change the
 * current slide or the slide's content while the pointer is still down (the AI
 * bridge edits and then follows its edit), so the live list may be stale:
 * - elements of another slide never travel (the whole-slide copy bug);
 * - only layout the gesture itself changed is applied, so concurrent edits to
 *   untouched elements survive;
 * - elements added meanwhile are kept, elements deleted meanwhile stay gone;
 * - elements the gesture created (copy-drag) are appended.
 */
/** Value of the fields a gesture may change (the canvas list is a clone, so compare values). */
const layoutKey = (el: PPTElement): string => {
  const box = [el.left, el.top, 'width' in el ? el.width : null, 'height' in el ? el.height : null, 'rotate' in el ? el.rotate : null]
  if (el.type === 'shape') return JSON.stringify([box, el.path, el.viewBox, el.keypoints ?? null])
  if (el.type === 'line') return JSON.stringify([box, el.start, el.end, el.broken ?? null, el.broken2 ?? null, el.broken2Direction ?? null, el.curve ?? null, el.cubic ?? null])
  if (el.type === 'table') return JSON.stringify([box, el.cellMinHeight ?? null])
  return JSON.stringify(box)
}

export const mergeGestureLayout = (
  liveList: PPTElement[],
  base: PPTElement[],
  store: PPTElement[],
  foreignIds: ReadonlySet<string>,
): PPTElement[] => {
  const storeIds = new Set(store.map(el => el.id))
  const live = liveList.filter(el => storeIds.has(el.id) || !foreignIds.has(el.id))
  // Nothing of this slide in the list: it is another slide's fork.
  if (store.length && !live.some(el => storeIds.has(el.id))) return store
  if (store === base) return applyLiveLayoutOntoStore(live, store)
  const baseById = new Map(base.map(el => [el.id, el]))
  const liveById = new Map(live.map(el => [el.id, el]))
  const next = store.map(el => {
    const liveEl = liveById.get(el.id)
    const baseEl = baseById.get(el.id)
    if (!liveEl || !baseEl || layoutKey(baseEl) === layoutKey(liveEl)) return el
    return withLiveLayout(el, liveEl)
  })
  const created = live.filter(el => !baseById.has(el.id) && !storeIds.has(el.id))
  return created.length ? [...next, ...created] : next
}

export const applyLiveLayoutOntoStore = (
  liveList: PPTElement[],
  storeList: PPTElement[],
): PPTElement[] => {
  if (storeList.length === 0) return liveList
  const storeById = new Map(storeList.map(el => [el.id, el]))
  return liveList.map(live => {
    const store = storeById.get(live.id)
    return store ? withLiveLayout(store, live) : live
  })
}
