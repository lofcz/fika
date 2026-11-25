import { memo, useEffect, useRef, useState, type CSSProperties, type DragEventHandler } from 'react'
import type { ImageMediaState } from '@/types/slides'
import { useI18nContext } from '@/i18n/useI18nContext'
import { bindStyles } from '@/utils/cssm'
import {
  getCachedAnimatedImage,
  probeAnimatedImage,
  supportsImageDecoderForMime,
  type AnimatedImageAsset,
  type AnimatedImageFormat,
} from '@/utils/animatedImage'
import { useDocumentHidden } from '@/utils/animatedImagePlayback'
import ImageMediaSlot from './ImageMediaSlot'
import slotStyles from './ImageMediaSlot.module.scss'
import { useImageBitmapState } from './useImageBitmap'

const cxSlot = bindStyles(slotStyles)

const MIN_FRAME_DURATION_MS = 20
const DEFAULT_FRAME_DURATION_MS = 100

type AnimationEngineMode = 'idle' | 'decoder' | 'img'

export type IImageBitmapSurfaceProps = {
  src: string
  mediaState?: ImageMediaState
  altText?: string
  replaceHint?: string
  className?: string
  style?: CSSProperties
  draggable?: boolean
  onDragStart?: DragEventHandler<HTMLElement>
  /** When true (active slide only), detect and play animated GIF/WebP/AVIF/APNG frames. */
  animate?: boolean
  /** Pause playback while keeping the current frame frozen on the canvas. */
  paused?: boolean
  /** Notifies host elements when this image is confirmed animated (or static/cleared). */
  onAnimatedChange?: (format: AnimatedImageFormat | null) => void
}

