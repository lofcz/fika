import { selectSlideId, useMainStore, useScreenStore, useSlidesStore } from '@/store'
import type { Slide } from '@/types/slides'
import { getPreviewDestSize, setPreviewDestLiveHandler, setPreviewDestPublishHandler, type PreviewWorkingQuality } from '@/views/Editor/Thumbnails/paneSize'
import type { PaintedSlideDiff } from './diffPaintedSlide'
import { enqueueRaster, RASTER_PRIORITY_CURRENT, RASTER_PRIORITY_LQ_CURRENT, RASTER_PRIORITY_LQ_VISIBLE, RASTER_PRIORITY_VISIBLE, yieldIfNeeded } from './scheduler'
import { dropRasterSnapshot, getRasterSnapshot, rasterSnapshotIds, snapshotCoversDest } from './rasterCache'
import { pickLqElements } from './lqElements'
import {
  collectSlidePreviewSrcs,
  getCachedPreviewImageBitmap,
  loadPreviewImageBitmap,
  prefetchPreviewImageBitmaps,
  previewPaintHasMedia,
  subscribePreviewBitmaps,
} from '@/utils/imageBitmapCache'
import { bitmapSrcKeys } from '@/utils/mediaIntern'
import { planSlideRaster, qualityCovers } from './planSlideRaster'
import { setFontWaitSlideId, takePendingFontSlides } from './painters/booth'
import { rasterPaintContextOf } from './painters/contrast'
import {
  markCurrentHq,
  markRasterSession,
  markFirstBlit,
  markViewportReady,
  rasterStats,
  readRasterStats,
  recordSlidePaint,
  resetRasterStats,
  timePhase,
} from './stats'
import {
  dropSlide,
  getStageEntry,
  invalidateBackground,
  invalidateElement,
  moveElement,
  prepareScratch,
  readScratchPool,
  releaseStage,
  removeElement,
  scalePreviewDisplays,
  setDestSize,
  setPinnedSlideIds,
  applyElementStack,
  snapshotStage,
} from './stagePool'

type DestOverride = { destWidth: number; destHeight: number; pixelRatio: number; quality?: PreviewWorkingQuality }

let visibleIds = new Set<string>()
const paintedById = new Map<string, Slide>()
const paintedQuality = new Map<string, PreviewWorkingQuality>()
const paintedSrcs = new Map<string, Set<string>>()
const detachedIds = new Set<string>()
const queuedPaint = new Map<string, Slide>()
let started = false
let bitmapsHooked = false

const recordPaintedSrcs = (slide: Slide) => {
  const have = new Set<string>()
  for (const src of collectSlidePreviewSrcs(slide)) {
    if (!getCachedPreviewImageBitmap(src)) continue
    for (const key of bitmapSrcKeys(src)) have.add(key)
  }
  paintedSrcs.set(slide.id, have)
  return have
}

const mediaPainted = (slide: Slide) => (
  previewPaintHasMedia(paintedSrcs.get(slide.id), collectSlidePreviewSrcs(slide))
)

const dest = (override?: DestOverride | null, slideId?: string) => {
  const size = getPreviewDestSize()
  const slides = useSlidesStore.getState()
  const slideWidth = slides.viewportSize
  const quality = override?.quality ?? (slideId && slideId === currentSlideId() ? 'full' : 'rail')
  return {
    destWidth: override?.destWidth ?? size.cssWidth,
    destHeight: override?.destHeight ?? size.cssHeight,
    pixelRatio: override?.pixelRatio ?? size.dpr,
    slideWidth,
    slideHeight: slideWidth * slides.viewportRatio,
    theme: slides.theme.backgroundColor,
    fontColor: slides.theme.fontColor,
    quality,
  }
}

const currentSlideId = () => selectSlideId(useSlidesStore.getState())

const priorityOf = (slideId: string, quality: PreviewWorkingQuality) => {
  const current = slideId === currentSlideId()
  if (quality === 'lq') return current ? RASTER_PRIORITY_LQ_CURRENT : RASTER_PRIORITY_LQ_VISIBLE
  return current ? RASTER_PRIORITY_CURRENT : RASTER_PRIORITY_VISIBLE
}

