import { recordRender } from '@/utils/renderMetrics'
import { bindStyles } from '@/utils/cssm'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { memo, useMemo } from 'react'

import type { Slide } from '@/types/slides'
import { useSlidesStore } from '@/store'
import { usePreviewDestSize } from '@/views/Editor/Thumbnails/paneSize'
import SlideSkeleton from '@/views/components/SlideSkeleton'
import CanvasSlideThumb from './CanvasSlideThumb'
import { arePaintedSlideIdentitiesEqual, selectPaintedSlide } from './paintedSlide'

export type IThumbnailSlideProps = {
  slide: Slide | { id: string }
  size: number
  visible?: boolean
  showPlaceholders?: boolean
  className?: string
  /** @deprecated Canvas thumbnails no longer use snapshot capture. */
  snapshot?: boolean
}

export function areThumbnailSlidePropsEqual(prev: IThumbnailSlideProps, next: IThumbnailSlideProps): boolean {
  return prev.size === next.size
    && (prev.visible ?? true) === (next.visible ?? true)
    && (prev.showPlaceholders ?? false) === (next.showPlaceholders ?? false)
    && prev.className === next.className
    && (prev.snapshot ?? false) === (next.snapshot ?? false)
    && prev.slide.id === next.slide.id
    && arePaintedSlideIdentitiesEqual(
      'elements' in prev.slide ? prev.slide : undefined,
      'elements' in next.slide ? next.slide : undefined,
    )
}

const ThumbnailSlideFrame = memo(({
  slide,
  slideId,
  width,
  visible,
  showPlaceholders,
  className,
}: {
  slide: Slide | undefined
  slideId: string
  width: number
  visible: boolean
  showPlaceholders: boolean
  className?: string
}) => {
  const viewportRatio = useSlidesStore(s => s.viewportRatio)
  const resolvedId = slide?.id ?? slideId
  return (
    <div
      className={cx('thumbnail-slide', className)}
      data-thumbnail-slide={resolvedId}
      style={{ width: width + 'px', height: width * viewportRatio + 'px' }}
    >
      {visible && slide ? <CanvasSlideThumb slide={slide} width={width} showPlaceholders={showPlaceholders} /> : null}
      {visible && slide?.skeleton ? <SlideSkeleton /> : null}
    </div>
  )
})

const ThumbnailSlideById = memo(({
  slideId,
  size,
  visible,
  showPlaceholders,
  className,
}: {
  slideId: string
  size: number
  visible: boolean
  showPlaceholders: boolean
  className?: string
}) => {
  const selectSlide = useMemo(() => {
    let painted: Slide | undefined
    return (state: { slides: Slide[] }) => {
      const next = selectPaintedSlide(state, slideId)
      if (!arePaintedSlideIdentitiesEqual(painted, next)) painted = next
      return painted
    }
  }, [slideId])
  const storeSlide = useSlidesStore(selectSlide)
  const dest = usePreviewDestSize()
  const width = size || dest.cssWidth
  return (
    <ThumbnailSlideFrame
      slide={storeSlide}
      slideId={slideId}
      width={width}
      visible={visible}
      showPlaceholders={showPlaceholders}
      className={className}
    />
  )
})

const ThumbnailSlideDynamicSize = memo(({
  slide,
  visible,
  showPlaceholders,
  className,
}: {
  slide: Slide
  visible: boolean
  showPlaceholders: boolean
  className?: string
}) => {
  const dest = usePreviewDestSize()
  return (
    <ThumbnailSlideFrame
      slide={slide}
      slideId={slide.id}
      width={dest.cssWidth}
      visible={visible}
      showPlaceholders={showPlaceholders}
      className={className}
    />
  )
})

/** Model-driven slide thumbnail painted directly at the final device DPR. */
const ThumbnailSlide = memo((props: IThumbnailSlideProps) => {
  recordRender('ThumbnailSlide')
  const { slide, size, visible = true, showPlaceholders = false, className } = props
  if (!('elements' in slide)) {
    return (
      <ThumbnailSlideById
        slideId={slide.id}
        size={size}
        visible={visible}
        showPlaceholders={showPlaceholders}
        className={className}
      />
    )
  }
  if (!size) {
    return (
      <ThumbnailSlideDynamicSize
        slide={slide}
        visible={visible}
        showPlaceholders={showPlaceholders}
        className={className}
      />
    )
  }
  return (
    <ThumbnailSlideFrame
      slide={slide}
      slideId={slide.id}
      width={size}
      visible={visible}
      showPlaceholders={showPlaceholders}
      className={className}
    />
  )
}, areThumbnailSlidePropsEqual)

ThumbnailSlide.displayName = 'ThumbnailSlide'

export default ThumbnailSlide
