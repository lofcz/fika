import { bindStyles } from '@/utils/cssm'
import styles from './PresenterToolbar.module.scss'
const cx = bindStyles(styles)
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { useSlidesStore } from '@/store'
import { useI18nContext } from '@/i18n/useI18nContext'
import { Icon } from '@/components/Icon'
import Popover from '@/components/Popover'
import PopoverMenuItem from '@/components/PopoverMenuItem'
import ThumbnailSlide from '@/views/components/ThumbnailSlide/index'
import LaserColorSwatches from './LaserColorSwatches'
import type { LaserColorId } from '@/configs/laser'

export type PresenterToolbarProps = {
  execPrev: () => void
  execNext: () => void
  turnSlideToIndex: (index: number) => void
  penActive: boolean
  laserActive: boolean
  laserColor: LaserColorId
  toggleLaserColor: (color: LaserColorId) => void
  timerVisible: boolean
  fullscreenState: boolean
  autoPlayTimer: ReturnType<typeof setInterval> | null
  autoPlay: () => void
  closeAutoPlay: () => void
  loopPlay: boolean
  onOpenPen: () => void
  onToggleLaser: () => void
  onToggleTimer: () => void
  onOpenAllSlides: () => void
  onPresenterView: () => void
  onAudienceView: () => void
  onEnterFullscreen: () => void
  onExitFullscreen: () => void
  onToggleLoop: () => void
  onEnd: () => void
}

const JumpPanel = memo(function JumpPanel({ onJump, open }: { onJump: (index: number) => void; open: boolean }) {
  const { LL } = useI18nContext()
  const slides = useSlidesStore(s => s.slides)
  const slideIndex = useSlidesStore(s => s.slideIndex)
  const jumpGridRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => {
      jumpGridRef.current?.querySelector<HTMLElement>('.jump-item.active')?.scrollIntoView({ block: 'nearest' })
    })
    return () => cancelAnimationFrame(frame)
  }, [open, slideIndex])

  return (
    <div className={cx('jump-panel')} onMouseDown={event => event.stopPropagation()}>
      <div className={cx('jump-head')}>{LL.screen.baseView.jumpTitle()}</div>
      <div className={cx('jump-grid')} ref={jumpGridRef}>
        {slides.map((slide, index) => (
          <button
            type="button"
            className={cx('jump-item', { active: index === slideIndex })}
            key={slide.id}
            onClick={() => onJump(index)}
          >
            <ThumbnailSlide slide={{ id: slide.id }} size={108} />
            <span className={cx('jump-index')}>{index + 1}</span>
          </button>
        ))}
      </div>
    </div>
  )
})

