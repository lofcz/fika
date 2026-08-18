import { CLIPPATHS } from '@/configs/imageClip'
import type {
  Gradient,
  ImageElementClip,
  ImageElementFilters,
  LineStyleType,
  PPTElementOutline,
  PPTElementShadow,
  PPTImageElement,
  PPTLineElement,
  SlideBackgroundImageSize,
} from '@/types/slides'
import { getBroken2LineDirection } from '@/utils/element'
import { clampOutlineRadius, resolveOutlineRadiusPx } from '@/utils/elementOutline'

/** Line elements store stroke thickness in `width` (not a bounding-box width). */
export const lineStrokeWidth = (element: Pick<PPTLineElement, 'width'>): number => element.width

export const shadowPaint = (shadow?: PPTElementShadow | null) => {
  if (!shadow) return {}
  return {
    shadowColor: shadow.color,
    shadowBlur: shadow.blur,
    shadowOffsetX: shadow.h,
    shadowOffsetY: shadow.v,
    shadowOpacity: 1,
  }
}

export const outlineDashArray = (style: LineStyleType | undefined, width: number): number[] | undefined => {
  if (style === 'dashed') return width <= 6 ? [width * 4.5, width * 2] : [width * 4, width * 1.5]
  if (style === 'dotted') return width <= 6 ? [width * 1.8, width * 1.6] : [width * 1.5, width * 1.2]
  return undefined
}

export const lineDashArray = (style: LineStyleType, strokeWidth: number): number[] | undefined => {
  if (style === 'dashed') return strokeWidth <= 8 ? [strokeWidth * 5, strokeWidth * 2.5] : [strokeWidth * 5, strokeWidth * 1.5]
  if (style === 'dotted') return strokeWidth <= 8 ? [strokeWidth * 1.8, strokeWidth * 1.6] : [strokeWidth * 1.5, strokeWidth * 1.2]
  return undefined
}

export const outlineStrokePaint = (outline?: PPTElementOutline) => {
  const strokeWidth = outline?.width ?? 0
  if (!outline || strokeWidth <= 0) return { strokeEnabled: false as const }
  const style = outline.style || 'solid'
  const dash = outlineDashArray(style, strokeWidth)
  return {
    stroke: outline.color || '#18181b',
    strokeWidth,
    strokeScaleEnabled: false,
    lineCap: 'butt' as const,
    miterLimit: 8,
    dash,
    dashEnabled: !!dash,
    strokeEnabled: true as const,
  }
}

export const imageOpacity = (filters?: ImageElementFilters): number => {
  const raw = filters?.opacity
  if (raw == null || raw === '') return 1
  const n = parseFloat(raw)
  if (!Number.isFinite(n)) return 1
  if (raw.trim().endsWith('%') || n > 1) return n / 100
  return n
}

export const imageCropRect = (
  clip: ImageElementClip | undefined,
  imgW: number,
  imgH: number,
): { x: number; y: number; width: number; height: number } | undefined => {
  if (!clip) return undefined
  const [start, end] = clip.range
  const width = ((end[0] - start[0]) / 100) * imgW
  const height = ((end[1] - start[1]) / 100) * imgH
  if (width <= 0 || height <= 0) return undefined
  return {
    x: (start[0] / 100) * imgW,
    y: (start[1] / 100) * imgH,
    width,
    height,
  }
}

export const imageCornerRadius = (element: PPTImageElement): number => {
  if (element.radius) return clampOutlineRadius(element.radius, element.width, element.height)
  if (element.outline?.radius) return resolveOutlineRadiusPx(element.outline.radius, element.width, element.height)
  if (element.clip?.shape === 'roundRect') return clampOutlineRadius(10, element.width, element.height)
  return 0
}

export const imageClipKind = (element: PPTImageElement): 'rect' | 'ellipse' | 'polygon' => {
  const shape = element.clip?.shape
  return (shape && CLIPPATHS[shape]?.type) || 'rect'
}

type PathCtx = {
  beginPath: () => void
  moveTo: (x: number, y: number) => void
  lineTo: (x: number, y: number) => void
  closePath: () => void
  rect: (x: number, y: number, width: number, height: number) => void
  roundRect: (x: number, y: number, width: number, height: number, radii: number) => void
  ellipse: (
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    rotation: number,
    startAngle: number,
    endAngle: number,
  ) => void
}

const PATH_TOKEN = /[MLZmlz]|[-+]?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/g

export const drawSvgPolyline = (ctx: Pick<PathCtx, 'moveTo' | 'lineTo' | 'closePath'>, d: string) => {
  const parts = d.match(PATH_TOKEN)
  if (!parts) return
  let i = 0
  let cmd = ''
  while (i < parts.length) {
    const token = parts[i]
    if (/^[MLZmlz]$/.test(token)) {
      cmd = token
      i += 1
      if (cmd === 'Z' || cmd === 'z') {
        ctx.closePath()
        continue
      }
    }
    if (i + 1 >= parts.length) break
    const x = Number(parts[i])
    const y = Number(parts[i + 1])
    i += 2
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    if (cmd === 'M' || cmd === 'm') {
      ctx.moveTo(x, y)
      cmd = cmd === 'm' ? 'l' : 'L'
    }
    else {
      ctx.lineTo(x, y)
    }
  }
}

