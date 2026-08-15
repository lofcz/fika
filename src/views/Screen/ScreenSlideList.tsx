import { bindStyles } from '@/utils/cssm'
import styles from './ScreenSlideList.module.scss'
const cx = bindStyles(styles)
import { useEffect, useState, type MouseEventHandler, type TouchEventHandler, type WheelEventHandler } from 'react'
import { useSlidesStore } from '@/store'
import { SlideScaleContext } from '@/types/injectKey'
import { resolveTurningMode, screenWindowRange } from './screenWindow'
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
  const slides = useSlidesStore(s => s.slides)
  const viewportSize = useSlidesStore(s => s.viewportSize)
  const scale = slideWidth / viewportSize
  const { start, end } = screenWindowRange(slideIndex, slides.length)
  const currentTurningMode = resolveTurningMode(slides[slideIndex]?.id ?? '', slides[slideIndex]?.turningMode)
  const currentId = slides[slideIndex]?.id
  const [readyIds, setReadyIds] = useState(() => new Set<string>(currentId ? [currentId] : []))

  useEffect(() => {
    const pending: string[] = []
    for (let index = start; index <= end; index++) {
      const id = slides[index]?.id
      if (id && !readyIds.has(id)) pending.push(id)
    }
    if (currentId && !readyIds.has(currentId)) pending.push(currentId)
    if (!pending.length) return
    let cancelled = false
    const hydrate = () => {
      if (cancelled) return
      setReadyIds(prev => {
        const next = new Set(prev)
        for (const id of pending) next.add(id)
        return next
      })
    }
    if (typeof requestIdleCallback === 'function') {
      const idle = requestIdleCallback(hydrate, { timeout: 64 })
      return () => {
        cancelled = true
        cancelIdleCallback(idle)
      }
    }
    const timeout = window.setTimeout(hydrate, 0)
    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [currentId, end, readyIds, slides, start])

  const items = []
  for (let index = start; index <= end; index++) {
    const slide = slides[index]
    if (!slide) continue
    items.push({
      index,
      turningMode: resolveTurningMode(slide.id, slide.turningMode),
      slide,
    })
  }

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
        {items.map(({ slide, index, turningMode }) => (
          <div
            className={cx('slide-item', `turning-mode-${turningMode}`, {
              current: index === slideIndex,
              before: index < slideIndex,
              after: index > slideIndex,
              hide: (index === slideIndex - 1 || index === slideIndex + 1) && turningMode !== currentTurningMode,
              last: index === slideIndex - 1,
              next: index === slideIndex + 1,
            })}
            data-screen-slide={index}
            {...(index === slideIndex ? { 'data-screen-current': '' } : {})}
            key={slide.id}
          >
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
                paintElements={index === slideIndex || readyIds.has(slide.id)}
              />
            </div>
          </div>
        ))}
      </div>
    </SlideScaleContext.Provider>
  )
}