const jobKeyOf = (slideId: string, quality: PreviewWorkingQuality) => `${slideId}:${quality}`

const prefetchSlideImages = (slide: Slide) => {
  prefetchPreviewImageBitmaps(collectSlidePreviewSrcs(slide))
}

const warmupSlideImages = (slide: Slide) => {
  const srcs = collectSlidePreviewSrcs(slide)
  if (!srcs.length) return
  return timePhase('image', () => Promise.all(srcs.map(src => loadPreviewImageBitmap(src))))
}

const paintContextOf = (slide: Slide) => {
  const size = dest(null, slide.id)
  return rasterPaintContextOf(slide, { backgroundColor: size.theme, fontColor: size.fontColor })
}

const finishPaint = (slide: Slide, override?: DestOverride | null) => {
  snapshotStage(slide.id)
  markFirstBlit()
  paintedById.set(slide.id, slide)
  const size = dest(override, slide.id)
  const have = recordPaintedSrcs(slide)
  const complete = previewPaintHasMedia(have, collectSlidePreviewSrcs(slide))
  if (complete || size.quality === 'lq') paintedQuality.set(slide.id, size.quality)
  else if (!paintedQuality.has(slide.id)) paintedQuality.set(slide.id, 'lq')
  setDestSize(slide.id, size.destWidth, size.destHeight, size.pixelRatio, size.slideWidth, size.slideHeight, size.quality)
}

const stillCurrent = (slide: Slide, key: string) => queuedPaint.get(key) === slide

const enqueueSlideWork = (slide: Slide, quality: PreviewWorkingQuality, run: (slide: Slide) => Promise<void>) => {
  const key = jobKeyOf(slide.id, quality)
  if (queuedPaint.get(key) === slide) return
  queuedPaint.set(key, slide)
  enqueueRaster(async () => {
    try {
      if (!stillCurrent(slide, key)) return
      await run(slide)
    }
    finally {
      releaseStage(slide.id)
      if (stillCurrent(slide, key)) queuedPaint.delete(key)
    }
  }, priorityOf(slide.id, quality), key)
}

const noteViewportReady = () => {
  if (![...visibleIds, currentSlideId()].filter(Boolean).every(id => paintedQuality.has(id!))) return
  markViewportReady()
}

const paintSlide = (slide: Slide, override?: DestOverride | null) => {
  const quality = dest(override, slide.id).quality
  const key = jobKeyOf(slide.id, quality)
  enqueueSlideWork(slide, quality, async current => {
    setFontWaitSlideId(current.id)
    try {
      rasterStats.fullPaints += 1
      const started = performance.now()
      const { destWidth, destHeight, pixelRatio, slideWidth, slideHeight, theme } = dest(override, current.id)
      if (quality === 'lq') rasterStats.lqPaints += 1
      else rasterStats.hqPaints += 1
      await timePhase('slide', async () => {
        if (quality !== 'lq') await warmupSlideImages(current)
        prepareScratch(current.id, destWidth, destHeight, pixelRatio, slideWidth, slideHeight, quality)
        applyElementStack(current.id, current.elements)
        await invalidateBackground(current.id, current.background, theme, destWidth, destHeight, pixelRatio, slideWidth, slideHeight, quality)
        if (!stillCurrent(current, key)) return
        const paintContext = paintContextOf(current)
        const elements = quality === 'lq' ? pickLqElements(current.elements) : current.elements
        for (const element of elements) {
          const work = invalidateElement(current.id, element, destWidth, destHeight, slideWidth, pixelRatio, quality, paintContext)
          if (work) await work
          if (!stillCurrent(current, key)) return
          if (quality !== 'lq') await yieldIfNeeded()
        }
        applyElementStack(current.id, current.elements)
        finishPaint(current, { ...override, quality })
      })
      recordSlidePaint({
        id: current.id,
        quality,
        ms: Math.round(performance.now() - started),
        elements: current.elements.length,
      })
      if (current.id === currentSlideId() && quality !== 'lq') markCurrentHq()
      noteViewportReady()
    }
    finally {
      setFontWaitSlideId('')
    }
  })
}