export const drawImageClip = (ctx: PathCtx, element: PPTImageElement) => {
  const w = element.width
  const h = element.height
  const shape = element.clip?.shape
  const item = (shape && CLIPPATHS[shape]) || CLIPPATHS.rect
  ctx.beginPath()
  if (item.type === 'ellipse') {
    ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
    return
  }
  if (item.type === 'polygon' && item.createPath) {
    drawSvgPolyline(ctx, item.createPath(w, h))
    return
  }
  const radius = imageCornerRadius(element)
  if (radius > 0) ctx.roundRect(0, 0, w, h, radius)
  else ctx.rect(0, 0, w, h)
}

export const imageClipPathData = (element: PPTImageElement): string | undefined => {
  const shape = element.clip?.shape
  const item = shape ? CLIPPATHS[shape] : undefined
  if (item?.type === 'polygon' && item.createPath) {
    return item.createPath(element.width, element.height)
  }
  return undefined
}

const rotatePoint = (x: number, y: number, cx: number, cy: number, deg: number) => {
  const rad = (deg * Math.PI) / 180
  const dx = x - cx
  const dy = y - cy
  return {
    x: cx + dx * Math.cos(rad) - dy * Math.sin(rad),
    y: cy + dx * Math.sin(rad) + dy * Math.cos(rad),
  }
}

const gradientStops = (gradient: Gradient): Array<number | string> => {
  const stops: Array<number | string> = []
  for (const stop of gradient.colors) {
    stops.push(stop.pos / 100, stop.color)
  }
  return stops
}

export const linearGradientPaint = (width: number, height: number, gradient: Gradient) => {
  const cx = width / 2
  const cy = height / 2
  const start = rotatePoint(0, cy, cx, cy, gradient.rotate)
  const end = rotatePoint(width, cy, cx, cy, gradient.rotate)
  return {
    fillLinearGradientStartPoint: start,
    fillLinearGradientEndPoint: end,
    fillLinearGradientColorStops: gradientStops(gradient),
  }
}

export const radialGradientPaint = (
  width: number,
  height: number,
  gradient: Gradient,
  origin: 'center' | 'css' = 'center',
) => {
  const cx = origin === 'css' ? width * 0.28 : width / 2
  const cy = origin === 'css' ? height * 0.22 : height / 2
  const radius = origin === 'css'
    ? Math.hypot(Math.max(cx, width - cx), Math.max(cy, height - cy))
    : Math.max(width, height) / 2
  return {
    fillRadialGradientStartPoint: { x: cx, y: cy },
    fillRadialGradientStartRadius: 0,
    fillRadialGradientEndPoint: { x: cx, y: cy },
    fillRadialGradientEndRadius: radius,
    fillRadialGradientColorStops: gradientStops(gradient),
  }
}

export const shapeFillPaint = (
  width: number,
  height: number,
  fill: string,
  gradient?: Gradient,
) => {
  if (gradient) {
    return gradient.type === 'radial'
      ? radialGradientPaint(width, height, gradient)
      : linearGradientPaint(width, height, gradient)
  }
  if (!fill || fill === 'none') return { fillEnabled: false as const }
  return { fill }
}

export const patternCoverPaint = (imgW: number, imgH: number, boxW: number, boxH: number) => {
  const scale = Math.max(boxW / imgW, boxH / imgH)
  return {
    fillPatternScaleX: scale,
    fillPatternScaleY: scale,
    fillPatternX: (boxW - imgW * scale) / 2,
    fillPatternY: (boxH - imgH * scale) / 2,
    fillPatternRepeat: 'no-repeat',
  }
}

export const fitRect = (
  imgW: number,
  imgH: number,
  boxW: number,
  boxH: number,
  mode: Exclude<SlideBackgroundImageSize, 'repeat'>,
) => {
  const scale = mode === 'contain'
    ? Math.min(boxW / imgW, boxH / imgH)
    : Math.max(boxW / imgW, boxH / imgH)
  const width = imgW * scale
  const height = imgH * scale
  return {
    x: (boxW - width) / 2,
    y: (boxH - height) / 2,
    width,
    height,
  }
}

export const linePolylinePoints = (element: PPTLineElement): number[] | null => {
  if (element.curve || element.cubic) return null
  const points = [element.start[0], element.start[1]]
  if (element.broken) {
    points.push(element.broken[0], element.broken[1])
  }
  else if (element.broken2) {
    if (getBroken2LineDirection(element) === 'horizontal') {
      points.push(element.broken2[0], element.start[1], element.broken2[0], element.end[1])
    }
    else {
      points.push(element.start[0], element.broken2[1], element.end[0], element.broken2[1])
    }
  }
  points.push(element.end[0], element.end[1])
  return points
}

export const canvasFromBitmap = (bitmap: ImageBitmap): HTMLCanvasElement => {
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (ctx) ctx.drawImage(bitmap, 0, 0)
  return canvas
}

/** Konva's config types list HTMLImageElement; runtime also accepts canvas. */
export const patternImageSource = (bitmap: ImageBitmap): HTMLImageElement => (
  canvasFromBitmap(bitmap) as unknown as HTMLImageElement
)
