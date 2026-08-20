import { bindStyles } from '@/utils/cssm'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { memo } from 'react'

import type { Slide } from '@/types/slides'
import { useSlidesStore } from '@/store'
import { usePreviewDestSize } from '@/views/Editor/Thumbnails/paneSize'
import CanvasSlideThumb from './CanvasSlideThumb'
import { arePaintedSlideIdentitiesEqual } from './paintedSlide'

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

/** Model-driven slide thumbnail painted directly at the final device DPR. */
const ThumbnailSlide = memo((props: IThumbnailSlideProps) => {
  const { slide, size, visible = true, showPlaceholders = false, className } = props
  const viewportRatio = useSlidesStore(s => s.viewportRatio)
  const storeSlide = useSlidesStore(s => s.slides.find(item => item.id === slide.id))
  const full = storeSlide ?? ('elements' in slide ? slide : undefined)
  const dest = usePreviewDestSize()
  const width = size || dest.cssWidth

  return (
    <div
      className={cx('thumbnail-slide', className)}
      data-thumbnail-slide={slide.id}
      style={{ width: width + 'px', height: width * viewportRatio + 'px' }}
    >
      {visible && full ? <CanvasSlideThumb slide={full} width={width} showPlaceholders={showPlaceholders} /> : null}
    </div>
  )
}, areThumbnailSlidePropsEqual)

ThumbnailSlide.displayName = 'ThumbnailSlide'

export default ThumbnailSlide