const patchSlide = (slide: Slide, diff: PaintedSlideDiff, override?: DestOverride | null) => {
  const quality = dest(override, slide.id).quality
  const key = jobKeyOf(slide.id, quality)
  enqueueSlideWork(slide, quality, async current => {
    setFontWaitSlideId(current.id)
    try {
      rasterStats.patchPaints += 1
      const { destWidth, destHeight, pixelRatio, slideWidth, slideHeight, theme } = dest(override, current.id)
      applyElementStack(current.id, current.elements)
      if (diff.backgroundChanged) {
        await invalidateBackground(current.id, current.background, theme, destWidth, destHeight, pixelRatio, slideWidth, slideHeight, quality)
        if (!stillCurrent(current, key)) return
      }
      for (const id of diff.removed) removeElement(current.id, id)
      const byId = new Map(current.elements.map(el => [el.id, el]))
      const paintContext = paintContextOf(current)
      for (const id of [...diff.added, ...diff.contentChanged]) {
        const element = byId.get(id)
        if (!element) continue
        await invalidateElement(current.id, element, destWidth, destHeight, slideWidth, pixelRatio, quality, paintContext)
        if (!stillCurrent(current, key)) return
        await yieldIfNeeded()
      }
      for (const id of diff.movedOnly) {
        const element = byId.get(id)
        if (element) moveElement(current.id, id, element.left, element.top, 1)
      }
      applyElementStack(current.id, current.elements)
      finishPaint(current, override)
      noteViewportReady()
    }
    finally {
      setFontWaitSlideId('')
    }
  })
}

const applySlide = (slide: Slide, override?: DestOverride | null) => {
  prefetchSlideImages(slide)
  const size = dest(override, slide.id)
  const target = size.quality
  const destCovers = snapshotCoversDest(slide.id, size.destWidth, size.destHeight, size.pixelRatio)
  const prev = paintedById.get(slide.id)
  const have = paintedQuality.get(slide.id)
  const hasSnap = !!getRasterSnapshot(slide.id)
  const scratchHasSlide = !!getStageEntry(slide.id)
  const destArgs = { destWidth: size.destWidth, destHeight: size.destHeight, pixelRatio: size.pixelRatio }
  const covering = qualityCovers(have, target) && destCovers
  const keepQuality = covering && have ? have : target

  if (!hasSnap) {
    paintSlide(slide, { ...destArgs, quality: 'lq' })
  }

  if (covering && mediaPainted(slide) && (prev === slide || !prev)) {
    setDestSize(slide.id, size.destWidth, size.destHeight, size.pixelRatio, size.slideWidth, size.slideHeight, keepQuality)
    if (prev !== slide) paintedById.set(slide.id, slide)
    return
  }

  if (covering && prev && prev !== slide && mediaPainted(slide)) {
    const plan = planSlideRaster(prev, slide, { destCovers, scratchHasSlide })
    if (plan.kind === 'skip') {
      setDestSize(slide.id, size.destWidth, size.destHeight, size.pixelRatio, size.slideWidth, size.slideHeight, keepQuality)
      paintedById.set(slide.id, slide)
      return
    }
    if (plan.kind === 'patch') {
      patchSlide(slide, plan.diff, { ...override, quality: keepQuality })
      return
    }
  }

  if (target !== 'lq') {
    paintSlide(slide, { ...destArgs, ...override, quality: target })
  }
}

