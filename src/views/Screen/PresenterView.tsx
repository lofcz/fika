import { bindStyles } from '@/utils/cssm'
import styles from './PresenterView.module.scss'
const cx = bindStyles(styles)
import { useCallback, useEffect, useRef, useState } from 'react'
import { useHoldAfterOpen } from '@/hooks/useHoldAfterOpen'
import { useSlidesStore, selectCurrentSlide } from '@/store'
import { useI18nContext } from '@/i18n/useI18nContext'
import { Icon } from '@/components/Icon'
import type { ContextmenuItem } from '@/components/Contextmenu/types'
import { openContextmenu } from '@/utils/openContextmenu'
import { enterFullscreen } from '@/utils/fullscreen'
import { fillDigit } from '@/utils/common'
import { parseText2Paragraphs } from '@/utils/textParser'
import useScreening from '@/hooks/useScreening'
import useLoadSlides from '@/hooks/useLoadSlides'
import useExecPlay from './hooks/useExecPlay'
import useSlideSize from './hooks/useSlideSize'
import useFullscreen from './hooks/useFullscreen'
import ThumbnailSlide from '@/views/components/ThumbnailSlide/index'
import ScreenSlideList from './ScreenSlideList'
import LaserTrailOverlay from './LaserTrailOverlay'
import WritingBoardTool from './WritingBoardTool'
import CountdownTimer from './CountdownTimer'
import LaserColorSwatches from './LaserColorSwatches'

