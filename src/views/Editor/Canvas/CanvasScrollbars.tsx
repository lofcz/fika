import { bindStyles } from '@/utils/cssm'
import styles from './CanvasScrollbars.module.scss'
const cx = bindStyles(styles)
import { useCallback, memo, useState, useEffect, useRef } from 'react'

interface ViewportStyles {
  width: number
  height: number
  left: number
  top: number
}

export type ICanvasScrollbarsProps = {
  canvasRef: HTMLElement | { current?: HTMLElement | null } | null
  viewportStyles: ViewportStyles
  canvasScale: number
  pan: (dx: number, dy: number) => void
}

const TRACK_MARGIN = 4
const MIN_THUMB_LENGTH = 24

function canvasEl(ref: ICanvasScrollbarsProps['canvasRef']) {
  if (!ref) return null
  if (ref instanceof Element) return ref
  if (typeof ref === 'object' && 'current' in ref) return ref.current ?? null
  return null
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const getAxisMetrics = (canvasSize: number, contentStart: number, contentSize: number) => {
  const scrollMax = contentSize - canvasSize
  const visible = canvasSize > 0 && scrollMax > 0.5
  if (!visible) {
    return { visible: false, thumbStart: 0, thumbLength: 0, scrollMax: 0, scrollOffset: 0, trackLength: 0 }
  }
  const scrollOffset = clamp(-contentStart, 0, scrollMax)
  const trackLength = canvasSize - TRACK_MARGIN * 2
  const thumbLength = Math.max(MIN_THUMB_LENGTH, canvasSize / contentSize * trackLength)
  const thumbStart = TRACK_MARGIN + scrollOffset / scrollMax * (trackLength - thumbLength)
  return { visible, thumbStart, thumbLength, scrollMax, scrollOffset, trackLength }
}

const CanvasScrollbars = memo((props: ICanvasScrollbarsProps) => {
  const { canvasRef, viewportStyles, canvasScale, pan } = props
  const [canvasWidth, setCanvasWidth] = useState(0)
  const [canvasHeight, setCanvasHeight] = useState(0)
  const viewportStylesRef = useRef(viewportStyles)
  viewportStylesRef.current = viewportStyles
  const panRef = useRef(pan)
  panRef.current = pan

  useEffect(() => {
    let resizeObserver: ResizeObserver | null = null
    let raf = 0
    const observe = () => {
      const el = canvasEl(canvasRef)
      if (!el) {
        raf = requestAnimationFrame(observe)
        return
      }
      resizeObserver = new ResizeObserver(() => {
        const host = canvasEl(canvasRef)
        setCanvasWidth(host?.clientWidth || 0)
        setCanvasHeight(host?.clientHeight || 0)
      })
      resizeObserver.observe(el)
      setCanvasWidth(el.clientWidth)
      setCanvasHeight(el.clientHeight)
    }
    observe()
    return () => {
      if (raf) cancelAnimationFrame(raf)
      resizeObserver?.disconnect()
    }
  }, [canvasRef])

  const horizontal = getAxisMetrics(canvasWidth, viewportStyles.left, viewportStyles.width * canvasScale)
  const vertical = getAxisMetrics(canvasHeight, viewportStyles.top, viewportStyles.height * canvasScale)
  const [draggingAxis, setDraggingAxis] = useState<'h' | 'v' | null>(null)

  const startDragThumb = useCallback((e: React.MouseEvent, axis: 'h' | 'v') => {
    if (e.button !== 0) return
    const metrics = axis === 'h'
      ? getAxisMetrics(canvasWidth, viewportStylesRef.current.left, viewportStylesRef.current.width * canvasScale)
      : getAxisMetrics(canvasHeight, viewportStylesRef.current.top, viewportStylesRef.current.height * canvasScale)
    const scrollableTrack = metrics.trackLength - metrics.thumbLength
    if (!metrics.visible || scrollableTrack <= 0) return

    const contentPerTrackPixel = metrics.scrollMax / scrollableTrack
    const startOffset = metrics.scrollOffset
    const scrollMax = metrics.scrollMax
    setDraggingAxis(axis)
    const startX = e.clientX
    const startY = e.clientY

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = axis === 'h' ? moveEvent.clientX - startX : moveEvent.clientY - startY
      const desiredOffset = clamp(startOffset + delta * contentPerTrackPixel, 0, scrollMax)
      const currentStart = axis === 'h' ? viewportStylesRef.current.left : viewportStylesRef.current.top
      const panDelta = -desiredOffset - currentStart
      if (!panDelta) return
      if (axis === 'h') panRef.current(panDelta, 0)
      else panRef.current(0, panDelta)
    }
    const onMouseUp = () => {
      setDraggingAxis(null)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [canvasWidth, canvasHeight, canvasScale])

  return (
    <>
      {horizontal.visible ? (
        <div className={cx('scrollbar-track', 'horizontal')} onMouseDown={e => { e.stopPropagation(); e.preventDefault() }}>
          <div
            className={cx('scrollbar-thumb', { dragging: draggingAxis === 'h' })}
            style={{ left: horizontal.thumbStart + 'px', width: horizontal.thumbLength + 'px' }}
            onMouseDown={e => { e.stopPropagation(); e.preventDefault(); startDragThumb(e, 'h') }}
          />
        </div>
      ) : null}
      {vertical.visible ? (
        <div className={cx('scrollbar-track', 'vertical')} onMouseDown={e => { e.stopPropagation(); e.preventDefault() }}>
          <div
            className={cx('scrollbar-thumb', { dragging: draggingAxis === 'v' })}
            style={{ top: vertical.thumbStart + 'px', height: vertical.thumbLength + 'px' }}
            onMouseDown={e => { e.stopPropagation(); e.preventDefault(); startDragThumb(e, 'v') }}
          />
        </div>
      ) : null}
    </>
  )
})

export default CanvasScrollbars