const PresenterToolbar = forwardRef<{ reveal: () => void }, PresenterToolbarProps>((props, ref) => {
  const { LL } = useI18nContext()
  const slides = useSlidesStore(s => s.slides)
  const slideIndex = useSlidesStore(s => s.slideIndex)

  const [nearby, setNearby] = useState(false)
  const [jumpOpen, setJumpOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [blankScreen, setBlankScreen] = useState<'black' | 'white' | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dockRef = useRef<HTMLDivElement | null>(null)
  const jumpOpenRef = useRef(false)
  const moreOpenRef = useRef(false)
  const blankScreenRef = useRef(blankScreen)
  jumpOpenRef.current = jumpOpen
  moreOpenRef.current = moreOpen
  blankScreenRef.current = blankScreen

  const dockVisible = nearby || jumpOpen || moreOpen

  const isDockChrome = (node: EventTarget | null) => {
    if (!(node instanceof Element)) return false
    return Boolean(
      node.closest('.presenter-dock') ||
      node.closest('[data-tippy-root]') ||
      node.closest('.tippy-box'),
    )
  }

  const isNearDock = (x: number, y: number) => {
    const el = dockRef.current
    if (!el) return false
    const pad = 80
    const r = el.getBoundingClientRect()
    return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad
  }

  const setNearbySoon = (next: boolean) => {
    if (next) {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current)
        hideTimer.current = null
      }
      setNearby(true)
      return
    }
    if (hideTimer.current) return
    hideTimer.current = setTimeout(() => {
      hideTimer.current = null
      if (jumpOpenRef.current || moreOpenRef.current) return
      setNearby(false)
    }, 220)
  }

  const jumpTo = (index: number) => {
    props.turnSlideToIndex(index)
    setJumpOpen(false)
  }
  const jumpToRef = useRef(jumpTo)
  jumpToRef.current = jumpTo
  const onJump = useCallback((index: number) => jumpToRef.current(index), [])
  const jumpContent = (
    <JumpPanel onJump={onJump} open={jumpOpen} />
  )

  const toggleBlank = (mode: 'black' | 'white') => {
    setBlankScreen(current => current === mode ? null : mode)
  }

  useImperativeHandle(ref, () => ({
    reveal: () => setNearbySoon(true),
  }))

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      setNearbySoon(isDockChrome(e.target) || isNearDock(e.clientX, e.clientY))
    }
    const onMouseOut = (e: MouseEvent) => {
      if (e.relatedTarget) return
      setNearbySoon(false)
    }
    const onKeydown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      if (target?.isContentEditable) return
      const key = e.key.toUpperCase()
      if (key === 'B') {
        e.preventDefault()
        toggleBlank('black')
      }
      else if (key === 'W') {
        e.preventDefault()
        toggleBlank('white')
      }
      else if (key === 'ESCAPE' && blankScreenRef.current) {
        e.preventDefault()
        e.stopPropagation()
        setBlankScreen(null)
      }
    }
    window.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseout', onMouseOut)
    window.addEventListener('keydown', onKeydown, true)
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
      window.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseout', onMouseOut)
      window.removeEventListener('keydown', onKeydown, true)
    }
  }, [])

  const t = LL.screen.baseView.tooltip
  const moreContent = useMemo(() => (
    <div className={cx('more-menu')} onMouseDown={event => event.stopPropagation()}>
      <PopoverMenuItem className={cx('more-item')} onClick={() => { toggleBlank('white'); setMoreOpen(false) }}>
        <Icon icon="sun" className={cx('icon')} />
        {t.whiteScreen()}
      </PopoverMenuItem>
      <PopoverMenuItem className={cx('more-item')} onClick={() => { props.onAudienceView(); setMoreOpen(false) }}>
        <Icon icon="users" className={cx('icon')} />
        {t.audienceView()}
      </PopoverMenuItem>
      <PopoverMenuItem className={cx('more-item')} onClick={() => { props.onToggleLoop(); setMoreOpen(false) }}>
        <Icon icon="repeat" className={cx('icon')} />
        {LL.screen.baseView.contextmenu.loopPlay()}
        {props.loopPlay ? <span className={cx('check')}>✓</span> : null}
      </PopoverMenuItem>
      <PopoverMenuItem className={cx('more-item')} onClick={() => { props.turnSlideToIndex(0); setMoreOpen(false) }}>
        <Icon icon="chevron-up" className={cx('icon')} />
        {LL.screen.baseView.contextmenu.firstSlide()}
      </PopoverMenuItem>
      <PopoverMenuItem className={cx('more-item')} onClick={() => { props.turnSlideToIndex(slides.length - 1); setMoreOpen(false) }}>
        <Icon icon="chevron-down" className={cx('icon')} />
        {LL.screen.baseView.contextmenu.lastSlide()}
      </PopoverMenuItem>
    </div>
  ), [LL, t, props.loopPlay, props.onAudienceView, props.onToggleLoop, props.turnSlideToIndex, slides.length])

  return (
    <>
      {blankScreen ? (
        <div
          className={cx('blank-veil', blankScreen)}
          onClick={() => setBlankScreen(null)}
          onMouseDown={event => event.stopPropagation()}
        >
          <span className={cx('blank-hint')}>{LL.screen.baseView.blankHint()}</span>
        </div>
      ) : null}

      <div
        ref={dockRef}
        className={cx('presenter-dock', { visible: dockVisible })}
        onMouseDown={event => event.stopPropagation()}
        onClick={event => event.stopPropagation()}
      >
        <div className={cx('group')}>
          <button
            type="button"
            className={cx('tool')}
            disabled={slideIndex <= 0 && !props.loopPlay}
            data-tooltip={t.prevSlide()}
            onClick={() => props.execPrev()}
          >
            <Icon icon="chevron-left" />
          </button>

          <Popover trigger="click" placement="top-start" value={jumpOpen} onUpdateValue={setJumpOpen} content={jumpContent}>
            <button
              type="button"
              className={cx('tool', 'page')}
              data-tooltip={t.jumpToSlide()}
            >
              <span>{slideIndex + 1}</span>
              <span className={cx('muted')}>/</span>
              <span>{slides.length}</span>
              <Icon icon="chevron-down" className={cx('chevron')} />
            </button>
          </Popover>

          <button
            type="button"
            className={cx('tool')}
            disabled={slideIndex >= slides.length - 1 && !props.loopPlay}
            data-tooltip={t.nextSlide()}
            onClick={() => props.execNext()}
          >
            <Icon icon="chevron-right" />
          </button>
        </div>

        <span className={cx('rule')} />

        <div className={cx('group')}>
          <button
            type="button"
            className={cx('tool', { on: props.penActive })}
            data-tooltip={t.penTool()}
            onClick={props.onOpenPen}
          >
            <Icon icon="pencil" />
          </button>
          <button
            type="button"
            className={cx('tool', { on: props.laserActive })}
            data-tooltip={t.laserPen()}
            onClick={props.onToggleLaser}
          >
            <Icon icon="sparkles" />
          </button>
          <LaserColorSwatches
            laserColor={props.laserColor}
            toggleLaserColor={props.toggleLaserColor}
          />
          <button
            type="button"
            className={cx('tool', { on: blankScreen === 'black' })}
            data-tooltip={t.blackScreen()}
            onClick={() => toggleBlank('black')}
          >
            <Icon icon="moon" />
          </button>
          <button
            type="button"
            className={cx('tool', { on: !!props.autoPlayTimer })}
            data-tooltip={props.autoPlayTimer ? t.stopAutoPlay() : t.autoPlay()}
            onClick={props.autoPlayTimer ? props.closeAutoPlay : props.autoPlay}
          >
            <Icon icon={props.autoPlayTimer ? 'pause' : 'play'} />
          </button>
        </div>

        <span className={cx('rule')} />

        <div className={cx('group')}>
          <button
            type="button"
            className={cx('tool')}
            data-tooltip={t.allSlides()}
            onClick={props.onOpenAllSlides}
          >
            <Icon icon="layout-grid" />
          </button>
          <button
            type="button"
            className={cx('tool', { on: props.timerVisible })}
            data-tooltip={t.timer()}
            onClick={props.onToggleTimer}
          >
            <Icon icon="timer" />
          </button>
          <button
            type="button"
            className={cx('tool')}
            data-tooltip={t.presenterView()}
            onClick={props.onPresenterView}
          >
            <Icon icon="list" />
          </button>
          <button
            type="button"
            className={cx('tool')}
            data-tooltip={props.fullscreenState ? t.exitFullscreen() : t.enterFullscreen()}
            onClick={props.fullscreenState ? props.onExitFullscreen : props.onEnterFullscreen}
          >
            <Icon icon={props.fullscreenState ? 'minimize' : 'maximize'} />
          </button>
        </div>

        <span className={cx('rule')} />

        <div className={cx('group')}>
          <Popover trigger="click" placement="top-end" value={moreOpen} onUpdateValue={setMoreOpen} content={moreContent}>
            <button type="button" className={cx('tool')} data-tooltip={t.more()}>
              <Icon icon="ellipsis" />
            </button>
          </Popover>
          <button
            type="button"
            className={cx('tool', 'end')}
            data-tooltip={t.endPresentation()}
            onClick={props.onEnd}
          >
            <Icon icon="power" />
          </button>
        </div>
      </div>
    </>
  )
})

export default PresenterToolbar