export default function PresenterView({ changeViewMode }: { changeViewMode: (mode: 'base' | 'presenter') => void }) {
  const { LL } = useI18nContext()
  const slides = useSlidesStore(s => s.slides)
  const slideIndex = useSlidesStore(s => s.slideIndex)
  const viewportRatio = useSlidesStore(s => s.viewportRatio)
  const currentSlide = useSlidesStore(selectCurrentSlide)

  const slideListWrapRef = useRef<HTMLDivElement | null>(null)
  const thumbnailsRef = useRef<HTMLDivElement | null>(null)
  const nextPreviewRef = useRef<HTMLDivElement | null>(null)
  const [timerlVisible, setTimerlVisible] = useState(false)
  const timerHeld = useHoldAfterOpen(timerlVisible)
  const closeTimer = useCallback(() => setTimerlVisible(false), [])
  const [remarkFontSize, setRemarkFontSize] = useState(18)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [clockLabel, setClockLabel] = useState('')
  const [nextPreviewSize, setNextPreviewSize] = useState(240)

  const {
    mousewheelListener,
    touchStartListener,
    touchEndListener,
    turnPrevSlide,
    turnNextSlide,
    turnSlideToIndex,
    turnSlideToId,
    execPrev,
    execNext,
    handleSlideClick,
    animationIndex,
    laserActive,
    laserColor,
    penActive,
    penSession,
    switchTool,
    toggleTool,
    toggleLaserColor,
    closePenSession,
    broadcastExit,
  } = useExecPlay()

  const { slideWidth, slideHeight } = useSlideSize(slideListWrapRef)
  const { exitScreening: _exitScreening } = useScreening()
  const { slidesLoadLimit } = useLoadSlides()
  const { fullscreenState, manualExitFullscreen } = useFullscreen()

  const nextSlide = slides[slideIndex + 1] ?? null
  const currentSlideRemark = currentSlide?.remark ? parseText2Paragraphs(currentSlide.remark) : ''

  const elapsedLabel = (() => {
    const hours = Math.floor(elapsedSeconds / 3600)
    const minutes = Math.floor((elapsedSeconds % 3600) / 60)
    const seconds = elapsedSeconds % 60
    if (hours > 0) return `${hours}:${fillDigit(minutes, 2)}:${fillDigit(seconds, 2)}`
    return `${fillDigit(minutes, 2)}:${fillDigit(seconds, 2)}`
  })()

  const syncClock = () => {
    setClockLabel(new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date()))
  }

  const syncNextPreviewSize = () => {
    const el = nextPreviewRef.current
    if (!el) return
    const width = el.clientWidth
    const height = el.clientHeight
    setNextPreviewSize(Math.max(0, Math.floor(Math.min(width, height / viewportRatio))))
  }

  const openAudienceView = () => {
    manualExitFullscreen()
    window.open(`${location.origin}${location.pathname}?mode=audience`, 'fika-audience', 'popup')
  }

  const onSlideClick = (e: React.MouseEvent) => {
    if (penActive) return
    handleSlideClick(e.nativeEvent)
  }

  const exitScreening = () => {
    broadcastExit()
    _exitScreening()
  }

  const handleMousewheelThumbnails = (e: React.WheelEvent) => {
    e.preventDefault()
    if (!thumbnailsRef.current) return
    thumbnailsRef.current.scrollBy(e.deltaY, 0)
  }

  const updateRemarkFontSize = (fontSize: number) => {
    if (fontSize < 12 || fontSize > 40) return
    setRemarkFontSize(fontSize)
  }

  useEffect(() => {
    const startedAt = Date.now()
    syncClock()
    const clockTimer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000))
      syncClock()
    }, 1000)

    syncNextPreviewSize()
    const nextEl = nextPreviewRef.current
    const nextPreviewObserver = nextEl ? new ResizeObserver(syncNextPreviewSize) : null
    if (nextEl && nextPreviewObserver) nextPreviewObserver.observe(nextEl)

    return () => {
      clearInterval(clockTimer)
      nextPreviewObserver?.disconnect()
    }
  }, [])

  useEffect(() => {
    syncNextPreviewSize()
  }, [viewportRatio])

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (!thumbnailsRef.current) return
      const activeThumbnailRef = thumbnailsRef.current.querySelector<HTMLElement>(`.${styles.thumb}.${styles.active}, .thumb.active`)
      if (!activeThumbnailRef) return
      const width = thumbnailsRef.current.offsetWidth
      const offsetLeft = activeThumbnailRef.offsetLeft + activeThumbnailRef.clientWidth / 2
      thumbnailsRef.current.scrollTo({ left: offsetLeft - width / 2, behavior: 'smooth' })
    })
    return () => cancelAnimationFrame(frame)
  }, [slideIndex])

  const contextmenus = (): ContextmenuItem[] => {
    const t = LL.screen.contextmenu
    return [
      {
        text: t.previousSlide(),
        subText: '↑ ←',
        disable: slideIndex <= 0,
        handler: () => turnPrevSlide(),
      },
      {
        text: t.nextSlide(),
        subText: '↓ →',
        disable: slideIndex >= slides.length - 1,
        handler: () => turnNextSlide(),
      },
      {
        text: t.firstSlide(),
        disable: slideIndex === 0,
        handler: () => turnSlideToIndex(0),
      },
      {
        text: t.lastSlide(),
        disable: slideIndex === slides.length - 1,
        handler: () => turnSlideToIndex(slides.length - 1),
      },
      { divider: true },
      {
        text: t.penTool(),
        handler: () => toggleTool('pen'),
      },
      {
        text: t.laserPen(),
        subText: 'L',
        handler: () => toggleTool('laser'),
      },
      {
        text: t.standardView(),
        handler: () => changeViewMode('base'),
      },
      { divider: true },
      {
        text: t.endSlideshow(),
        subText: 'ESC',
        handler: exitScreening,
      },
    ]
  }

  return (
    <div className={cx('presenter-view')}>
      <nav className={cx('rail', 'pane')}>
        <div className={cx('rail-group')}>
          <button type="button" className={cx('tool')} data-tooltip={LL.screen.presenter.standardView()} onClick={() => changeViewMode('base')}>
            <Icon icon="list" />
          </button>
          <button type="button" className={cx('tool')} data-tooltip={LL.screen.presenter.audienceView()} onClick={openAudienceView}>
            <Icon icon="users" />
          </button>
        </div>

        <span className={cx('rule')} />

        <div className={cx('rail-group')}>
          <button
            type="button"
            className={cx('tool')}
            disabled={slideIndex <= 0}
            data-tooltip={LL.screen.baseView.tooltip.prevSlide()}
            onClick={() => execPrev()}
          >
            <Icon icon="chevron-up" />
          </button>
          <button
            type="button"
            className={cx('tool')}
            disabled={slideIndex >= slides.length - 1}
            data-tooltip={LL.screen.baseView.tooltip.nextSlide()}
            onClick={() => execNext()}
          >
            <Icon icon="chevron-down" />
          </button>
        </div>

        <span className={cx('rule')} />

        <div className={cx('rail-group')}>
          <button type="button" className={cx('tool', { on: penActive })} data-tooltip={LL.screen.presenter.pen()} onClick={() => switchTool('pen')}>
            <Icon icon="pencil" />
          </button>
          <button type="button" className={cx('tool', { on: laserActive })} data-tooltip={LL.screen.presenter.laserPen()} onClick={() => toggleTool('laser')}>
            <Icon icon="sparkles" />
          </button>
          <LaserColorSwatches
            layout="grid"
            laserColor={laserColor}
            toggleLaserColor={toggleLaserColor}
          />
        </div>

        <span className={cx('rule')} />

        <div className={cx('rail-group')}>
          <button type="button" className={cx('tool', { on: timerlVisible })} data-tooltip={LL.screen.presenter.timer()} onClick={() => setTimerlVisible(!timerlVisible)}>
            <Icon icon="timer" />
          </button>
          <button
            type="button"
            className={cx('tool')}
            data-tooltip={fullscreenState ? LL.screen.presenter.exitFullscreen() : LL.screen.presenter.fullscreen()}
            onClick={fullscreenState ? manualExitFullscreen : enterFullscreen}
          >
            <Icon icon={fullscreenState ? 'minimize' : 'maximize'} />
          </button>
        </div>

        <button type="button" className={cx('tool', 'end')} data-tooltip={LL.screen.presenter.endSlideshow()} onClick={exitScreening}>
          <Icon icon="power" />
        </button>
      </nav>

      <section className={cx('stage', 'pane')}>
        <header className={cx('pane-head')}>
          <div className={cx('kicker')}>
            <span className={cx('label')}>{LL.screen.presenter.now()}</span>
            <span className={cx('progress')}>{LL.screen.presenter.slideProgress({ current: slideIndex + 1, total: slides.length })}</span>
          </div>
          <div className={cx('times')}>
            <span className={cx('elapsed')} data-tooltip={LL.screen.presenter.elapsed()}>
              <Icon icon="timer" />
              {elapsedLabel}
            </span>
            <span className={cx('clock')}>{clockLabel}</span>
          </div>
        </header>

        <div
          className={cx('stage-body', { 'laser-pen': laserActive })}
          ref={slideListWrapRef}
        >
          <ScreenSlideList
            variant="paper"
            slideWidth={slideWidth}
            slideHeight={slideHeight}
            animationIndex={animationIndex}
            turnSlideToId={turnSlideToId}
            manualExitFullscreen={manualExitFullscreen}
            onWheel={event => mousewheelListener(event.nativeEvent)}
            onTouchStart={event => touchStartListener(event.nativeEvent)}
            onTouchEnd={event => touchEndListener(event.nativeEvent)}
            onClick={onSlideClick}
            onContextMenu={event => openContextmenu(event, contextmenus)}
          />
          {penSession ? (
            <WritingBoardTool
              slideWidth={slideWidth}
              slideHeight={slideHeight}
              left={72}
              top={56}
              drawing={penActive}
              onClose={closePenSession}
            />
          ) : null}
          <LaserTrailOverlay active={laserActive} color={laserColor} trackPointer />
          {timerHeld ? (
            <div style={{ display: timerlVisible ? undefined : 'none' }}>
              <CountdownTimer
                left={72}
                top={56}
                onClose={closeTimer}
              />
            </div>
          ) : null}
        </div>
      </section>

      <aside className={cx('filmstrip', 'pane')}>
        <div
          className={cx('filmstrip-scroller')}
          ref={thumbnailsRef}
          onWheel={handleMousewheelThumbnails}
        >
          <div className={cx('filmstrip-track')}>
            {slides.map((slide, index) => (
              <button
                type="button"
                className={cx('thumb', { active: index === slideIndex })}
                key={slide.id}
                onClick={() => turnSlideToIndex(index)}
              >
                <ThumbnailSlide slide={slide} size={72 / viewportRatio} visible={index < slidesLoadLimit} />
                <span className={cx('thumb-index')}>{index + 1}</span>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <aside className={cx('side')}>
        <section className={cx('next-pane', 'pane')}>
          <header className={cx('pane-head')}>
            <span className={cx('label')}>{LL.screen.presenter.next()}</span>
            {nextSlide ? (
              <span className={cx('progress')}>{LL.screen.presenter.slideProgress({ current: slideIndex + 2, total: slides.length })}</span>
            ) : null}
          </header>
          <div className={cx('next-body')} ref={nextPreviewRef}>
            {nextSlide ? (
              <button
                type="button"
                className={cx('next-card')}
                onClick={() => turnSlideToIndex(slideIndex + 1)}
              >
                {nextPreviewSize > 0 ? <ThumbnailSlide slide={nextSlide} size={nextPreviewSize} /> : null}
              </button>
            ) : (
              <div className={cx('next-empty')}>{LL.screen.presenter.endOfSlides()}</div>
            )}
          </div>
        </section>

        <section className={cx('notes-pane', 'pane')}>
          <header className={cx('pane-head')}>
            <span className={cx('label')}>{LL.screen.presenter.speakerNotes()}</span>
            <div className={cx('scale')}>
              <button
                type="button"
                className={cx('tool', 'compact')}
                disabled={remarkFontSize === 12}
                onClick={() => updateRemarkFontSize(remarkFontSize - 2)}
              >
                <Icon icon="minus" />
              </button>
              <button
                type="button"
                className={cx('tool', 'compact')}
                disabled={remarkFontSize === 40}
                onClick={() => updateRemarkFontSize(remarkFontSize + 2)}
              >
                <Icon icon="plus" />
              </button>
            </div>
          </header>
          <div
            className={cx('notes-body', 'ProseMirror-static', { empty: !currentSlideRemark })}
            style={{ fontSize: remarkFontSize + 'px' }}
            dangerouslySetInnerHTML={{ __html: currentSlideRemark || LL.screen.presenter.noNotes() }}
          />
        </section>
      </aside>
    </div>
  )
}
