import type {
  Gradient,
  PPTChartElement,
  PPTCodeElement,
  PPTElement,
  PPTElementOutline,
  PPTImageElement,
  PPTLatexElement,
  PPTLineElement,
  PPTMermaidElement,
  PPTShapeElement,
  PPTTableElement,
  PPTTextElement,
  Slide,
  SlideTheme,
  TableCellStyle,
} from '@/types/slides'
import { CLIPPATHS, ClipPathTypes } from '@/configs/imageClip'
import { DEFAULT_CHART_LINE_COLOR } from '@/configs/chart'
import { getLineElementRenderPath, getTableThemeColors } from '@/utils/element'
import { resolveOutlineRadiusPx } from '@/utils/elementOutline'
import {
  getCachedPreviewImageBitmap,
  loadPreviewImageBitmap,
} from '@/utils/imageBitmapCache'
import { elementLocksTextBox, resolveTextBoxLayout } from '@/utils/placeholderLayout'
import {
  resolveChartElementSeriesColors,
  resolveChartLabelColor,
  resolveLiveTextPaint,
  resolveTableCellFill,
} from '@/utils/textContrast'
import { paintRichText } from './textPainter'
import { getChartRaster, getCodeRaster, getMermaidRaster } from './rasterResources'

export type PaintSlideOptions = {
  slide: Slide
  theme: SlideTheme
  viewportSize: number
  viewportRatio: number
  cssWidth: number
  cssHeight?: number
  dpr?: number
  invalidate: () => void
}

const PATH_CACHE_MAX = 1800
const basePaths = new Map<string, Path2D>()
const scaledPaths = new Map<string, Path2D>()

