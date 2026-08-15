import Konva from 'konva'
import type { PPTElement, PPTImageElement, PPTShapeElement, PPTTextElement } from '@/types/slides'
import { getCachedPreviewImageBitmap } from '@/utils/imageBitmapCache'
import { htmlToText } from '@/utils/common'
import { resolveRasterTextPaint, type RasterPaintContext } from './contrast'

const fillOf = (value: unknown): string => {
  if (typeof value === 'string' && value && value !== 'transparent') return value
  return ''
}

const shapeFill = (element: PPTShapeElement) => (
  fillOf(element.fill) || element.gradient?.colors?.[0]?.color || '#d4d4d8'
)

export const paintLqElement = (element: PPTElement, paintContext?: RasterPaintContext): Konva.Node | null => {
  if (element.type === 'image') return paintLqImage(element)
  if (element.type === 'shape') return paintLqShape(element)
  if (element.type === 'text') return paintLqText(element, paintContext)
  if (element.type === 'table' || element.type === 'chart' || element.type === 'code') {
    return new Konva.Rect({
      width: element.width,
      height: element.height,
      fill: '#e4e4e7',
      listening: false,
    })
  }
  return null
}

const paintLqImage = (element: PPTImageElement) => {
  const cached = getCachedPreviewImageBitmap(element.src)
  if (cached) {
    return new Konva.Image({
      image: cached,
      width: element.width,
      height: element.height,
      listening: false,
    })
  }
  return new Konva.Rect({
    width: element.width,
    height: element.height,
    fill: '#cbd5e1',
    listening: false,
  })
}

const paintLqShape = (element: PPTShapeElement) => (
  new Konva.Rect({
    width: element.width,
    height: element.height,
    fill: shapeFill(element),
    opacity: element.opacity ?? 1,
    listening: false,
  })
)

const paintLqText = (element: PPTTextElement, paintContext?: RasterPaintContext) => {
  const contrasted = resolveRasterTextPaint(element.defaultColor, element.content || '', element, paintContext)
  const text = htmlToText(contrasted.html).trim()
  if (!text) return null
  return new Konva.Text({
    width: element.width,
    height: element.height,
    text,
    fontSize: 18,
    fontFamily: element.defaultFontName || 'sans-serif',
    fill: contrasted.ink,
    wrap: 'word',
    listening: false,
    perfectDrawEnabled: false,
  })
}
