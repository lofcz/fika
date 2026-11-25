import { recordRender } from '@/utils/renderMetrics'
import { memo, useCallback, useEffect, useId, useLayoutEffect, useRef } from 'react'

import type { Slide } from '@/types/slides'
import { paintSlideToCanvas } from '@/paint/slidePainter'
import {
  hasPendingRastersForOwner,
  isThumbnailScrolling,
  releaseRasterOwner,
  updateRasterOwnerPriority,
  withRasterRequestContext,
} from '@/paint/rasterResources'
import { scheduleSlidePaint, type PaintPriority } from '@/paint/scheduler'
import { getCurrentDpr, isPaneDragging } from '@/views/Editor/Thumbnails/paneSize'
import { arePaintedSlideIdentitiesEqual, useThumbViewportTheme, type PaintedSlide } from './paintedSlide'
import {
  blitCachedThumb,
  buildThumbPaintKey,
  evictCachedThumb,
  getCachedThumbEntry,
  putCachedThumbFromCanvas,
  slideAffectedByFontChanges,
} from './thumbBitmapCache'
import { observeThumbVisibility, registerThumbRuntimeListener } from './thumbRailRuntime'
import { bindStyles } from '@/utils/cssm'
import styles from './index.module.scss'

const cx = bindStyles(styles)

export type ICanvasSlideThumbProps = {
  slide: Slide
  width: number
  showPlaceholders?: boolean
}

const EDIT_DEBOUNCE_MS = 100
const ASYNC_SETTLE_DELAY_MS = 16
const ASYNC_PENDING_WAIT_MS = 280
/** Provisional TTL for frames waiting on paused/in-flight async rasters (evicted immediately on invalidate). */
const INCOMPLETE_THUMB_TTL_MS = 15_000

/**
 * A final-DPR Canvas2D projection of Slide JSON backed by a byte-bounded
 * bitmap LRU cache so virtualizer remounts blit synchronously without blank
 * frames or redundant repaints.
 */