const rememberPath = (cache: Map<string, Path2D>, key: string, path: Path2D) => {
  cache.set(key, path)
  if (cache.size > PATH_CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
  return path
}

const pathFrom = (d: string) => {
  const hit = basePaths.get(d)
  if (hit) return hit
  return rememberPath(basePaths, d, new Path2D(d))
}

const scaledPath = (d: string, width: number, height: number, viewBox: [number, number]) => {
  const key = `${width}\0${height}\0${viewBox[0]}\0${viewBox[1]}\0${d}`
  const hit = scaledPaths.get(key)
  if (hit) return hit
  const path = new Path2D()
  path.addPath(pathFrom(d), new DOMMatrix().scale(
    viewBox[0] ? width / viewBox[0] : 1,
    viewBox[1] ? height / viewBox[1] : 1,
  ))
  return rememberPath(scaledPaths, key, path)
}

const outlineDash = (outline?: PPTElementOutline) => {
  const width = outline?.width || 0
  if (outline?.style === 'dashed') return width <= 6 ? [width * 4.5, width * 2] : [width * 4, width * 1.5]
  if (outline?.style === 'dotted') return width <= 6 ? [width * 1.8, width * 1.6] : [width * 1.5, width * 1.2]
  return []
}

const roundRectPath = (width: number, height: number, radius = 0) => {
  const path = new Path2D()
  path.roundRect(0, 0, width, height, Math.max(0, Math.min(radius, width / 2, height / 2)))
  return path
}

const paintOutline = (
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  outline?: PPTElementOutline,
) => {
  if (!outline?.width) return
  ctx.save()
  ctx.strokeStyle = outline.color || '#18181b'
  ctx.lineWidth = outline.width
  ctx.setLineDash(outlineDash(outline))
  ctx.lineCap = 'butt'
  ctx.lineJoin = 'miter'
  ctx.miterLimit = 8
  ctx.stroke(path)
  ctx.restore()
}

const applyShadow = (
  ctx: CanvasRenderingContext2D,
  shadow?: { h: number; v: number; blur: number; color: string },
) => {
  if (!shadow) return
  ctx.shadowOffsetX = shadow.h
  ctx.shadowOffsetY = shadow.v
  ctx.shadowBlur = shadow.blur
  ctx.shadowColor = shadow.color
}

const withRectTransform = (
  ctx: CanvasRenderingContext2D,
  element: { left: number; top: number; width: number; height: number; rotate?: number; flipH?: boolean; flipV?: boolean },
  paint: () => void,
) => {
  ctx.save()
  ctx.translate(element.left + element.width / 2, element.top + element.height / 2)
  if (element.rotate) ctx.rotate(element.rotate * Math.PI / 180)
  ctx.scale(element.flipH ? -1 : 1, element.flipV ? -1 : 1)
  ctx.translate(-element.width / 2, -element.height / 2)
  paint()
  ctx.restore()
}

const gradientPaint = (
  ctx: CanvasRenderingContext2D,
  gradient: Gradient,
  width: number,
  height: number,
) => {
  let paint: CanvasGradient
  if (gradient.type === 'radial') {
    const cx = width * 0.28
    const cy = height * 0.22
    const radius = Math.max(
      Math.hypot(cx, cy),
      Math.hypot(width - cx, cy),
      Math.hypot(cx, height - cy),
      Math.hypot(width - cx, height - cy),
    )
    paint = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
  }
  else {
    const angle = (gradient.rotate || 0) * Math.PI / 180
    const dx = Math.cos(angle)
    const dy = Math.sin(angle)
    const span = Math.abs(width * dx) + Math.abs(height * dy)
    const cx = width / 2
    const cy = height / 2
    paint = ctx.createLinearGradient(
      cx - dx * span / 2,
      cy - dy * span / 2,
      cx + dx * span / 2,
      cy + dy * span / 2,
    )
  }
  const stops = gradient.colors.length ? gradient.colors : [{ pos: 0, color: '#ffffff' }]
  for (const stop of stops) paint.addColorStop(Math.max(0, Math.min(1, stop.pos / 100)), stop.color)
  return paint
}

const bitmapFor = (src: string, invalidate: () => void) => {
  const cached = getCachedPreviewImageBitmap(src)
  if (cached) return cached
  void loadPreviewImageBitmap(src).then(bitmap => {
    if (bitmap) invalidate()
  })
  return undefined
}

const drawCover = (
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource & { width: number; height: number },
  width: number,
  height: number,
  mode: 'cover' | 'contain' = 'cover',
  origin: 'center' | 'start' = 'center',
) => {
  const iw = Math.max(1, image.width)
  const ih = Math.max(1, image.height)
  const scale = mode === 'contain' ? Math.min(width / iw, height / ih) : Math.max(width / iw, height / ih)
  const dw = iw * scale
  const dh = ih * scale
  const x = origin === 'center' ? (width - dw) / 2 : 0
  const y = origin === 'center' ? (height - dh) / 2 : 0
  ctx.drawImage(image, x, y, dw, dh)
}

const paintBackground = (
  ctx: CanvasRenderingContext2D,
  slide: Slide,
  width: number,
  height: number,
  invalidate: () => void,
) => {
  const background = slide.background
  if (!background) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    return
  }
  if (background.type === 'solid') {
    ctx.fillStyle = background.color || '#ffffff'
    ctx.fillRect(0, 0, width, height)
    return
  }
  if (background.type === 'gradient' && background.gradient) {
    ctx.fillStyle = gradientPaint(ctx, background.gradient, width, height)
    ctx.fillRect(0, 0, width, height)
    return
  }
  ctx.fillStyle = background.color || '#ffffff'
  ctx.fillRect(0, 0, width, height)
  const source = background.image?.src
  if (!source) return
  const bitmap = bitmapFor(source, invalidate)
  if (!bitmap) return
  if (background.image?.size === 'repeat') {
    const scale = Math.min(width / bitmap.width, height / bitmap.height)
    const tileW = Math.max(1, bitmap.width * scale)
    const tileH = Math.max(1, bitmap.height * scale)
    for (let y = 0; y < height; y += tileH) {
      for (let x = 0; x < width; x += tileW) ctx.drawImage(bitmap, x, y, tileW, tileH)
    }
    return
  }
  drawCover(ctx, bitmap, width, height, background.image?.size === 'contain' ? 'contain' : 'cover', 'start')
}

const clipPathForImage = (element: PPTImageElement) => {
  const configured = CLIPPATHS[element.clip?.shape || 'rect'] || CLIPPATHS.rect
  if (configured.type === ClipPathTypes.ELLIPSE) {
    const path = new Path2D()
    path.ellipse(element.width / 2, element.height / 2, element.width / 2, element.height / 2, 0, 0, Math.PI * 2)
    return path
  }
  if (configured.type === ClipPathTypes.POLYGON && configured.createPath) {
    return pathFrom(configured.createPath(element.width, element.height))
  }
  return roundRectPath(element.width, element.height, element.radius || parseFloat(configured.radius || '0'))
}