const ImageBitmapSurface = memo((props: IImageBitmapSurfaceProps) => {
  const {
    src,
    mediaState,
    altText,
    replaceHint,
    className,
    style,
    draggable = false,
    onDragStart,
    animate = false,
    paused = false,
    onAnimatedChange,
  } = props
  const { LL } = useI18nContext()
  const explicitPending = mediaState?.status === 'pending'
  const explicitError = mediaState?.status === 'error'
  const effectiveSrc = explicitPending || explicitError ? '' : src
  const { bitmap, status } = useImageBitmapState(effectiveSrc)
  const documentHidden = useDocumentHidden()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fallbackImgRef = useRef<HTMLImageElement>(null)

  const [animatedAsset, setAnimatedAsset] = useState<AnimatedImageAsset | null>(() => {
    if (!animate || !effectiveSrc) return null
    return getCachedAnimatedImage(effectiveSrc) ?? null
  })
  const [engineMode, setEngineMode] = useState<AnimationEngineMode>('idle')

  const onAnimatedChangeRef = useRef(onAnimatedChange)
  onAnimatedChangeRef.current = onAnimatedChange

  // Track whether the canvas currently holds a live decoded animation frame so
  // static bitmap redraws don't clobber a paused mid-animation frame.
  const hasAnimatedFrameRef = useRef(false)
  const lastBitmapSrcRef = useRef('')

  const ready = status === 'loaded' && !!bitmap
  const isPlaying = animate && !!animatedAsset && ready && !paused && !documentHidden

  // Draw the static frame-0 bitmap whenever loaded (or when src changed).
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !bitmap) return
    if (hasAnimatedFrameRef.current && lastBitmapSrcRef.current === effectiveSrc) return
    lastBitmapSrcRef.current = effectiveSrc
    if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
      canvas.width = bitmap.width
      canvas.height = bitmap.height
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0)
  }, [bitmap, effectiveSrc])

  // Probe whether this image is multi-frame animated (only on active slides).
  useEffect(() => {
    hasAnimatedFrameRef.current = false
    if (!animate || !effectiveSrc || !ready) {
      setAnimatedAsset(null)
      setEngineMode('idle')
      onAnimatedChangeRef.current?.(null)
      return
    }

    let cancelled = false
    const cached = getCachedAnimatedImage(effectiveSrc)
    const resolveEngine = async (asset: AnimatedImageAsset | null) => {
      if (cancelled) return
      if (!asset) {
        setAnimatedAsset(null)
        setEngineMode('idle')
        onAnimatedChangeRef.current?.(null)
        return
      }
      const decoderOk = await supportsImageDecoderForMime(asset.mimeType)
      if (cancelled) return
      setAnimatedAsset(asset)
      setEngineMode(decoderOk ? 'decoder' : 'img')
      onAnimatedChangeRef.current?.(asset.format)
    }

    if (cached !== undefined) {
      void resolveEngine(cached)
    }
    else {
      void probeAnimatedImage(effectiveSrc).then(resolveEngine)
    }

    return () => {
      cancelled = true
    }
  }, [animate, effectiveSrc, ready])

  // Clear registration on unmount.
  useEffect(() => () => {
    onAnimatedChangeRef.current?.(null)
  }, [])

  // WebCodecs ImageDecoder frame-accurate canvas playback (Chromium/Edge).
  const decoderStateRef = useRef<{
    src: string
    decoder: ImageDecoder | null
    frameCount: number
    frameIndex: number
    ready: boolean
  }>({
    src: '',
    decoder: null,
    frameCount: 0,
    frameIndex: 0,
    ready: false,
  })

  // Open/close ImageDecoder per animated asset (preserved across pause/resume).
  useEffect(() => {
    if (!animate || !animatedAsset || engineMode !== 'decoder') return
    let cancelled = false
    let localDecoder: ImageDecoder | null = null

    const init = async () => {
      try {
        const buffer = await animatedAsset.blob.arrayBuffer()
        if (cancelled) return
        const decoder = new ImageDecoder({
          data: buffer,
          type: animatedAsset.mimeType,
          preferAnimation: true,
        })
        localDecoder = decoder
        await decoder.tracks.ready
        if (cancelled) {
          decoder.close()
          return
        }
        const track = decoder.tracks.selectedTrack
        const frameCount = track?.frameCount ?? 0
        if (frameCount <= 1) {
          decoder.close()
          localDecoder = null
          setAnimatedAsset(null)
          setEngineMode('idle')
          onAnimatedChangeRef.current?.(null)
          return
        }
        decoderStateRef.current = {
          src: animatedAsset.src,
          decoder,
          frameCount,
          frameIndex: 0,
          ready: true,
        }
        setDecoderTick(t => t + 1)
      }
      catch {
        if (localDecoder) {
          try { localDecoder.close() } catch { /* ignore */ }
        }
        if (!cancelled) {
          // Gracefully fall back to native <img> playback if WebCodecs rejects this bitstream.
          setEngineMode('img')
        }
      }
    }

    void init()
    return () => {
      cancelled = true
      const current = decoderStateRef.current
      if (current.decoder && current.decoder === localDecoder) {
        decoderStateRef.current = { src: '', decoder: null, frameCount: 0, frameIndex: 0, ready: false }
      }
      if (localDecoder) {
        try { localDecoder.close() } catch { /* ignore */ }
      }
    }
  }, [animate, animatedAsset, engineMode])

  const [decoderTick, setDecoderTick] = useState(0)

  // Step frames while playing via ImageDecoder; freezes on the exact current frame when paused.
  useEffect(() => {
    if (!isPlaying || engineMode !== 'decoder' || !animatedAsset) return
    const state = decoderStateRef.current
    if (!state.ready || !state.decoder || state.src !== animatedAsset.src || state.frameCount <= 1) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let raf: number | null = null

    const scheduleNext = (delayMs: number) => {
      if (cancelled) return
      timer = setTimeout(() => {
        timer = null
        if (cancelled) return
        raf = requestAnimationFrame(() => {
          raf = null
          void renderNextFrame()
        })
      }, delayMs)
    }

    const renderNextFrame = async () => {
      if (cancelled || !state.decoder) return
      const index = state.frameIndex
      try {
        const result = await state.decoder.decode({ frameIndex: index })
        const frame = result.image
        if (cancelled) {
          frame.close()
          return
        }
        const canvas = canvasRef.current
        if (canvas) {
          const w = frame.displayWidth || frame.codedWidth
          const h = frame.displayHeight || frame.codedHeight
          if (w > 0 && h > 0) {
            if (canvas.width !== w || canvas.height !== h) {
              canvas.width = w
              canvas.height = h
            }
            const ctx = canvas.getContext('2d')
            if (ctx) {
              ctx.clearRect(0, 0, canvas.width, canvas.height)
              ctx.drawImage(frame, 0, 0, w, h)
              hasAnimatedFrameRef.current = true
            }
          }
        }
        const durationUs = typeof frame.duration === 'number' && frame.duration > 0 ? frame.duration : 0
        const delayMs = durationUs > 0
          ? Math.max(MIN_FRAME_DURATION_MS, Math.round(durationUs / 1000))
          : DEFAULT_FRAME_DURATION_MS
        frame.close()
        state.frameIndex = (index + 1) % state.frameCount
        scheduleNext(delayMs)
      }
      catch {
        if (!cancelled) setEngineMode('img')
      }
    }

    void renderNextFrame()

    return () => {
      cancelled = true
      if (timer !== null) clearTimeout(timer)
      if (raf !== null) cancelAnimationFrame(raf)
    }
  }, [isPlaying, engineMode, animatedAsset, decoderTick])

  // Native <img> fallback: capture the live displayed frame onto <canvas> right as playback pauses.
  const prevImgPlayingRef = useRef(false)
  useEffect(() => {
    const useImgNow = isPlaying && engineMode === 'img'
    if (prevImgPlayingRef.current && !useImgNow) {
      const img = fallbackImgRef.current
      const canvas = canvasRef.current
      if (img && img.complete && img.naturalWidth > 0 && canvas) {
        if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
          canvas.width = img.naturalWidth
          canvas.height = img.naturalHeight
        }
        const ctx = canvas.getContext('2d')
        if (ctx) {
          try {
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            ctx.drawImage(img, 0, 0)
            hasAnimatedFrameRef.current = true
          }
          catch {
            // Keep existing frame-0 bitmap on canvas if drawImage fails.
          }
        }
      }
    }
    prevImgPlayingRef.current = useImgNow
  }, [isPlaying, engineMode])

  if (explicitPending) {
    return (
      <ImageMediaSlot
        status="pending"
        label={mediaState.label || altText || LL.editor.mediaSlot.pending()}
        slotId={mediaState.slotId}
      />
    )
  }

  if (explicitError) {
    return (
      <ImageMediaSlot
        status="error"
        label={mediaState.error || mediaState.label || altText || LL.editor.mediaSlot.error()}
        hint={replaceHint}
        slotId={mediaState.slotId}
      />
    )
  }

  if (!effectiveSrc) {
    return (
      <ImageMediaSlot
        status="pending"
        label={altText || LL.editor.mediaSlot.loading()}
        slotId={mediaState?.slotId}
        staticSurface
      />
    )
  }

  if (status === 'error') {
    return (
      <ImageMediaSlot
        status="error"
        label={altText || LL.editor.mediaSlot.error()}
        hint={replaceHint}
        slotId={mediaState?.slotId}
      />
    )
  }

  const showFallbackImg = isPlaying && engineMode === 'img' && !!animatedAsset?.objectUrl
  const animatedAttrs = animatedAsset ? {
    'data-fika-animated': animatedAsset.format,
    'data-fika-animated-state': isPlaying ? 'playing' : 'paused',
  } : {}

  return (
    <>
      {!ready ? (
        <ImageMediaSlot
          status="loading"
          label={mediaState?.label || altText || LL.editor.mediaSlot.loading()}
          slotId={mediaState?.slotId}
        />
      ) : null}
      <canvas
        ref={canvasRef}
        role={altText ? 'img' : undefined}
        aria-label={altText || undefined}
        className={cxSlot('surface-canvas', { ready }, className)}
        style={showFallbackImg ? { ...style, visibility: 'hidden' } : style}
        draggable={draggable}
        onDragStart={onDragStart}
        {...animatedAttrs}
      />
      {showFallbackImg ? (
        <img
          ref={fallbackImgRef}
          src={animatedAsset.objectUrl}
          alt={altText || ''}
          className={cxSlot('surface-canvas', { ready }, className)}
          style={style}
          draggable={draggable}
          onDragStart={onDragStart}
          {...animatedAttrs}
        />
      ) : null}
    </>
  )
})

ImageBitmapSurface.displayName = 'ImageBitmapSurface'

export default ImageBitmapSurface