const forgetSlide = (slideId: string) => {
  dropSlide(slideId, false)
  paintedById.delete(slideId)
  paintedQuality.delete(slideId)
  paintedSrcs.delete(slideId)
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

let paneResizing = false

const ensurePrioritySlides = () => {
  if (isScreening() || paneResizing) return
  const state = useSlidesStore.getState()
  const nextIds = new Set(state.slides.map(slide => slide.id))
  dropMissing(nextIds)
  const byId = new Map(state.slides.map(slide => [slide.id, slide]))
  const currentId = currentSlideId()
  const current = currentId ? byId.get(currentId) : undefined
  if (current) applySlide(current)
  for (const id of visibleIds) {
    if (id === currentId) continue
    const slide = byId.get(id)
    if (slide) applySlide(slide)
  }
}

const scaleVisiblePreviewDisplays = () => {
  paneResizing = true
  const size = getPreviewDestSize()
  scalePreviewDisplays(size.cssWidth, size.cssHeight)
}

export const setVisibleSlideIds = (ids: readonly string[]) => {
  visibleIds = new Set(ids)
  const current = currentSlideId()
  setPinnedSlideIds(current ? [...ids, current] : ids, current)
  if (!started || paneResizing || useMainStore.getState().isGesturing || isScreening()) return
  ensurePrioritySlides()
}

const watchFontLoads = () => {
  if (typeof document === 'undefined' || !document.fonts) return
  let timer = 0
  const kick = () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      const ids = takePendingFontSlides()
      if (!ids.length || useMainStore.getState().isGesturing) return
      const byId = new Map(useSlidesStore.getState().slides.map(slide => [slide.id, slide]))
      for (const id of ids) {
        paintedById.delete(id)
        paintedQuality.delete(id)
        paintedSrcs.delete(id)
        const slide = byId.get(id)
        if (slide) applySlide(slide)
      }
    }, 80)
  }
  document.fonts.addEventListener('loadingdone', kick)
}

export const startPreviewRasterSubscription = () => {
  if (started) return
  started = true
  if (typeof window !== 'undefined' && import.meta.env.MODE === 'development') {
    Object.assign(window, {
      __FIKA_RASTER__: {
        read: () => ({
          ...readRasterStats(),
          qualities: Object.fromEntries(paintedQuality),
          scratches: readScratchPool(),
        }),
        reset: resetRasterStats,
        markSession: markRasterSession,
        coldPaintVisible: () => {
          const current = currentSlideId()
          const ids = new Set([...visibleIds, current].filter(Boolean) as string[])
          for (const id of ids) {
            dropRasterSnapshot(id)
            paintedById.delete(id)
            paintedQuality.delete(id)
            paintedSrcs.delete(id)
          }
          markRasterSession()
          ensurePrioritySlides()
        },
      },
    })
  }
  setPreviewDestLiveHandler(scaleVisiblePreviewDisplays)
  setPreviewDestPublishHandler(resizeVisiblePreviews)
  watchFontLoads()
  if (!bitmapsHooked) {
    bitmapsHooked = true
    subscribePreviewBitmaps(src => {
      if (!started || paneResizing || isScreening() || useMainStore.getState().isGesturing) return
      const state = useSlidesStore.getState()
      const byId = new Map(state.slides.map(slide => [slide.id, slide]))
      const current = currentSlideId()
      for (const id of new Set([...visibleIds, current].filter(Boolean) as string[])) {
        const slide = byId.get(id)
        if (!slide || mediaPainted(slide)) continue
        if (!collectSlidePreviewSrcs(slide).some(item => (
          bitmapSrcKeys(item).includes(src) || bitmapSrcKeys(src).includes(item)
        ))) continue
        applySlide(slide)
      }
    })
  }
  const current = currentSlideId()
  setPinnedSlideIds(current ? [...visibleIds, current] : [...visibleIds], current)
  ensurePrioritySlides()
  useSlidesStore.subscribe((state, prev) => {
    if (useMainStore.getState().isGesturing || isScreening()) return
    if (state.slides !== prev.slides) {
      ensurePrioritySlides()
      return
    }
    if (state.slideIndex !== prev.slideIndex) {
      const current = selectSlideId(state)
      setPinnedSlideIds(current ? [...visibleIds, current] : [...visibleIds], current)
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
  paneResizing = false
  const state = useSlidesStore.getState()
  const byId = new Map(state.slides.map(slide => [slide.id, slide]))
  for (const id of rasterSnapshotIds()) {
    const { destWidth, destHeight, pixelRatio, slideWidth, slideHeight, quality } = dest(null, id)
    setDestSize(id, destWidth, destHeight, pixelRatio, slideWidth, slideHeight, quality)
    if (snapshotCoversDest(id, destWidth, destHeight, pixelRatio)) continue
    const slide = byId.get(id)
    if (slide && (id === currentSlideId() || visibleIds.has(id))) {
      applySlide(slide)
    }
  }
}