const imageFilter = (element: PPTImageElement) => {
  if (!element.filters) return 'none'
  return Object.entries(element.filters).map(([key, value]) => `${key}(${value})`).join(' ')
}

const paintImage = (
  ctx: CanvasRenderingContext2D,
  element: PPTImageElement,
  invalidate: () => void,
) => withRectTransform(ctx, element, () => {
  const clip = clipPathForImage(element)
  ctx.save()
  applyShadow(ctx, element.shadow)
  ctx.clip(clip)
  const bitmap = bitmapFor(element.src, invalidate)
  if (bitmap) {
    ctx.filter = imageFilter(element)
    if (element.clip) {
      const [start, end] = element.clip.range
      const sx = bitmap.width * start[0] / 100
      const sy = bitmap.height * start[1] / 100
      const sw = bitmap.width * (end[0] - start[0]) / 100
      const sh = bitmap.height * (end[1] - start[1]) / 100
      ctx.drawImage(bitmap, sx, sy, Math.max(1, sw), Math.max(1, sh), 0, 0, element.width, element.height)
    }
    else ctx.drawImage(bitmap, 0, 0, element.width, element.height)
    ctx.filter = 'none'
  }
  else {
    ctx.fillStyle = '#f4f4f5'
    ctx.fillRect(0, 0, element.width, element.height)
  }
  if (element.colorMask) {
    ctx.fillStyle = element.colorMask
    ctx.fillRect(0, 0, element.width, element.height)
  }
  ctx.restore()
  paintOutline(ctx, clip, element.outline)
})

const paintShape = (
  ctx: CanvasRenderingContext2D,
  element: PPTShapeElement,
  slide: Slide,
  theme: SlideTheme,
  invalidate: () => void,
) => withRectTransform(ctx, element, () => {
  const path = scaledPath(element.path, element.width, element.height, element.viewBox)
  ctx.save()
  ctx.globalAlpha *= element.opacity ?? 1
  applyShadow(ctx, element.shadow)
  if (element.pattern) {
    ctx.save()
    ctx.clip(path, 'evenodd')
    const bitmap = bitmapFor(element.pattern, invalidate)
    if (bitmap) drawCover(ctx, bitmap, element.width, element.height)
    ctx.restore()
  }
  else {
    ctx.fillStyle = element.gradient
      ? gradientPaint(ctx, element.gradient, element.width, element.height)
      : element.fill || 'transparent'
    ctx.fill(path, 'evenodd')
  }
  paintOutline(ctx, path, element.outline)
  if (element.text?.content) {
    const painted = resolveLiveTextPaint(element.text.defaultColor || theme.fontColor, element.text.content, {
      element,
      elements: slide.elements,
      fill: element.fill,
      background: slide.background,
      fallbackSurface: theme.backgroundColor,
      themeFontColor: theme.fontColor,
    })
    paintRichText(ctx, {
      html: painted.html,
      x: 0,
      y: 0,
      width: element.width,
      height: element.height,
      defaultFontFamily: element.text.defaultFontName || theme.fontName,
      defaultColor: painted.ink,
      lineHeight: element.text.lineHeight,
      letterSpacing: element.text.wordSpace,
      paragraphSpace: element.text.paragraphSpace,
      inset: element.text.inset,
      vAlign: element.text.align,
      fit: element.text.fixedHeight !== false,
    })
  }
  ctx.restore()
})

