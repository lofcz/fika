import { bindStyles } from '@/utils/cssm'
import styles from './ScreenSlideList.module.scss'
const cx = bindStyles(styles)
import type { MouseEventHandler, TouchEventHandler, WheelEventHandler } from 'react'
import { useSlidesStore } from '@/store'
import { SlideScaleContext } from '@/types/injectKey'
import useSlidesWithTurningMode from './hooks/useSlidesWithTurningMode'
import ScreenSlide from './ScreenSlide'

export type IScreenSlideListProps = {
  slideWidth: number
  slideHeight: number
  animationIndex: number
  turnSlideToId: (id: string) => void
  manualExitFullscreen: () => void
  variant?: 'theater' | 'paper'
  onWheel?: WheelEventHandler<HTMLDivElement>
  onTouchStart?: TouchEventHandler<HTMLDivElement>
  onTouchEnd?: TouchEventHandler<HTMLDivElement>
  onClick?: MouseEventHandler<HTMLDivElement>
  onContextMenu?: MouseEventHandler<HTMLDivElement>
}

export default function ScreenSlideList({
  slideWidth,
  slideHeight,
  animationIndex,
  turnSlideToId,
  manualExitFullscreen,
  variant = 'theater',
  onWheel,
  onTouchStart,
  onTouchEnd,
  onClick,
  onContextMenu,
}: IScreenSlideListProps) {
  const slideIndex = useSlidesStore(s => s.slideIndex)
  const viewportSize = useSlidesStore(s => s.viewportSize)
  const { slidesWithTurningMode } = useSlidesWithTurningMode()
  const scale = slideWidth / viewportSize

  return (
    <SlideScaleContext.Provider value={scale}>
      <div
        className={cx('screen-slide-list', variant)}
        onWheel={onWheel}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onClick={onClick}
        onContextMenu={onContextMenu}
      >
        {slidesWithTurningMode.map((slide, index) => (
          <div
            className={cx('slide-item', `turning-mode-${slide.turningMode}`, {
              current: index === slideIndex,
              before: index < slideIndex,
              after: index > slideIndex,
              hide: (index === slideIndex - 1 || index === slideIndex + 1) && slide.turningMode !== slidesWithTurningMode[slideIndex].turningMode,
              last: index === slideIndex - 1,
              next: index === slideIndex + 1,
            })}
            key={slide.id}
          >
            {Math.abs(slideIndex - index) < 2 || slide.animations?.length ? (
              <div
                className={cx('slide-content')}
                style={{
                  width: slideWidth + 'px',
                  height: slideHeight + 'px',
                }}
              >
                <ScreenSlide
                  slide={slide}
                  scale={scale}
                  animationIndex={animationIndex}
                  turnSlideToId={turnSlideToId}
                  manualExitFullscreen={manualExitFullscreen}
                />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </SlideScaleContext.Provider>
  )
}
