import { selectSlideId, useMainStore, useScreenStore, useSlidesStore } from '@/store'
import type { Slide } from '@/types/slides'
import { getPreviewDestSize, setPreviewDestPublishHandler } from '@/views/Editor/Thumbnails/paneSize'
import type { PaintedSlideDiff } from './diffPaintedSlide'
import { enqueueRaster } from './scheduler'
import { dropRasterSnapshot, rasterSnapshotIds, snapshotCoversDest } from './rasterCache'
import { planSlideRaster } from './planSlideRaster'
import { rasterStats, readRasterStats, resetRasterStats } from './stats'
import {
  dropSlide,
  getStageEntry,
  invalidateBackground,
  invalidateElement,
  moveElement,
  prepareScratch,
  removeElement,
  setDestSize,
  setPinnedSlideIds,
  setZOrder,
  snapshotStage,
} from './stagePool'

const PRIORITY_CURRENT = 3
const PRIORITY_VISIBLE = 2

type DestOverride = { destWidth: number; destHeight: number; pixelRatio: number }

let visibleIds = new Set<string>()
const paintedById = new Map<string, Slide>()
const detachedIds = new Set<string>()
const queuedPaint = new Map<string, Slide>()
let started = false

const dest = (override?: DestOverride | null) => {
  const size = getPreviewDestSize()
  const slides = useSlidesStore.getState()
  const slideWidth = slides.viewportSize
  return {
    destWidth: override?.destWidth ?? size.cssWidth,
    destHeight: override?.destHeight ?? size.cssHeight,
    pixelRatio: override?.pixelRatio ?? size.dpr,
    slideWidth,
    slideHeight: slideWidth * slides.viewportRatio,
    theme: slides.theme.backgroundColor,
  }
}

const currentSlideId = () => selectSlideId(useSlidesStore.getState())

const priorityOf = (slideId: string) => (
  slideId === currentSlideId() ? PRIORITY_CURRENT : PRIORITY_VISIBLE
)

const isPriority = (slideId: string) => (
  slideId === currentSlideId() || visibleIds.has(slideId)
)

const finishPaint = (slide: Slide, override?: DestOverride | null) => {
  snapshotStage(slide.id)
  paintedById.set(slide.id, slide)
  const size = dest(override)
  setDestSize(slide.id, size.destWidth, size.destHeight, size.pixelRatio, size.slideWidth, size.slideHeight)
}

const stillCurrent = (slide: Slide) => queuedPaint.get(slide.id) === slide

const enqueueSlideWork = (slide: Slide, run: (slide: Slide) => Promise<void>) => {
  queuedPaint.set(slide.id, slide)
  enqueueRaster(async () => {
    try {
      if (!stillCurrent(slide)) return
      await run(slide)
    }
    finally {
      if (stillCurrent(slide)) queuedPaint.delete(slide.id)
    }
  }, priorityOf(slide.id))
}

const paintSlide = (slide: Slide, override?: DestOverride | null) => {
  enqueueSlideWork(slide, async current => {
    rasterStats.fullPaints += 1
    const { destWidth, destHeight, pixelRatio, slideWidth, slideHeight, theme } = dest(override)
    prepareScratch(current.id, destWidth, destHeight, pixelRatio, slideWidth, slideHeight)
    await invalidateBackground(current.id, current.background, theme, destWidth, destHeight, pixelRatio, slideWidth, slideHeight)
    if (!stillCurrent(current)) return
    for (const element of current.elements) {
      await invalidateElement(current.id, element, destWidth, destHeight, slideWidth, pixelRatio)
      if (!stillCurrent(current)) return
    }
    setZOrder(current.id, current.elements.map(el => el.id))
    finishPaint(current, override)
  })
}

const patchSlide = (slide: Slide, diff: PaintedSlideDiff, override?: DestOverride | null) => {
  enqueueSlideWork(slide, async current => {
    rasterStats.patchPaints += 1
    const { destWidth, destHeight, pixelRatio, slideWidth, slideHeight, theme } = dest(override)
    if (diff.backgroundChanged) {
      await invalidateBackground(current.id, current.background, theme, destWidth, destHeight, pixelRatio, slideWidth, slideHeight)
      if (!stillCurrent(current)) return
    }
    for (const id of diff.removed) removeElement(current.id, id)
    const byId = new Map(current.elements.map(el => [el.id, el]))
    for (const id of [...diff.added, ...diff.contentChanged]) {
      const element = byId.get(id)
      if (!element) continue
      await invalidateElement(current.id, element, destWidth, destHeight, slideWidth, pixelRatio)
      if (!stillCurrent(current)) return
    }
    for (const id of diff.movedOnly) {
      const element = byId.get(id)
      if (element) moveElement(current.id, id, element.left, element.top, 1)
    }
    if (diff.zOrderChanged || diff.added.length || diff.removed.length) {
      setZOrder(current.id, current.elements.map(el => el.id))
    }
    finishPaint(current, override)
  })
}