const paintTextElement = (
  ctx: CanvasRenderingContext2D,
  element: PPTTextElement,
  slide: Slide,
  theme: SlideTheme,
) => withRectTransform(ctx, element, () => {
  const box = roundRectPath(element.width, element.height, resolveOutlineRadiusPx(element.outline?.radius, element.width, element.height))
  ctx.save()
  ctx.globalAlpha *= element.opacity ?? 1
  if (element.fill) {
    ctx.fillStyle = element.fill
    ctx.fill(box)
  }
  paintOutline(ctx, box, element.outline)
  const painted = resolveLiveTextPaint(element.defaultColor || theme.fontColor, element.content, {
    element,
    elements: slide.elements,
    fill: element.fill,
    background: slide.background,
    fallbackSurface: theme.backgroundColor,
    themeFontColor: theme.fontColor,
  })
  const layout = resolveTextBoxLayout(element, slide.type)
  paintRichText(ctx, {
    html: painted.html,
    x: 0,
    y: 0,
    width: element.width,
    height: element.height,
    defaultFontFamily: element.defaultFontName || theme.fontName,
    defaultColor: painted.ink,
    defaultSize: element.placeholder ? element.placeholderFontSize : undefined,
    lineHeight: element.lineHeight,
    letterSpacing: element.wordSpace,
    paragraphSpace: element.paragraphSpace,
    inset: element.inset,
    vAlign: layout.vAlign,
    fit: elementLocksTextBox(element),
    vertical: element.vertical,
    shadow: element.shadow,
  })
  ctx.restore()
})

const lineAdjacentPoints = (element: PPTLineElement) => {
  if (element.broken) return [element.broken, element.broken] as const
  if (element.broken2) {
    if ((element.broken2Direction || 'horizontal') === 'horizontal') {
      return [
        [element.broken2[0], element.start[1]] as [number, number],
        [element.broken2[0], element.end[1]] as [number, number],
      ] as const
    }
    return [
      [element.start[0], element.broken2[1]] as [number, number],
      [element.end[0], element.broken2[1]] as [number, number],
    ] as const
  }
  if (element.curve) return [element.curve, element.curve] as const
  if (element.cubic) return [element.cubic[0], element.cubic[1]] as const
  return [element.end, element.start] as const
}

