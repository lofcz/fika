import { bindStyles } from '@/utils/cssm'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { memo, useEffect, useLayoutEffect, useRef } from 'react'

import type { Slide } from '@/types/slides'
import { attachStage, detachStage, hasRasterSnapshot, paintDetachedSlide, releaseDetachedSlide } from '@/previewRaster'
import { getPreviewDestSize, usePreviewDestSize } from '@/views/Editor/Thumbnails/paneSize'
import { useSlidesStore } from '@/store'
import { arePaintedSlideIdentitiesEqual, selectPaintedSlide, selectPaintedSlideAuthoredKey, selectPaintedSlidePaintKey } from './paintedSlide'

export type IThumbnailSlideProps = {
  slide: Slide | { id: string }
  size: number
  visible?: boolean
  showPlaceholders?: boolean
  className?: string
}

export function areThumbnailSlidePropsEqual(prev: IThumbnailSlideProps, next: IThumbnailSlideProps): boolean {
  return prev.size === next.size
    && (prev.visible ?? true) === (next.visible ?? true)
    && (prev.showPlaceholders ?? false) === (next.showPlaceholders ?? false)
    && prev.className === next.className
    && prev.slide.id === next.slide.id
    && arePaintedSlideIdentitiesEqual(
      'elements' in prev.slide ? prev.slide : undefined,
      'elements' in next.slide ? next.slide : undefined,
    )
}

const ThumbnailSlide = memo((props: IThumbnailSlideProps) => {
  const { slide, size, visible = true, className } = props
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewportRatio = useSlidesStore(s => s.viewportRatio)
  const authoredKey = useSlidesStore(s => selectPaintedSlideAuthoredKey(s, slide.id))
  const paintKey = useSlidesStore(s => selectPaintedSlidePaintKey(s, slide.id))
  const storeSlide = useSlidesStore(s => selectPaintedSlide(s, slide.id))
  const dest = usePreviewDestSize()
  const width = size || dest.cssWidth
  const height = width * viewportRatio
  const full = storeSlide ?? ('elements' in slide ? slide : undefined)

  useLayoutEffect(() => {
    if (!visible) {
      detachStage(slide.id)
      return
    }
    attachStage(slide.id, hostRef.current)
    return () => {
      detachStage(slide.id)
      if (!useSlidesStore.getState().slides.some(item => item.id === slide.id)) {
        releaseDetachedSlide(slide.id)
      }
    }
  }, [slide.id, visible])

  useEffect(() => {
    if (!visible || !full) return
    const size = getPreviewDestSize()
    const destWidth = props.size || size.cssWidth
    paintDetachedSlide(full, {
      destWidth,
      destHeight: destWidth * useSlidesStore.getState().viewportRatio,
      pixelRatio: size.dpr,
    })
  }, [slide.id, visible, full, authoredKey, paintKey])

  return (
    <div
      ref={hostRef}
      className={cx('thumbnail-slide', className)}
      data-thumbnail-slide={slide.id}
      data-authored-key={authoredKey.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}
      data-raster-pending={hasRasterSnapshot(slide.id) ? undefined : ''}
      style={{ width: width + 'px', height: height + 'px' }}
    />
  )
}, areThumbnailSlidePropsEqual)

ThumbnailSlide.displayName = 'ThumbnailSlide'

export default ThumbnailSlide