const CanvasSlideThumb = memo(({ slide, width, showPlaceholders = false }: ICanvasSlideThumbProps) => {
  recordRender('CanvasSlideThumb')
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const paintKey = useId()
  const { viewportSize, viewportRatio, theme } = useThumbViewportTheme()
  const latest = useRef({ slide, width, showPlaceholders, viewportSize, viewportRatio, theme })
  const priority = useRef<PaintPriority>('visible')
  const mounted = useRef(true)
  const lastPaintedSigRef = useRef('')
  const paintedCompleteRef = useRef(false)
  const lastDprRef = useRef(getCurrentDpr())
  const cancelScheduledRef = useRef<(() => void) | null>(null)
  const asyncInvalidateTimerRef = useRef(0)
  const asyncInvalidateFirstRef = useRef(0)
  latest.current = { slide, width, showPlaceholders, viewportSize, viewportRatio, theme }

  const computePaintTarget = useCallback(() => {
    const value = latest.current
    const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
    const cssWidth = Math.max(1, value.width)
    const cssHeight = Math.max(1, value.width * value.viewportRatio)
    const pixelWidth = Math.max(1, Math.round(cssWidth * dpr))
    const pixelHeight = Math.max(1, Math.round(cssHeight * dpr))
    const sig = buildThumbPaintKey({
      slide: value.slide,
      theme: value.theme,
      viewportSize: value.viewportSize,
      viewportRatio: value.viewportRatio,
      pixelWidth,
      pixelHeight,
      showPlaceholders: value.showPlaceholders,
    })
    return { value, dpr, cssWidth, cssHeight, pixelWidth, pixelHeight, sig }
  }, [])

  const scheduleRef = useRef<(force?: boolean) => () => void>(() => () => {})

  const scheduleAsyncRepaint = useCallback(() => {
    if (!mounted.current || isThumbnailScrolling()) return
    // When all rasters for this thumb have settled, repaint promptly; while
    // additional rasters on the same slide are still in flight, coalesce into
    // a single settle paint instead of repainting per formula.
    const stillPending = hasPendingRastersForOwner(paintKey)
    const now = performance.now()
    if (!asyncInvalidateFirstRef.current) asyncInvalidateFirstRef.current = now
    const delay = stillPending
      ? Math.max(ASYNC_SETTLE_DELAY_MS, ASYNC_PENDING_WAIT_MS - (now - asyncInvalidateFirstRef.current))
      : ASYNC_SETTLE_DELAY_MS
    if (asyncInvalidateTimerRef.current) window.clearTimeout(asyncInvalidateTimerRef.current)
    asyncInvalidateTimerRef.current = window.setTimeout(() => {
      asyncInvalidateTimerRef.current = 0
      asyncInvalidateFirstRef.current = 0
      if (!mounted.current || isThumbnailScrolling()) return
      scheduleRef.current(true)
    }, delay)
  }, [paintKey])

  const schedule = useCallback((force = false) => {
    const target = computePaintTarget()
    const canvas = canvasRef.current
    // During pane-gutter drag, CSS scales the already-painted bitmap cleanly;
    // skip repainting and avoid polluting the LRU with intermediate sizes.
    if (isPaneDragging() && canvas?.dataset.canvasPainted === target.value.slide.id) {
      return () => {}
    }
    if (
      !force
      && lastPaintedSigRef.current === target.sig
      && canvas?.dataset.canvasPainted === target.value.slide.id
      && (paintedCompleteRef.current || isThumbnailScrolling())
    ) {
      return () => {}
    }
    if (!force && canvas) {
      const cached = getCachedThumbEntry(target.sig)
      if (cached && blitCachedThumb(canvas, cached.surface, target.pixelWidth, target.pixelHeight)) {
        canvas.dataset.canvasPainted = target.value.slide.id
        lastPaintedSigRef.current = target.sig
        paintedCompleteRef.current = cached.complete
        lastDprRef.current = target.dpr
        cancelScheduledRef.current?.()
        cancelScheduledRef.current = null
        // Complete frames are settled; provisional frames defer settling until
        // scroll stops so warm scroll-back stays free of mid-scroll repaints.
        if (cached.complete || isThumbnailScrolling()) return () => {}
      }
    }
    cancelScheduledRef.current?.()
    const cancel = scheduleSlidePaint(paintKey, () => {
      cancelScheduledRef.current = null
      const liveCanvas = canvasRef.current
      if (!liveCanvas || !mounted.current) return
      const live = computePaintTarget()
      if (
        !force
        && lastPaintedSigRef.current === live.sig
        && liveCanvas.dataset.canvasPainted === live.value.slide.id
        && (paintedCompleteRef.current || isThumbnailScrolling())
      ) {
        return
      }
      if (!force) {
        const hit = getCachedThumbEntry(live.sig)
        if (hit && blitCachedThumb(liveCanvas, hit.surface, live.pixelWidth, live.pixelHeight)) {
          liveCanvas.dataset.canvasPainted = live.value.slide.id
          lastPaintedSigRef.current = live.sig
          paintedCompleteRef.current = hit.complete
          lastDprRef.current = live.dpr
          if (hit.complete || isThumbnailScrolling()) return
        }
      }
      const capturedSig = live.sig
      let invalidated = false
      const rasterPriority = priority.current === 'visible' ? 'visible' : 'overscan'
      const result = withRasterRequestContext(paintKey, rasterPriority, () => paintSlideToCanvas(liveCanvas, {
        slide: live.value.slide,
        theme: live.value.theme,
        viewportSize: live.value.viewportSize,
        viewportRatio: live.value.viewportRatio,
        cssWidth: live.cssWidth,
        cssHeight: live.cssHeight,
        dpr: live.dpr,
        showPlaceholders: live.value.showPlaceholders,
        invalidate: () => {
          // Always evict the cached pre-resource frame even if this thumb unmounted.
          evictCachedThumb(capturedSig)
          if (invalidated) return
          invalidated = true
          paintedCompleteRef.current = false
          if (lastPaintedSigRef.current === capturedSig) lastPaintedSigRef.current = ''
          if (mounted.current) scheduleAsyncRepaint()
        },
      }))
      liveCanvas.dataset.canvasPainted = live.value.slide.id
      lastPaintedSigRef.current = capturedSig
      paintedCompleteRef.current = result.complete && !invalidated
      lastDprRef.current = live.dpr
      // Complete paints are cached until invalidated/evicted; provisional frames
      // waiting on paused/in-flight async rasters get a short TTL (and evict
      // immediately when invalidate fires) so errored resources never stick.
      if (!invalidated && !isPaneDragging()) {
        putCachedThumbFromCanvas(capturedSig, liveCanvas, result.complete ? 0 : INCOMPLETE_THUMB_TTL_MS, live.value.slide.id)
      }
    }, priority.current)
    cancelScheduledRef.current = cancel
    return cancel
  }, [computePaintTarget, paintKey, scheduleAsyncRepaint])
  scheduleRef.current = schedule

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      cancelScheduledRef.current?.()
      cancelScheduledRef.current = null
      releaseRasterOwner(paintKey)
      if (asyncInvalidateTimerRef.current) {
        window.clearTimeout(asyncInvalidateTimerRef.current)
        asyncInvalidateTimerRef.current = 0
      }
      asyncInvalidateFirstRef.current = 0
    }
  }, [paintKey])

  // Synchronous cache blit before first browser paint so scroll remounts never flash blank.
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const target = computePaintTarget()
    if (lastPaintedSigRef.current === target.sig && canvas.dataset.canvasPainted === target.value.slide.id) return
    const cached = getCachedThumbEntry(target.sig)
    if (cached && blitCachedThumb(canvas, cached.surface, target.pixelWidth, target.pixelHeight)) {
      canvas.dataset.canvasPainted = target.value.slide.id
      lastPaintedSigRef.current = target.sig
      paintedCompleteRef.current = cached.complete
      lastDprRef.current = target.dpr
    }
  }, [slide, theme, viewportSize, viewportRatio, width, showPlaceholders, computePaintTarget])

  useEffect(() => {
    const canvas = canvasRef.current
    const target = computePaintTarget()
    if (
      lastPaintedSigRef.current === target.sig
      && canvas?.dataset.canvasPainted === target.value.slide.id
      && (paintedCompleteRef.current || isThumbnailScrolling())
    ) {
      return
    }
    const firstPaint = !canvas?.dataset.canvasPainted
    if (firstPaint || !paintedCompleteRef.current) return schedule(!paintedCompleteRef.current && lastPaintedSigRef.current === target.sig)
    const timer = window.setTimeout(() => { schedule() }, EDIT_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [slide, theme, viewportSize, viewportRatio, width, showPlaceholders, computePaintTarget, schedule])

  useEffect(() => {
    let overscanTimer = 0
    const unsubRuntime = registerThumbRuntimeListener({
      onDprChange: nextDpr => {
        if (nextDpr === lastDprRef.current) return
        lastDprRef.current = nextDpr
        scheduleRef.current()
      },
      onPaneDragEnd: () => {
        if (mounted.current) scheduleRef.current()
      },
      onScrollIdle: () => {
        // Settle any mounted thumb that blitted/painted a provisional frame while
        // scrolling so fast flings never leave visible slides on fallback text.
        // Wake visible thumbs immediately and stagger overscan thumbs slightly so
        // visible slides claim priority first.
        if (!mounted.current || paintedCompleteRef.current) return
        if (priority.current === 'visible') {
          scheduleRef.current(true)
          return
        }
        if (overscanTimer) window.clearTimeout(overscanTimer)
        overscanTimer = window.setTimeout(() => {
          overscanTimer = 0
          if (mounted.current && !paintedCompleteRef.current && !isThumbnailScrolling()) {
            scheduleRef.current(true)
          }
        }, 120)
      },
      onCacheEviction: evictedKey => {
        // If an older unmounted instance's async raster finished after this thumb
        // remounted and blitted the provisional frame, wake this instance to paint
        // the settled pixels.
        if (lastPaintedSigRef.current === evictedKey) {
          lastPaintedSigRef.current = ''
          paintedCompleteRef.current = false
          scheduleAsyncRepaint()
        }
      },
      onFitScaleChange: elementId => {
        if (latest.current.slide.elements.some(element => element.id === elementId)) {
          scheduleRef.current()
        }
      },
      onFontChanges: families => {
        if (slideAffectedByFontChanges(latest.current.slide, latest.current.theme.fontName, families)) {
          scheduleRef.current()
        }
      },
    })
    const host = hostRef.current
    const unsubVisibility = host
      ? observeThumbVisibility(host, visible => {
          priority.current = visible ? 'visible' : 'background'
          updateRasterOwnerPriority(paintKey, visible ? 'visible' : 'overscan')
          if (!visible) return
          const target = computePaintTarget()
          if (
            lastPaintedSigRef.current !== target.sig
            || canvasRef.current?.dataset.canvasPainted !== target.value.slide.id
            || (!paintedCompleteRef.current && !isThumbnailScrolling())
          ) {
            scheduleRef.current(!paintedCompleteRef.current && lastPaintedSigRef.current === target.sig)
          }
        })
      : () => {}
    if (document.fonts?.status === 'loading') {
      void document.fonts.ready.then(() => {
        if (mounted.current) scheduleRef.current()
      }).catch(() => {})
    }
    return () => {
      unsubRuntime()
      unsubVisibility()
      if (overscanTimer) window.clearTimeout(overscanTimer)
    }
  }, [computePaintTarget, paintKey, scheduleAsyncRepaint])

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
