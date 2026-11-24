import { memo, useEffect, useRef, type CSSProperties, type DragEventHandler } from 'react'
import type { ImageMediaState } from '@/types/slides'
import { useI18nContext } from '@/i18n/useI18nContext'
import { bindStyles } from '@/utils/cssm'
import ImageMediaSlot from './ImageMediaSlot'
import slotStyles from './ImageMediaSlot.module.scss'
import { useImageBitmapState } from './useImageBitmap'

const cxSlot = bindStyles(slotStyles)

export type IImageBitmapSurfaceProps = {
  src: string
  mediaState?: ImageMediaState
  altText?: string
  className?: string
  style?: CSSProperties
  draggable?: boolean
  onDragStart?: DragEventHandler<HTMLCanvasElement>
}

const ImageBitmapSurface = memo((props: IImageBitmapSurfaceProps) => {
  const { src, mediaState, altText, className, style, draggable = false, onDragStart } = props
  const { LL } = useI18nContext()
  const explicitPending = mediaState?.status === 'pending'
  const explicitError = mediaState?.status === 'error'
  const effectiveSrc = explicitPending || explicitError ? '' : src
  const { bitmap, status } = useImageBitmapState(effectiveSrc)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !bitmap) return
    if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
      canvas.width = bitmap.width
      canvas.height = bitmap.height
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0)
  }, [bitmap])

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
        slotId={mediaState?.slotId}
      />
    )
  }

  const ready = status === 'loaded' && !!bitmap

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
        style={style}
        draggable={draggable}
        onDragStart={onDragStart}
      />
    </>
  )
})

ImageBitmapSurface.displayName = 'ImageBitmapSurface'

export default ImageBitmapSurface