const applySlide = (slide: Slide, override?: DestOverride | null) => {
  const size = dest(override)
  const destCovers = snapshotCoversDest(slide.id, size.destWidth, size.destHeight, size.pixelRatio)
  const prev = paintedById.get(slide.id)
  const isCurrent = slide.id === currentSlideId()
  const scratchHasSlide = !!getStageEntry(slide.id)
  // Thumbs already have dest snapshots. Do not steal the scratch compositor
  // from the slide the user is editing just to rebuild an unchanged rail item.
  const scratchHoldsCurrent = !!currentSlideId() && !!getStageEntry(currentSlideId()!)
  if (!isCurrent && destCovers && (prev === slide || scratchHoldsCurrent)) {
    setDestSize(slide.id, size.destWidth, size.destHeight, size.pixelRatio, size.slideWidth, size.slideHeight)
    if (prev !== slide) paintedById.set(slide.id, slide)
    return
  }
  const plan = planSlideRaster(prev, slide, {
    destCovers,
    scratchHasSlide,
  })
  if (plan.kind === 'skip') {
    setDestSize(slide.id, size.destWidth, size.destHeight, size.pixelRatio, size.slideWidth, size.slideHeight)
    paintedById.set(slide.id, slide)
    return
  }
  if (plan.kind === 'patch') {
    patchSlide(slide, plan.diff, override)
    return
  }
  paintSlide(slide, override)
}

const forgetSlide = (slideId: string) => {
  dropSlide(slideId, false)
  paintedById.delete(slideId)
}

const dropMissing = (nextIds: Set<string>) => {
  for (const id of [...paintedById.keys()]) {
    if (nextIds.has(id) || detachedIds.has(id)) continue
    forgetSlide(id)
  }
  for (const id of rasterSnapshotIds()) {
    if (nextIds.has(id) || detachedIds.has(id)) continue
    dropRasterSnapshot(id)
  }
}

export const paintDetachedSlide = (
  slide: Slide,
  size?: { destWidth: number; destHeight: number; pixelRatio: number },
) => {
  if (!useSlidesStore.getState().slides.some(item => item.id === slide.id)) {
    detachedIds.add(slide.id)
  }
  applySlide(slide, size ?? null)
}

export const releaseDetachedSlide = (slideId: string) => {
  detachedIds.delete(slideId)
  const inStore = useSlidesStore.getState().slides.some(slide => slide.id === slideId)
  if (inStore) return
  forgetSlide(slideId)
}

const isScreening = () => useScreenStore.getState().screening

const ensurePrioritySlides = () => {
  if (isScreening()) return
  const state = useSlidesStore.getState()
  const nextIds = new Set(state.slides.map(slide => slide.id))
  dropMissing(nextIds)
  for (const slide of state.slides) {
    if (isPriority(slide.id)) applySlide(slide)
  }
}

export const setVisibleSlideIds = (ids: readonly string[]) => {
  visibleIds = new Set(ids)
  const current = currentSlideId()
  setPinnedSlideIds(current ? [...ids, current] : ids)
  if (!started || useMainStore.getState().isGesturing || isScreening()) return
  ensurePrioritySlides()
}

const watchFontLoads = () => {
  if (typeof document === 'undefined' || !document.fonts) return
  let timer = 0
  const kick = () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      paintedById.clear()
      if (!useMainStore.getState().isGesturing) ensurePrioritySlides()
    }, 80)
  }
  document.fonts.addEventListener('loadingdone', kick)
}

export const startPreviewRasterSubscription = () => {
  if (started) return
  started = true
  if (typeof window !== 'undefined' && import.meta.env.MODE === 'development') {
    Object.assign(window, {
      __FIKA_RASTER__: { read: readRasterStats, reset: resetRasterStats },
    })
  }
  setPreviewDestPublishHandler(resizeVisiblePreviews)
  watchFontLoads()
  const current = currentSlideId()
  setPinnedSlideIds(current ? [...visibleIds, current] : [...visibleIds])
  ensurePrioritySlides()
  useSlidesStore.subscribe((state, prev) => {
    if (useMainStore.getState().isGesturing || isScreening()) return
    if (state.slides !== prev.slides) {
      ensurePrioritySlides()
      return
    }
    if (state.slideIndex !== prev.slideIndex) {
      const current = selectSlideId(state)
      setPinnedSlideIds(current ? [...visibleIds, current] : [...visibleIds])
      if (current) {
        const slide = state.slides.find(item => item.id === current)
        if (slide) applySlide(slide)
      }
    }
  })
  useMainStore.subscribe((state, prev) => {
    if (prev.isGesturing && !state.isGesturing) ensurePrioritySlides()
  })
  useScreenStore.subscribe((state, prev) => {
    if (prev.screening && !state.screening) ensurePrioritySlides()
  })
}

export const resizeVisiblePreviews = () => {
  const { destWidth, destHeight, pixelRatio, slideWidth, slideHeight } = dest()
  for (const id of rasterSnapshotIds()) {
    setDestSize(id, destWidth, destHeight, pixelRatio, slideWidth, slideHeight)
    if (!snapshotCoversDest(id, destWidth, destHeight, pixelRatio)) paintedById.delete(id)
  }
  if (started && !useMainStore.getState().isGesturing) ensurePrioritySlides()
}
