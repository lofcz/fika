import { selectCurrentSlide, useSlidesStore } from '@/store'

export type ElementGeometryPatch = {
  height?: number
  width?: number
}

let pendingSlideId: string | null = null
const pendingPatches = new Map<string, ElementGeometryPatch>()
let flushRaf = 0

function applyPatchesToStore(slideId: string, patches: Map<string, ElementGeometryPatch>) {
  if (!patches.size) return
  const state = useSlidesStore.getState()
  state.updateSlideElementGeometry(slideId, patches)
}

function flushPendingSizeUpdates() {
  if (flushRaf && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(flushRaf)
  }
  flushRaf = 0
  if (!pendingPatches.size || !pendingSlideId) {
    pendingPatches.clear()
    pendingSlideId = null
    return
  }
  const slideId = pendingSlideId
  const patches = new Map(pendingPatches)
  pendingPatches.clear()
  pendingSlideId = null
  applyPatchesToStore(slideId, patches)
}

/**
 * Coalesce ResizeObserver / content-fit element size write-backs from multiple
 * elements on the current slide into a single geometry-only store update per
 * frame (preserving `skeleton` / `aiRequestId` on streamed AI slides).
 */
export function scheduleElementSizeSync(elementId: string, patch: ElementGeometryPatch) {
  const currentSlideId = selectCurrentSlide(useSlidesStore.getState())?.id ?? null
  if (!currentSlideId) return
  if (pendingSlideId && pendingSlideId !== currentSlideId) {
    flushPendingSizeUpdates()
  }
  pendingSlideId = currentSlideId
  const existing = pendingPatches.get(elementId)
  pendingPatches.set(elementId, existing ? { ...existing, ...patch } : patch)
  if (!flushRaf) {
    if (typeof requestAnimationFrame === 'function') {
      flushRaf = requestAnimationFrame(flushPendingSizeUpdates)
    }
    else {
      flushPendingSizeUpdates()
    }
  }
}

/**
 * Flush any queued size update for `elementId` (or all queued elements)
 * synchronously — used on unmount so same-frame slide switches never drop
 * measured heights.
 */
export function flushElementSizeSync(elementId?: string) {
  if (!pendingPatches.size || !pendingSlideId) return
  if (elementId === undefined) {
    flushPendingSizeUpdates()
    return
  }
  const patch = pendingPatches.get(elementId)
  if (!patch) return
  pendingPatches.delete(elementId)
  const slideId = pendingSlideId
  if (!pendingPatches.size) {
    if (flushRaf && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(flushRaf)
    }
    flushRaf = 0
    pendingSlideId = null
  }
  applyPatchesToStore(slideId, new Map([[elementId, patch]]))
}

export function cancelElementSizeSync(elementId: string) {
  pendingPatches.delete(elementId)
}
