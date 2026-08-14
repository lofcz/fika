import { useState, useEffect, useRef, useMemo } from 'react'
import { throttle } from '@/utils/debounce'
import { useSlidesStore, selectFormatedAnimations } from '@/store'
import { KEYS } from '@/configs/hotkey'
import { ANIMATION_CLASS_PREFIX } from '@/configs/animation'
import { type LaserColorId, type ScreenTool } from '@/configs/laser'
import message from '@/utils/message'
import { queryFika } from '@/utils/portal'
import { getLL } from '@/i18n/getLL'
import type { Slide } from '@/types/slides'
import { useScreenTools } from './useScreenTools'

const AUDIENCE_SYNC_CHANNEL = 'fika-audience-sync'

type SyncMessage =
  | { type: 'EXEC_NEXT' }
  | { type: 'EXEC_PREV' }
  | { type: 'TURN_TO_INDEX'; index: number }
  | { type: 'TURN_TO_ID'; id: string }
  | { type: 'REQUEST_STATE' }
  | { type: 'INIT_STATE'; slideIndex: number; animationIndex: number; slides: Slide[]; viewportSize: number; viewportRatio: number }
  | { type: 'REQUEST_WRITING_BOARD' }
  | { type: 'WRITING_BOARD_UPDATE'; dataURL: string; blackboard: boolean }
  | { type: 'WRITING_BOARD_CLOSE' }
  | { type: 'LASER_PEN_MOVE'; x: number; y: number; color: LaserColorId }
  | { type: 'LASER_PEN_OFF' }
  | { type: 'EXIT' }

const getFormatedAnimations = () => selectFormatedAnimations(useSlidesStore.getState())

