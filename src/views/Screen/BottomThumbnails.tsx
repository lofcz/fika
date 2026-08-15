import { bindStyles } from '@/utils/cssm'
import styles from './BottomThumbnails.module.scss'
const cx = bindStyles(styles)
import { useEffect, useRef } from 'react'
import { useSlidesStore } from '@/store'
import useExecPlay from './hooks/useExecPlay'
import ThumbnailSlide from '@/views/components/ThumbnailSlide/index'
import { isInScreenWindow, SCREEN_THUMB_RADIUS } from './screenWindow'

export default function BottomThumbnails() {
  const slides = useSlidesStore(s => s.slides)
  const slideIndex = useSlidesStore(s => s.slideIndex)
  const viewportRatio = useSlidesStore(s => s.viewportRatio)
  const thumbnailsRef = useRef<HTMLDivElement | null>(null)
  const { turnSlideToIndex } = useExecPlay()

  const handleMousewheelThumbnails = (e: React.WheelEvent) => {
    e.preventDefault()
    if (!thumbnailsRef.current) return
    thumbnailsRef.current.scrollBy(e.deltaY, 0)
  }

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (!thumbnailsRef.current) return
      const activeThumbnailRef = thumbnailsRef.current.querySelector<HTMLElement>('.thumbnail.active')
      if (!activeThumbnailRef) return
      const width = thumbnailsRef.current.offsetWidth
      const offsetLeft = activeThumbnailRef.offsetLeft + activeThumbnailRef.clientWidth / 2
      thumbnailsRef.current.scrollTo({ left: offsetLeft - width / 2, behavior: 'smooth' })
    })
    return () => cancelAnimationFrame(frame)
  }, [slideIndex])

  return (
    <div className={cx('bottom-thumbnails')}>
      <div
        className={cx('thumbnails')}
        ref={thumbnailsRef}
        onWheel={handleMousewheelThumbnails}
      >
        {slides.map((slide, index) => (
          <div
            className={cx('thumbnail', { active: index === slideIndex })}
            key={slide.id}
            onClick={() => turnSlideToIndex(index)}
          >
            <ThumbnailSlide slide={{ id: slide.id }} size={100 / viewportRatio} visible={isInScreenWindow(index, slideIndex, SCREEN_THUMB_RADIUS)} />
          </div>
        ))}
      </div>
    </div>
  )
}
