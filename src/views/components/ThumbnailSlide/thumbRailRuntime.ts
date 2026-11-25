import { isPaneDragging, subscribeDprChange, subscribePaneLive } from '@/views/Editor/Thumbnails/paneSize'
import { subscribeThumbnailScrollIdle } from '@/paint/rasterResources'
import { subscribeFitScaleChanges, subscribeTextFontChanges } from '@/utils/textFit'
import { subscribeThumbCacheEviction } from './thumbBitmapCache'

/**
 * Shared rail-level runtime for all mounted `CanvasSlideThumb` instances.
 *
 * Replaces per-thumbnail `IntersectionObserver`, `window.resize`,
 * `visualViewport.resize`, and 4 separate global event subscriptions with:
 * - ONE shared `IntersectionObserver` singleton (`rootMargin: '240px'`)
 * - ONE shared subscription hub for DPR, scroll-idle, cache-eviction, fit-scale,
 *   and font-load notifications.
 */

type VisibilityCallback = (visible: boolean) => void

let sharedObserver: IntersectionObserver | null = null
const visibilityCallbacks = new WeakMap<Element, VisibilityCallback>()

const ensureVisibilityObserver = (): IntersectionObserver | null => {
  if (sharedObserver) return sharedObserver
  if (typeof IntersectionObserver === 'undefined') return null
  sharedObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      visibilityCallbacks.get(entry.target)?.(entry.isIntersecting)
    }
  }, { rootMargin: '240px' })
  return sharedObserver
}

export const observeThumbVisibility = (el: Element, onChange: VisibilityCallback): (() => void) => {
  const observer = ensureVisibilityObserver()
  if (!observer) return () => {}
  visibilityCallbacks.set(el, onChange)
  observer.observe(el)
  return () => {
    visibilityCallbacks.delete(el)
    observer.unobserve(el)
  }
}

export type ThumbRuntimeListener = {
  onDprChange: (dpr: number) => void
  onPaneDragEnd: () => void
  onScrollIdle: () => void
  onCacheEviction: (evictedKey: string) => void
  onFitScaleChange: (elementId: string) => void
  onFontChanges: (families?: ReadonlySet<string>) => void
}

const activeThumbs = new Set<ThumbRuntimeListener>()
let hubUnsubscribers: Array<() => void> | null = null
let wasPaneDragging = false

const startHub = () => {
  if (hubUnsubscribers) return
  wasPaneDragging = isPaneDragging()
  hubUnsubscribers = [
    subscribeDprChange(dpr => {
      for (const thumb of activeThumbs) thumb.onDprChange(dpr)
    }),
    subscribePaneLive(() => {
      const dragging = isPaneDragging()
      if (wasPaneDragging && !dragging) {
        wasPaneDragging = false
        for (const thumb of activeThumbs) thumb.onPaneDragEnd()
      }
      else {
        wasPaneDragging = dragging
      }
    }),
    subscribeThumbnailScrollIdle(() => {
      for (const thumb of activeThumbs) thumb.onScrollIdle()
    }),
    subscribeThumbCacheEviction(evictedKey => {
      for (const thumb of activeThumbs) thumb.onCacheEviction(evictedKey)
    }),
    subscribeFitScaleChanges(elementId => {
      for (const thumb of activeThumbs) thumb.onFitScaleChange(elementId)
    }),
    subscribeTextFontChanges(families => {
      for (const thumb of activeThumbs) thumb.onFontChanges(families)
    }),
  ]
}

const stopHubIfEmpty = () => {
  if (activeThumbs.size > 0 || !hubUnsubscribers) return
  const unsubs = hubUnsubscribers
  hubUnsubscribers = null
  for (const unsub of unsubs) unsub()
}

export const registerThumbRuntimeListener = (listener: ThumbRuntimeListener): (() => void) => {
  activeThumbs.add(listener)
  startHub()
  return () => {
    activeThumbs.delete(listener)
    stopHubIfEmpty()
  }
}

export const getThumbRuntimeActiveCount = () => activeThumbs.size
