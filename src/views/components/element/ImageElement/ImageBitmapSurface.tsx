import { memo, useEffect, useRef, type CSSProperties, type DragEventHandler } from 'react'
import { useImageBitmap } from './useImageBitmap'

export type IImageBitmapSurfaceProps = {
  src: string
  className?: string
  style?: CSSProperties
  draggable?: boolean
  onDragStart?: DragEventHandler<HTMLCanvasElement>
}

const ImageBitmapSurface = memo((props: IImageBitmapSurfaceProps) => {
  const { src, className, style, draggable = false, onDragStart } = props
  const bitmap = useImageBitmap(src)
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

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={style}
      draggable={draggable}
      onDragStart={onDragStart}
    />
  )
})

ImageBitmapSurface.displayName = 'ImageBitmapSurface'

export default ImageBitmapSurface