export default () => {
  const slidesStore = useSlidesStore()
  const slideIndex = useSlidesStore(s => s.slideIndex)
  const isAudienceMode = new URLSearchParams(window.location.search).get('mode') === 'audience'

  const [animationIndex, setAnimationIndexState] = useState(0)
  const animationIndexRef = useRef(0)
  const setAnimationIndex = (value: number) => {
    animationIndexRef.current = value
    setAnimationIndexState(value)
  }

  const inAnimationRef = useRef(false)
  const playedSlidesMinIndexRef = useRef(slideIndex)

  const [autoPlayTimer, setAutoPlayTimerState] = useState<ReturnType<typeof setInterval> | null>(null)
  const autoPlayTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [loopPlay, setLoopPlayState] = useState(false)
  const loopPlayRef = useRef(false)
  const setLoopPlay = (loop: boolean) => {
    loopPlayRef.current = loop
    setLoopPlayState(loop)
  }

  const [autoPlayInterval, setAutoPlayIntervalState] = useState(2500)
  const autoPlayIntervalRef = useRef(2500)

  const touchInfoRef = useRef<{ x: number; y: number } | null>(null)

  const {
    tool,
    laserColor,
    laserActive,
    penActive,
    penSession,
    switchTool,
    toggleTool,
    toggleLaserColor,
    closePenSession,
  } = useScreenTools()

  const toolRef = useRef(tool)
  const laserActiveRef = useRef(laserActive)
  const laserColorRef = useRef(laserColor)
  toolRef.current = tool
  laserActiveRef.current = laserActive
  laserColorRef.current = laserColor

  const syncChannelRef = useRef<BroadcastChannel | null>(null)
  if (!isAudienceMode && !syncChannelRef.current) {
    const channel = new BroadcastChannel(AUDIENCE_SYNC_CHANNEL)
    channel.onmessage = ({ data }: MessageEvent<SyncMessage>) => {
      if (data.type === 'REQUEST_STATE') {
        const state = useSlidesStore.getState()
        channel.postMessage({
          type: 'INIT_STATE',
          slideIndex: state.slideIndex,
          animationIndex: animationIndexRef.current,
          viewportSize: state.viewportSize,
          viewportRatio: state.viewportRatio,
          slides: JSON.parse(JSON.stringify(state.slides)),
        } as SyncMessage)
      }
    }
    syncChannelRef.current = channel
  }

  const runAnimation = () => {
    if (inAnimationRef.current) return

    const { animations, autoNext } = getFormatedAnimations()[animationIndexRef.current]
    setAnimationIndex(animationIndexRef.current + 1)

    inAnimationRef.current = true

    let endAnimationCount = 0

    for (const animation of animations) {
      const elRef = queryFika<HTMLElement>(`#screen-element-${animation.elId} [class^=base-element-]`)
      if (!elRef) {
        endAnimationCount += 1
        continue
      }

      const animationName = `${ANIMATION_CLASS_PREFIX}${animation.effect}`

      elRef.style.removeProperty('--animate-duration')
      for (const classname of elRef.classList) {
        if (classname.indexOf(ANIMATION_CLASS_PREFIX) !== -1) elRef.classList.remove(classname, `${ANIMATION_CLASS_PREFIX}animated`)
      }

      elRef.style.setProperty('--animate-duration', `${animation.duration}ms`)
      elRef.classList.add(animationName, `${ANIMATION_CLASS_PREFIX}animated`)

      const handleAnimationEnd = () => {
        if (animation.type !== 'out') {
          elRef.style.removeProperty('--animate-duration')
          elRef.classList.remove(animationName, `${ANIMATION_CLASS_PREFIX}animated`)
        }

        endAnimationCount += 1
        if (endAnimationCount === animations.length) {
          inAnimationRef.current = false
          if (autoNext) runAnimation()
        }
      }
      elRef.addEventListener('animationend', handleAnimationEnd, { once: true })
    }
  }

  useEffect(() => {
    const firstAnimations = getFormatedAnimations()[0]
    if (firstAnimations && firstAnimations.animations.length) {
      const autoExecFirstAnimations = firstAnimations.animations.every(item => item.trigger === 'auto' || item.trigger === 'meantime')
      if (autoExecFirstAnimations) runAnimation()
    }
  }, [])

  const restoreAnimationState = (targetIndex: number) => {
    const currentFormated = getFormatedAnimations()
    for (let i = 0; i < targetIndex && i < currentFormated.length; i++) {
      const { animations } = currentFormated[i]
      for (const animation of animations) {
        if (animation.type !== 'out') continue
        const elRef = queryFika<HTMLElement>(`#screen-element-${animation.elId} [class^=base-element-]`)
        if (!elRef) continue
        const animationName = `${ANIMATION_CLASS_PREFIX}${animation.effect}`
        elRef.style.setProperty('--animate-duration', '0ms')
        elRef.classList.add(animationName, `${ANIMATION_CLASS_PREFIX}animated`)
      }
    }
  }

  const execPrevRef = useRef<(broadcast?: boolean) => void>(() => {})
  const turnSlideToIndexRef = useRef<(index: number) => void>(() => {})

  const revokeAnimation = () => {
    const nextIndex = animationIndexRef.current - 1
    setAnimationIndex(nextIndex)
    const { animations } = getFormatedAnimations()[nextIndex]

    for (const animation of animations) {
      const elRef = queryFika<HTMLElement>(`#screen-element-${animation.elId} [class^=base-element-]`)
      if (!elRef) continue

      elRef.style.removeProperty('--animate-duration')
      for (const classname of elRef.classList) {
        if (classname.indexOf(ANIMATION_CLASS_PREFIX) !== -1) elRef.classList.remove(classname, `${ANIMATION_CLASS_PREFIX}animated`)
      }
    }

    if (animations.every(item => item.type === 'attention')) execPrevRef.current(false)
  }

  const closeAutoPlay = () => {
    if (autoPlayTimerRef.current !== null) {
      clearInterval(autoPlayTimerRef.current)
      autoPlayTimerRef.current = null
      setAutoPlayTimerState(null)
    }
  }

  useEffect(() => () => closeAutoPlay(), [])

  const throttleMassage = useMemo(() => throttle(function (msg: string) {
    message.success(msg)
  }, 1000, { leading: true, trailing: false }), [])

  const execPrev = (broadcast = true) => {
    if (broadcast) syncChannelRef.current?.postMessage({ type: 'EXEC_PREV' } as SyncMessage)
    const currentFormated = getFormatedAnimations()
    if (currentFormated.length && animationIndexRef.current > 0) {
      revokeAnimation()
    }
    else if (useSlidesStore.getState().slideIndex > 0) {
      slidesStore.updateSlideIndex(useSlidesStore.getState().slideIndex - 1)
      const nextSlideIndex = useSlidesStore.getState().slideIndex
      if (nextSlideIndex < playedSlidesMinIndexRef.current) {
        setAnimationIndex(0)
        playedSlidesMinIndexRef.current = nextSlideIndex
      }
      else setAnimationIndex(getFormatedAnimations().length)
    }
    else {
      if (loopPlayRef.current) turnSlideToIndexRef.current(useSlidesStore.getState().slides.length - 1)
      else throttleMassage(getLL().screen.play.alreadyFirstSlide())
    }
    inAnimationRef.current = false
  }
  execPrevRef.current = execPrev

  const execNext = () => {
    syncChannelRef.current?.postMessage({ type: 'EXEC_NEXT' } as SyncMessage)
    const currentFormated = getFormatedAnimations()
    const state = useSlidesStore.getState()
    if (currentFormated.length && animationIndexRef.current < currentFormated.length) {
      runAnimation()
    }
    else if (state.slideIndex < state.slides.length - 1) {
      slidesStore.updateSlideIndex(state.slideIndex + 1)
      setAnimationIndex(0)
      inAnimationRef.current = false
    }
    else {
      if (loopPlayRef.current) turnSlideToIndexRef.current(0)
      else {
        throttleMassage(getLL().screen.play.alreadyLastSlide())
        closeAutoPlay()
      }
      inAnimationRef.current = false
    }
  }

  const autoPlay = () => {
    closeAutoPlay()
    message.success(getLL().screen.play.autoPlayStarted())
    const timer = setInterval(() => execNext(), autoPlayIntervalRef.current)
    autoPlayTimerRef.current = timer
    setAutoPlayTimerState(timer)
  }

  const setAutoPlayInterval = (interval: number) => {
    closeAutoPlay()
    autoPlayIntervalRef.current = interval
    setAutoPlayIntervalState(interval)
    autoPlay()
  }

  const execNextRef = useRef(execNext)
  execNextRef.current = execNext

  const mousewheelListener = useMemo(() => throttle(function (e: WheelEvent) {
    if (e.deltaY < 0) execPrevRef.current()
    else if (e.deltaY > 0) execNextRef.current()
  }, 500, { leading: true, trailing: false }), [])

  const touchStartListener = (e: TouchEvent) => {
    touchInfoRef.current = {
      x: e.changedTouches[0].pageX,
      y: e.changedTouches[0].pageY,
    }
  }
  const touchEndListener = (e: TouchEvent) => {
    if (!touchInfoRef.current) return

    const offsetX = Math.abs(touchInfoRef.current.x - e.changedTouches[0].pageX)
    const offsetY = e.changedTouches[0].pageY - touchInfoRef.current.y

    if (Math.abs(offsetY) > offsetX && Math.abs(offsetY) > 50) {
      touchInfoRef.current = null
      if (offsetY > 0) execPrev()
      else execNext()
    }
  }

  const keydownListener = useMemo(() => throttle(function (e: KeyboardEvent) {
    const key = e.key.toUpperCase()

    if (key === KEYS.UP || key === KEYS.LEFT || key === KEYS.PAGEUP) execPrevRef.current()
    else if (
      key === KEYS.DOWN ||
      key === KEYS.RIGHT ||
      key === KEYS.SPACE ||
      key === KEYS.ENTER ||
      key === KEYS.PAGEDOWN
    ) execNextRef.current()
  }, 500, { leading: true, trailing: false }), [])

  const isTypingTarget = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null
    if (!target) return false
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return true
    return Boolean(target.isContentEditable)
  }

  const LASER_HOLD_IGNORE = '.presenter-dock, .writing-board-tool, .presenter-view .rail, .presenter-view .pane-head, [data-tippy-root], .tippy-box'
  const LASER_HOLD_MOVE = 5

  const rightHoldRef = useRef(false)
  const rightHoldAsLaserRef = useRef(false)
  const suppressContextMenuRef = useRef(false)
  const toolBeforeHoldRef = useRef<ScreenTool | null>(null)
  const holdXRef = useRef(0)
  const holdYRef = useRef(0)
  const clearSuppressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const beginHoldLaser = () => {
    if (rightHoldAsLaserRef.current) return
    rightHoldAsLaserRef.current = true
    toolBeforeHoldRef.current = toolRef.current
    if (toolRef.current !== 'laser') switchTool('laser')
  }

  const onLaserKeydown = (e: KeyboardEvent) => {
    if (isTypingTarget(e)) return
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const key = e.key.toUpperCase()

    if (key === KEYS.L) {
      if (e.repeat) return
      e.preventDefault()
      toggleTool('laser')
      return
    }

    if (key === KEYS.ESC && laserActiveRef.current) {
      e.preventDefault()
      e.stopImmediatePropagation()
      switchTool(null)
      return
    }

    keydownListener(e)
  }

  const onRightPointerDown = (e: PointerEvent) => {
    if (e.button !== 2) return
    if ((e.target as HTMLElement | null)?.closest?.(LASER_HOLD_IGNORE)) return
    suppressContextMenuRef.current = false
    rightHoldRef.current = true
    rightHoldAsLaserRef.current = false
    holdXRef.current = e.clientX
    holdYRef.current = e.clientY
  }

  const onRightPointerMove = (e: PointerEvent) => {
    if (!rightHoldRef.current || rightHoldAsLaserRef.current) return
    if (Math.hypot(e.clientX - holdXRef.current, e.clientY - holdYRef.current) < LASER_HOLD_MOVE) return
    beginHoldLaser()
  }

  const onRightPointerUp = (e: PointerEvent) => {
    if (e.type !== 'pointercancel' && e.button !== 2) return
    if (rightHoldAsLaserRef.current) {
      suppressContextMenuRef.current = true
      switchTool(toolBeforeHoldRef.current)
      if (clearSuppressTimerRef.current) clearTimeout(clearSuppressTimerRef.current)
      clearSuppressTimerRef.current = setTimeout(() => {
        suppressContextMenuRef.current = false
        clearSuppressTimerRef.current = null
      }, 0)
    }
    rightHoldRef.current = false
    rightHoldAsLaserRef.current = false
  }

  const onContextMenu = (e: MouseEvent) => {
    if (!suppressContextMenuRef.current) return
    e.preventDefault()
    e.stopImmediatePropagation()
    suppressContextMenuRef.current = false
  }

  const onLaserKeydownRef = useRef(onLaserKeydown)
  const onRightPointerDownRef = useRef(onRightPointerDown)
  const onRightPointerMoveRef = useRef(onRightPointerMove)
  const onRightPointerUpRef = useRef(onRightPointerUp)
  const onContextMenuRef = useRef(onContextMenu)
  onLaserKeydownRef.current = onLaserKeydown
  onRightPointerDownRef.current = onRightPointerDown
  onRightPointerMoveRef.current = onRightPointerMove
  onRightPointerUpRef.current = onRightPointerUp
  onContextMenuRef.current = onContextMenu

  useEffect(() => {
    if (isAudienceMode) return
    const keydown = (e: KeyboardEvent) => onLaserKeydownRef.current(e)
    const pointerDown = (e: PointerEvent) => onRightPointerDownRef.current(e)
    const pointerMove = (e: PointerEvent) => onRightPointerMoveRef.current(e)
    const pointerUp = (e: PointerEvent) => onRightPointerUpRef.current(e)
    const contextMenu = (e: MouseEvent) => onContextMenuRef.current(e)
    document.addEventListener('keydown', keydown, true)
    window.addEventListener('pointerdown', pointerDown)
    window.addEventListener('pointermove', pointerMove)
    window.addEventListener('pointerup', pointerUp)
    window.addEventListener('pointercancel', pointerUp)
    window.addEventListener('contextmenu', contextMenu, true)
    return () => {
      document.removeEventListener('keydown', keydown, true)
      window.removeEventListener('pointerdown', pointerDown)
      window.removeEventListener('pointermove', pointerMove)
      window.removeEventListener('pointerup', pointerUp)
      window.removeEventListener('pointercancel', pointerUp)
      window.removeEventListener('contextmenu', contextMenu, true)
      if (clearSuppressTimerRef.current) clearTimeout(clearSuppressTimerRef.current)
      syncChannelRef.current?.close()
      syncChannelRef.current = null
    }
  }, [])

  const turnPrevSlide = () => {
    slidesStore.updateSlideIndex(useSlidesStore.getState().slideIndex - 1)
    setAnimationIndex(0)
  }
  const turnNextSlide = () => {
    slidesStore.updateSlideIndex(useSlidesStore.getState().slideIndex + 1)
    setAnimationIndex(0)
  }

  const turnSlideToIndex = (index: number) => {
    syncChannelRef.current?.postMessage({ type: 'TURN_TO_INDEX', index } as SyncMessage)
    slidesStore.updateSlideIndex(index)
    setAnimationIndex(0)
  }
  turnSlideToIndexRef.current = turnSlideToIndex

  const turnSlideToId = (id: string) => {
    const index = useSlidesStore.getState().slides.findIndex(slide => slide.id === id)
    if (index !== -1) {
      syncChannelRef.current?.postMessage({ type: 'TURN_TO_ID', id } as SyncMessage)
      slidesStore.updateSlideIndex(index)
      setAnimationIndex(0)
    }
  }

  const handleLaserMove = (e: MouseEvent | PointerEvent) => {
    const slideEl = queryFika<HTMLElement>('.screen-slide-list .slide-item.current .slide-content')
    if (!slideEl) return
    const rect = slideEl.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    syncChannelRef.current?.postMessage({
      type: 'LASER_PEN_MOVE',
      x,
      y,
      color: laserColorRef.current,
    } as SyncMessage)
  }

  const throttledHandleLaserMove = useMemo(() => throttle(handleLaserMove, 30, { leading: true, trailing: true }), [])
  const laserWatchReady = useRef(false)

  useEffect(() => {
    if (laserActive) {
      document.addEventListener('pointermove', throttledHandleLaserMove)
    }
    else {
      document.removeEventListener('pointermove', throttledHandleLaserMove)
      if (laserWatchReady.current) {
        syncChannelRef.current?.postMessage({ type: 'LASER_PEN_OFF' } as SyncMessage)
      }
    }
    laserWatchReady.current = true
    return () => {
      document.removeEventListener('pointermove', throttledHandleLaserMove)
    }
  }, [laserActive, throttledHandleLaserMove])

  const broadcastExit = () => {
    syncChannelRef.current?.postMessage({ type: 'EXIT' } as SyncMessage)
  }

  const handleSlideClick = (e: MouseEvent) => {
    if (laserActiveRef.current) return
    if (e.button !== 0) return
    execNext()
  }

  return {
    autoPlayTimer,
    autoPlayInterval,
    setAutoPlayInterval,
    autoPlay,
    closeAutoPlay,
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
    setAnimationIndex,
    restoreAnimationState,
    laserActive,
    laserColor,
    penActive,
    penSession,
    switchTool,
    toggleTool,
    toggleLaserColor,
    closePenSession,
    broadcastExit,
  }
}
