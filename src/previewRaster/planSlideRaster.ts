import type { Slide } from '@/types/slides'
import { diffPaintedSlide, type PaintedSlideDiff } from './diffPaintedSlide'

export type RasterPlan =
  | { kind: 'skip' }
  | { kind: 'full' }
  | { kind: 'patch'; diff: PaintedSlideDiff }

export const isEmptyPaintedDiff = (diff: PaintedSlideDiff) => (
  !diff.backgroundChanged
  && !diff.zOrderChanged
  && diff.added.length === 0
  && diff.removed.length === 0
  && diff.contentChanged.length === 0
  && diff.movedOnly.length === 0
)

/**
 * Full rebuild only when the scratch compositor does not already hold this
 * slide. A new slide object from updateElement is a patch, not a wipe.
 */
export const planSlideRaster = (
  prev: Slide | undefined,
  next: Slide,
  options: { destCovers: boolean; scratchHasSlide: boolean },
): RasterPlan => {
  if (prev === next && options.destCovers) return { kind: 'skip' }
  if (!options.destCovers || !prev || prev.id !== next.id || !options.scratchHasSlide) {
    return { kind: 'full' }
  }
  const diff = diffPaintedSlide(prev, next)
  if (isEmptyPaintedDiff(diff)) return { kind: 'skip' }
  return { kind: 'patch', diff }
}
