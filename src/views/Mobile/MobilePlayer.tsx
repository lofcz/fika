import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './MobilePlayer.module.scss'
const cx = bindStyles(styles)
import { useEffect, useRef, useState } from 'react'
import { useSlidesStore } from '@/store'
import type { Mode } from '@/types/mobile'
import { turningDurationVars } from '@/configs/transitions'
import { resolveTurningMode, screenWindowRange } from '../Screen/screenWindow'
import ThumbnailSlide from '@/views/components/ThumbnailSlide/index'
import MobileThumbnails from './MobileThumbnails'
import { useI18nContext } from '@/i18n/useI18nContext'

export type IMobilePlayerProps = {
  changeMode: (mode: Mode) => void
}

export default function MobilePlayer({ changeMode }: IMobilePlayerProps) {
  const { LL } = useI18nContext()
  const slides = useSlidesStore(s => s.slides)
  const slideIndex = useSlidesStore(s => s.slideIndex)
  const viewportRatio = useSlidesStore(s => s.viewportRatio)
  const updateSlideIndex = useSlidesStore(s => s.updateSlideIndex)
  const { start, end } = screenWindowRange(slideIndex, slides.length, 1)
  const currentTurningMode = resolveTurningMode(slides[slideIndex]?.id ?? '', slides[slideIndex]?.turningMode)
  const [toolVisible, setToolVisible] = useState(false)
  const [playerSize, setPlayerSize] = useState({ width: 0, height: 0 })
  const touchInfoRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (slideIndex !== 0) updateSlideIndex(0)
    setPlayerSize({
      width: document.body.clientHeight,
      height: document.body.clientWidth,
    })
  }, [])

  const slideSize = (() => {
    const playerRatio = playerSize.height / playerSize.width
    let slideWidth = 0
    let slideHeight = 0
    if (playerRatio >= viewportRatio) {
      slideWidth = playerSize.width
      slideHeight = slideWidth * viewportRatio
    }
    else {
      slideHeight = playerSize.height
      slideWidth = slideHeight / viewportRatio
    }
    return { width: slideWidth, height: slideHeight }
  })()

  const touchStartListener = (e: React.TouchEvent) => {
    touchInfoRef.current = {
      x: e.changedTouches[0].pageX,
      y: e.changedTouches[0].pageY,
    }
  }

  const touchEndListener = (e: React.TouchEvent) => {
    if (!touchInfoRef.current) return
    const offsetX = e.changedTouches[0].pageX - touchInfoRef.current.x
    const offsetY = e.changedTouches[0].pageY - touchInfoRef.current.y
    const offsetAbsX = Math.abs(offsetX)
    const offsetAbsY = Math.abs(offsetY)
    if (offsetAbsX > offsetAbsY && offsetAbsX > 50) {
      if (offsetX < 0 && slideIndex > 0) updateSlideIndex(slideIndex - 1)
      if (offsetX > 0 && slideIndex < slides.length - 1) updateSlideIndex(slideIndex + 1)
    }
    if (offsetAbsY > offsetAbsX && offsetAbsY > 50) {
      if (offsetY > 0 && slideIndex > 0) updateSlideIndex(slideIndex - 1)
      if (offsetY < 0 && slideIndex < slides.length - 1) updateSlideIndex(slideIndex + 1)
    }
  }

  return (
    <div
      className={cx('mobile-player')}
      style={{
        width: playerSize.width + 'px',
        height: playerSize.height + 'px',
        transform: `rotate(90deg) translateY(-${playerSize.height}px)`,
      }}
    >
      <div
        className={cx('screen-slide-list')}
        onClick={() => setToolVisible(!toolVisible)}
        onTouchStart={touchStartListener}
        onTouchEnd={touchEndListener}
      >
        {slides.slice(start, end + 1).map((slide, offset) => {
          const index = start + offset
          const turningMode = resolveTurningMode(slide.id, slide.turningMode)
          return (
            <div
              className={cx('slide-item', `turning-mode-${turningMode}`, {
                current: index === slideIndex,
                before: index < slideIndex,
                after: index > slideIndex,
                hide: (index === slideIndex - 1 || index === slideIndex + 1) && turningMode !== currentTurningMode,
                last: index === slideIndex - 1,
                next: index === slideIndex + 1,
              })}
              style={turningDurationVars(turningMode)}
              key={slide.id}
            >
              <div
                className={cx('slide-content')}
                style={{
                  width: slideSize.width + 'px',
                  height: slideSize.height + 'px',
                }}
              >
                <ThumbnailSlide slide={{ id: slide.id }} size={slideSize.width} />
              </div>
            </div>
          )
        })}
      </div>

      {toolVisible ? (
        <>
          <div className={cx('header')}>
            <div className={cx('back')} onClick={() => changeMode('preview')}>
              <Icon icon="log-out" /> {LL.mobile.player.exitPlayback()}
            </div>
          </div>
          <MobileThumbnails className={cx('thumbnails')} />
        </>
      ) : null}
    </div>
  )
}
