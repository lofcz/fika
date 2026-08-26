import { bindStyles } from '@/utils/cssm'
import styles from './BaseView.module.scss'
const cx = bindStyles(styles)
import { useCallback, useEffect, useRef, useState } from 'react'
import { useHoldAfterOpen } from '@/hooks/useHoldAfterOpen'
import { useSlidesStore } from '@/store'
import type { ContextmenuItem } from '@/components/Contextmenu/types'
import { openContextmenu } from '@/utils/openContextmenu'
import { enterFullscreen } from '@/utils/fullscreen'
import useScreening from '@/hooks/useScreening'
import useExecPlay from './hooks/useExecPlay'
import useSlideSize from './hooks/useSlideSize'
import useFullscreen from './hooks/useFullscreen'
import ScreenSlideList from './ScreenSlideList'
import SlideThumbnails from './SlideThumbnails'
import WritingBoardTool from './WritingBoardTool'
import CountdownTimer from './CountdownTimer'
import BottomThumbnails from './BottomThumbnails'
import LaserTrailOverlay from './LaserTrailOverlay'
import PresenterToolbar from './PresenterToolbar'
import { useI18nContext } from '@/i18n/useI18nContext'
import { ensureMathStylesForSlides } from '@/utils/math'

export default function BaseView({ changeViewMode }: { changeViewMode: (mode: 'base' | 'presenter') => void }) {
  const { LL } = useI18nContext()
  const slides = useSlidesStore(s => s.slides);
  const slideIndex = useSlidesStore(s => s.slideIndex);
  useEffect(() => {
    ensureMathStylesForSlides(slides)
  }, [slides])
  const {
    autoPlayTimer,
    autoPlay,
    closeAutoPlay,
    autoPlayInterval,
    setAutoPlayInterval,
    loopPlay,
    setLoopPlay,
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
  const { slideWidth, slideHeight } = useSlideSize()
  const { exitScreening: _exitScreening } = useScreening()
  const { fullscreenState, manualExitFullscreen } = useFullscreen()
  const [timerlVisible, setTimerlVisible] = useState(false)
  const [slideThumbnailModelVisible, setSlideThumbnailModelVisible] = useState(false)
  const [bottomThumbnailsVisible, setBottomThumbnailsVisible] = useState(false)
  const timerHeld = useHoldAfterOpen(timerlVisible)
  const thumbsHeld = useHoldAfterOpen(slideThumbnailModelVisible)
  const closeTimer = useCallback(() => setTimerlVisible(false), [])
  const closeThumbnails = useCallback(() => setSlideThumbnailModelVisible(false), [])
  const toolbarRef = useRef<{ reveal: () => void } | null>(null)

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

  const contextmenus = (): ContextmenuItem[] => {
    const t = LL.screen.baseView.contextmenu
    return [
      { text: t.prevSlide(), subText: '↑ ←', disable: slideIndex <= 0, handler: () => turnPrevSlide() },
      { text: t.nextSlide(), subText: '↓ →', disable: slideIndex >= slides.length - 1, handler: () => turnNextSlide() },
      { text: t.firstSlide(), disable: slideIndex === 0, handler: () => turnSlideToIndex(0) },
      { text: t.lastSlide(), disable: slideIndex === slides.length - 1, handler: () => turnSlideToIndex(slides.length - 1) },
      { divider: true },
      {
        text: autoPlayTimer ? t.cancelAutoPlay() : t.autoPlay(),
        handler: autoPlayTimer ? closeAutoPlay : autoPlay,
        children: [
          { text: t.interval2_5s(), subText: autoPlayInterval === 2500 ? '√' : '', handler: () => setAutoPlayInterval(2500) },
          { text: t.interval5s(), subText: autoPlayInterval === 5000 ? '√' : '', handler: () => setAutoPlayInterval(5000) },
          { text: t.interval7_5s(), subText: autoPlayInterval === 7500 ? '√' : '', handler: () => setAutoPlayInterval(7500) },
          { text: t.interval10s(), subText: autoPlayInterval === 10000 ? '√' : '', handler: () => setAutoPlayInterval(10000) },
        ],
      },
      { text: t.loopPlay(), subText: loopPlay ? '√' : '', handler: () => setLoopPlay(!loopPlay) },
      { divider: true },
      { text: t.showToolbar(), handler: () => toolbarRef.current?.reveal() },
      { text: t.viewAllSlides(), handler: () => { setSlideThumbnailModelVisible(true )} },
      { text: t.bottomThumbnailsOnScroll(), subText: bottomThumbnailsVisible ? '√' : '', handler: () => { setBottomThumbnailsVisible(!bottomThumbnailsVisible )} },
      { text: t.penTool(), handler: () => toggleTool('pen') },
      { text: t.laserPen(), subText: 'L', handler: () => toggleTool('laser') },
      { text: t.presenterView(), handler: () => changeViewMode('presenter') },
      { divider: true },
      { text: t.endPresentation(), subText: 'ESC', handler: exitScreening },
    ]
  }

  return (
    <div className={cx('base-view', laserActive && 'laser-pen')}>
      <ScreenSlideList
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
      {thumbsHeld ? (
        <div style={{ display: slideThumbnailModelVisible ? undefined : 'none' }}>
          <SlideThumbnails turnSlideToIndex={turnSlideToIndex} onClose={closeThumbnails} />
        </div>
      ) : null}
      {penSession ? <WritingBoardTool slideWidth={slideWidth} slideHeight={slideHeight} drawing={penActive} onClose={closePenSession} /> : null}
      {timerHeld ? (
        <div style={{ display: timerlVisible ? undefined : 'none' }}>
          <CountdownTimer onClose={closeTimer} />
        </div>
      ) : null}
      <LaserTrailOverlay active={laserActive} color={laserColor} trackPointer />
      <PresenterToolbar
        ref={toolbarRef}
        execPrev={execPrev}
        execNext={execNext}
        turnSlideToIndex={turnSlideToIndex}
        penActive={penActive}
        laserActive={laserActive}
        laserColor={laserColor}
        toggleLaserColor={toggleLaserColor}
        timerVisible={timerlVisible}
        fullscreenState={fullscreenState}
        autoPlayTimer={autoPlayTimer}
        autoPlay={autoPlay}
        closeAutoPlay={closeAutoPlay}
        loopPlay={loopPlay}
        onOpenPen={() => switchTool('pen')}
        onToggleLaser={() => toggleTool('laser')}
        onToggleTimer={() => { setTimerlVisible(!timerlVisible )}}
        onOpenAllSlides={() => { setSlideThumbnailModelVisible(true )}}
        onPresenterView={() => changeViewMode('presenter')}
        onAudienceView={openAudienceView}
        onEnterFullscreen={() => enterFullscreen()}
        onExitFullscreen={() => manualExitFullscreen()}
        onToggleLoop={() => setLoopPlay(!loopPlay)}
        onEnd={exitScreening}
      />
      {bottomThumbnailsVisible ? <BottomThumbnails /> : null}
    </div>
  )
}
