export {
  attachStage,
  detachStage,
  dropSlide,
  compositeCanvas,
  ensureStage,
  setDestSize,
  invalidateElement,
  invalidateBackground,
  moveElement,
  removeElement,
  setZOrder,
  getStageEntry,
  mountPreview,
  snapshotStage,
  setPinnedSlideIds,
  MAX_PREVIEW_STAGES,
} from './stagePool'
export { hasRasterSnapshot, getRasterSnapshot, paintRasterSnapshot, snapshotCoversDest } from './rasterCache'
export {
  startPreviewRasterSubscription,
  setVisibleSlideIds,
  resizeVisiblePreviews,
  paintDetachedSlide,
  releaseDetachedSlide,
} from './subscribeSlides'
export { enqueueRaster } from './scheduler'
export { planSlideRaster, isEmptyPaintedDiff } from './planSlideRaster'
export { diffPaintedSlide } from './diffPaintedSlide'
export { rasterStats, resetRasterStats, readRasterStats } from './stats'
export type { RasterJob } from './scheduler'
export type {
  PreviewPainter,
  PreviewBackgroundPainter,
  PreviewSlideInput,
  PreviewStageEntry,
} from './types'
