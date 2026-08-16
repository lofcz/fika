import { bindStyles } from '@/utils/cssm'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { memo } from 'react'

import type { Slide } from '@/types/slides'
import { useSlidesStore } from '@/store'
import { usePreviewDestSize } from '@/views/Editor/Thumbnails/paneSize'
import LiveSlideThumb from './LiveSlideThumb'
import { arePaintedSlideIdentitiesEqual } from './paintedSlide'

export type IThumbnailSlideProps = {
  slide: Slide | { id: string }
  size: number
  visible?: boolean
  showPlaceholders?: boolean
  className?: string
  /** Opt into the identity-keyed snapshot cache (editor rail only). */
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

/**
 * The thumbnail IS the slide: the real ScreenSlide DOM scaled into the thumb
 * box (see LiveSlideThumb). The rail stays faithful to the editor canvas by
 * construction and updates live while editing — no raster pipeline, no
 * per-element capture booths, nothing to fall behind.
 */
const ThumbnailSlide = memo((props: IThumbnailSlideProps) => {
  const { slide, size, visible = true, className, snapshot } = props
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
      {visible && full ? <LiveSlideThumb slide={full} width={width} snapshot={snapshot} /> : null}
    </div>
  )
}, areThumbnailSlidePropsEqual)

ThumbnailSlide.displayName = 'ThumbnailSlide'

export default ThumbnailSlide
