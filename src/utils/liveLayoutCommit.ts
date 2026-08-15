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