const paintLineMarker = (
  ctx: CanvasRenderingContext2D,
  type: '' | 'arrow' | 'dot',
  point: [number, number],
  toward: [number, number],
  width: number,
  color: string,
) => {
  if (!type) return
  const size = Math.max(2, width)
  ctx.save()
  ctx.translate(point[0], point[1])
  ctx.fillStyle = color
  if (type === 'dot') {
    ctx.beginPath()
    ctx.arc(0, 0, size * 1.5, 0, Math.PI * 2)
    ctx.fill()
  }
  else {
    const angle = Math.atan2(point[1] - toward[1], point[0] - toward[0])
    ctx.rotate(angle)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(-size * 3, -size * 1.5)
    ctx.lineTo(-size * 3, size * 1.5)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

const paintLine = (ctx: CanvasRenderingContext2D, element: PPTLineElement) => {
  ctx.save()
  ctx.translate(element.left, element.top)
  applyShadow(ctx, element.shadow)
  const path = pathFrom(getLineElementRenderPath(element))
  ctx.strokeStyle = element.color
  ctx.lineWidth = element.width
  ctx.lineCap = 'butt'
  ctx.lineJoin = 'miter'
  const width = element.width
  ctx.setLineDash(element.style === 'dashed'
    ? (width <= 8 ? [width * 5, width * 2.5] : [width * 5, width * 1.5])
    : element.style === 'dotted'
      ? (width <= 8 ? [width * 1.8, width * 1.6] : [width * 1.5, width * 1.2])
      : [])
  ctx.stroke(path)
  const [afterStart, beforeEnd] = lineAdjacentPoints(element)
  paintLineMarker(ctx, element.points[0], element.start, afterStart, width, element.color)
  paintLineMarker(ctx, element.points[1], element.end, beforeEnd, width, element.color)
  ctx.restore()
}

const paintLatex = (ctx: CanvasRenderingContext2D, element: PPTLatexElement) => (
  withRectTransform(ctx, element, () => {
    if (!element.path) return
    const path = scaledPath(element.path, element.width, element.height, element.viewBox)
    ctx.fillStyle = element.color
    ctx.strokeStyle = element.color
    ctx.lineWidth = element.strokeWidth || 0
    ctx.fill(path, 'evenodd')
    if (element.strokeWidth) ctx.stroke(path)
  })
)

const tableTextHtml = (text: string, style: TableCellStyle | undefined, fallback: string) => {
  const decorations = [style?.underline ? 'underline' : '', style?.strikethrough ? 'line-through' : ''].filter(Boolean).join(' ')
  const css = [
    `font-size:${style?.fontsize || '14px'}`,
    style?.fontname ? `font-family:${style.fontname}` : '',
    style?.color ? `color:${style.color}` : `color:${fallback}`,
    style?.bold ? 'font-weight:700' : '',
    style?.em ? 'font-style:italic' : '',
    decorations ? `text-decoration:${decorations}` : '',
    style?.align ? `text-align:${style.align}` : '',
  ].filter(Boolean).join(';')
  return `<p style="${css}">${text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>')}</p>`
}

const paintTable = (
  ctx: CanvasRenderingContext2D,
  element: PPTTableElement,
  theme: SlideTheme,
) => withRectTransform(ctx, element, () => {
  const rows = element.data.length
  if (!rows) return
  const cols = Math.max(element.colWidths.length, ...element.data.map(row => row.length))
  const fractions = element.colWidths.length
    ? element.colWidths
    : Array.from({ length: cols }, () => 1 / Math.max(1, cols))
  const total = fractions.reduce((sum, value) => sum + value, 0) || 1
  const widths = fractions.map(value => element.width * value / total)
  const rowHeight = Math.max(element.cellMinHeight, element.height / rows)
  const occupied = new Set<string>()
  for (let row = 0; row < rows; row++) {
    let x = 0
    for (let col = 0; col < cols; col++) {
      const cellWidth = widths[col] || element.width / cols
      if (occupied.has(`${row}:${col}`)) {
        x += cellWidth
        continue
      }
      const cell = element.data[row]?.[col]
      if (!cell) {
        x += cellWidth
        continue
      }
      const colSpan = Math.max(1, cell.colspan || 1)
      const rowSpan = Math.max(1, cell.rowspan || 1)
      const width = widths.slice(col, col + colSpan).reduce((sum, value) => sum + value, 0)
      const height = rowHeight * rowSpan
      for (let rr = row; rr < row + rowSpan; rr++) {
        for (let cc = col; cc < col + colSpan; cc++) {
          if (rr !== row || cc !== col) occupied.add(`${rr}:${cc}`)
        }
      }
      const ownFill = resolveTableCellFill(element, row, col)
      if (ownFill) {
        ctx.fillStyle = ownFill
        ctx.fillRect(x, row * rowHeight, width, height)
      }
      else if (element.theme) {
        const colors = getTableThemeColors(element.theme.color)
        ctx.fillStyle = row % 2 ? colors.stripe : colors.stripeAlt
        ctx.fillRect(x, row * rowHeight, width, height)
      }
      const border = element.outline
      if (border?.width) {
        ctx.save()
        ctx.strokeStyle = border.color || '#18181b'
        ctx.lineWidth = border.width
        ctx.setLineDash(outlineDash(border))
        ctx.strokeRect(x, row * rowHeight, width, height)
        ctx.restore()
      }
      paintRichText(ctx, {
        html: tableTextHtml(cell.text || '', cell.style, theme.fontColor),
        x,
        y: row * rowHeight,
        width,
        height,
        defaultFontFamily: cell.style?.fontname || theme.fontName,
        defaultColor: cell.style?.color || theme.fontColor,
        defaultSize: parseFloat(cell.style?.fontsize || '14') || 14,
        lineHeight: 1.2,
        paragraphSpace: 0,
        inset: [10, 10, 10, 10],
        vAlign: cell.style?.vAlign || 'top',
        align: cell.style?.align || 'left',
        fit: true,
      })
      x += width
      col += colSpan - 1
    }
  }
})

const paintRasterElement = (
  ctx: CanvasRenderingContext2D,
  element: PPTChartElement | PPTMermaidElement | PPTCodeElement,
  slide: Slide,
  theme: SlideTheme,
  invalidate: () => void,
) => withRectTransform(ctx, element, () => {
  const outline = element.type === 'chart' ? element.outline : undefined
  const box = roundRectPath(element.width, element.height, resolveOutlineRadiusPx(outline?.radius, element.width, element.height))
  if (element.type === 'chart' && element.fill) {
    ctx.fillStyle = element.fill
    ctx.fill(box)
  }
  const raster = element.type === 'chart'
    ? getChartRaster(
        element,
        resolveChartElementSeriesColors(element, {
          background: slide.background,
          fallbackSurface: theme.backgroundColor,
        }),
        resolveChartLabelColor(element, {
          background: slide.background,
          fallbackSurface: theme.backgroundColor,
          fontColor: theme.fontColor,
        }),
        element.lineColor || DEFAULT_CHART_LINE_COLOR,
        invalidate,
      )
    : element.type === 'mermaid'
      ? getMermaidRaster(element, invalidate)
      : getCodeRaster(element, invalidate)
  ctx.save()
  ctx.clip(box)
  if (raster) ctx.drawImage(raster, 0, 0, element.width, element.height)
  else {
    ctx.globalAlpha *= 0.2
    ctx.fillStyle = theme.fontColor || '#71717a'
    ctx.fillRect(0, 0, element.width, element.height)
  }
  ctx.restore()
  paintOutline(ctx, box, outline)
})

const paintMedia = (
  ctx: CanvasRenderingContext2D,
  element: Extract<PPTElement, { type: 'video' | 'audio' }>,
  invalidate: () => void,
) => withRectTransform(ctx, element, () => {
  const bitmap = element.poster ? bitmapFor(element.poster, invalidate) : undefined
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, element.width, element.height)
  ctx.clip()
  if (bitmap) drawCover(ctx, bitmap, element.width, element.height)
  else {
    ctx.fillStyle = element.type === 'audio' ? element.color || '#71717a' : '#18181b'
    ctx.fillRect(0, 0, element.width, element.height)
  }
  const radius = Math.max(8, Math.min(element.width, element.height) * 0.11)
  ctx.fillStyle = 'rgba(0,0,0,.58)'
  ctx.beginPath()
  ctx.arc(element.width / 2, element.height / 2, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.moveTo(element.width / 2 - radius * 0.25, element.height / 2 - radius * 0.48)
  ctx.lineTo(element.width / 2 + radius * 0.55, element.height / 2)
  ctx.lineTo(element.width / 2 - radius * 0.25, element.height / 2 + radius * 0.48)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
})

const paintElement = (
  ctx: CanvasRenderingContext2D,
  element: PPTElement,
  slide: Slide,
  theme: SlideTheme,
  invalidate: () => void,
) => {
  switch (element.type) {
    case 'shape': paintShape(ctx, element, slide, theme, invalidate); break
    case 'line': paintLine(ctx, element); break
    case 'image': paintImage(ctx, element, invalidate); break
    case 'text': paintTextElement(ctx, element, slide, theme); break
    case 'table': paintTable(ctx, element, theme); break
    case 'latex': paintLatex(ctx, element); break
    case 'chart':
    case 'mermaid':
    case 'code': paintRasterElement(ctx, element, slide, theme, invalidate); break
    case 'video':
    case 'audio': paintMedia(ctx, element, invalidate); break
  }
}

/**
 * Direct Slide JSON -> final-DPR canvas paint. No DOM tree, foreignObject
 * capture, intermediate PNG, or CSS-scale resampling is involved.
 */
export const paintSlideToCanvas = (canvas: HTMLCanvasElement, options: PaintSlideOptions) => {
  const logicalWidth = Math.max(1, options.viewportSize)
  const logicalHeight = Math.max(1, options.viewportSize * options.viewportRatio)
  const cssWidth = Math.max(1, options.cssWidth)
  const cssHeight = Math.max(1, options.cssHeight ?? cssWidth * options.viewportRatio)
  const dpr = Math.max(1, options.dpr || window.devicePixelRatio || 1)
  const pixelWidth = Math.max(1, Math.round(cssWidth * dpr))
  const pixelHeight = Math.max(1, Math.round(cssHeight * dpr))
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) return
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, pixelWidth, pixelHeight)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.setTransform(pixelWidth / logicalWidth, 0, 0, pixelHeight / logicalHeight, 0, 0)
  paintBackground(ctx, options.slide, logicalWidth, logicalHeight, options.invalidate)
  for (const element of options.slide.elements) {
    try {
      paintElement(ctx, element, options.slide, options.theme, options.invalidate)
    }
    catch (error) {
      if (import.meta.env.MODE === 'development') {
        console.warn('[slidePainter] element paint failed', element.id, element.type, error)
      }
    }
  }
}

export const clearSlidePathCache = () => {
  basePaths.clear()
  scaledPaths.clear()
}
