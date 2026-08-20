import { memo, useCallback, useEffect, useId, useRef } from 'react'

import { useSlidesStore } from '@/store'
import type { Slide } from '@/types/slides'
import { paintSlideToCanvas } from '@/paint/slidePainter'
import { scheduleSlidePaint, type PaintPriority } from '@/paint/scheduler'
import { arePaintedSlideIdentitiesEqual, type PaintedSlide } from './paintedSlide'
import { bindStyles } from '@/utils/cssm'
import styles from './index.module.scss'

const cx = bindStyles(styles)

export type ICanvasSlideThumbProps = {
  slide: Slide
  width: number
  showPlaceholders?: boolean
}

const EDIT_DEBOUNCE_MS = 100

/**
 * A final-DPR Canvas2D projection of Slide JSON. Existing pixels remain in the
 * backing store while an edit is debounced or an async asset resolves.
 */
const CanvasSlideThumb = memo(({ slide, width, showPlaceholders = false }: ICanvasSlideThumbProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const paintKey = useId()
  const viewportSize = useSlidesStore(s => s.viewportSize)
  const viewportRatio = useSlidesStore(s => s.viewportRatio)
  const theme = useSlidesStore(s => s.theme)
  const latest = useRef({ slide, width, showPlaceholders, viewportSize, viewportRatio, theme })
  const priority = useRef<PaintPriority>('visible')
  const mounted = useRef(true)
  latest.current = { slide, width, showPlaceholders, viewportSize, viewportRatio, theme }

  const schedule = useCallback(() => scheduleSlidePaint(paintKey, () => {
    const canvas = canvasRef.current
    if (!canvas || !mounted.current) return
    const value = latest.current
    paintSlideToCanvas(canvas, {
      slide: value.slide,
      theme: value.theme,
      viewportSize: value.viewportSize,
      viewportRatio: value.viewportRatio,
      cssWidth: value.width,
      cssHeight: value.width * value.viewportRatio,
      dpr: window.devicePixelRatio || 1,
      showPlaceholders: value.showPlaceholders,
      invalidate: () => {
        if (mounted.current) schedule()
      },
    })
    canvas.dataset.canvasPainted = value.slide.id
  }, priority.current), [paintKey])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const firstPaint = !canvas?.dataset.canvasPainted
    if (firstPaint) return schedule()
    const timer = window.setTimeout(schedule, EDIT_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [slide, theme, viewportSize, viewportRatio, width, showPlaceholders, schedule])

  useEffect(() => {
    const host = hostRef.current
    if (!host || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => {
      priority.current = entries[0]?.isIntersecting ? 'visible' : 'background'
      if (entries[0]?.isIntersecting) schedule()
    }, { rootMargin: '240px' })
    observer.observe(host)
    return () => observer.disconnect()
  }, [schedule])

  useEffect(() => {
    const repaint = () => schedule()
    window.addEventListener('resize', repaint, { passive: true })
    window.visualViewport?.addEventListener('resize', repaint, { passive: true })
    document.fonts?.addEventListener?.('loadingdone', repaint)
    void document.fonts?.ready?.then(repaint).catch(() => {})
    return () => {
      window.removeEventListener('resize', repaint)
      window.visualViewport?.removeEventListener('resize', repaint)
      document.fonts?.removeEventListener?.('loadingdone', repaint)
    }
  }, [schedule])

  return (
    <div
      ref={hostRef}
      className={cx('canvas-slide-thumb')}
      data-canvas-slide-thumb=""
      style={{ width, height: width * viewportRatio }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} />
    </div>
  )
}, (prev, next) => (
  prev.width === next.width
  && (prev.showPlaceholders ?? false) === (next.showPlaceholders ?? false)
  && arePaintedSlideIdentitiesEqual(prev.slide as PaintedSlide, next.slide as PaintedSlide)
))

CanvasSlideThumb.displayName = 'CanvasSlideThumb'

export default CanvasSlideThumb
