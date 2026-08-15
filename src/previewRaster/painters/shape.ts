import Konva from 'konva'
import type { PPTShapeElement } from '@/types/slides'
import { loadPreviewImageBitmap } from '@/utils/imageBitmapCache'
import { serializeRichTextHtml } from '@/utils/prosemirror'
import {
  outlineStrokePaint,
  patternCoverPaint,
  patternImageSource,
  shadowPaint,
  shapeFillPaint,
} from '@/utils/elementPaint'
import { familiesFromHtml, rasterHtml, waitForFonts } from './booth'
import { needsHtmlBooth, readTextPaintLayout, textPaintHtml } from '../textPaintHtml'
import { paintKonvaHtmlBox } from './text'
import { resolveRasterTextPaint, type RasterPaintContext } from './contrast'
import { isAxisAlignedRectPath, isSimpleShape, shapeTextIsEmpty } from '../simpleShape'
import { shapePaintHtml } from '@/utils/shapePaint'

export { isSimpleShape }

const pathScale = (element: PPTShapeElement) => {
  const [vbW, vbH] = element.viewBox
  return {
    scaleX: vbW ? element.width / vbW : 1,
    scaleY: vbH ? element.height / vbH : 1,
  }
}

export const paintSimpleShape = (element: PPTShapeElement) => {
  const [vbW, vbH] = element.viewBox
  const { scaleX, scaleY } = pathScale(element)
  const opacity = element.opacity ?? 1
  const outline = outlineStrokePaint(element.outline)
  if (isAxisAlignedRectPath(element.path, element.viewBox)) {
    return new Konva.Rect({
      width: element.width,
      height: element.height,
      opacity,
      listening: false,
      perfectDrawEnabled: false,
      ...shapeFillPaint(element.width, element.height, element.fill, element.gradient),
      ...outline,
    })
  }
  const group = new Konva.Group({ listening: false, opacity })
  group.add(new Konva.Path({
    data: element.path,
    scaleX,
    scaleY,
    listening: false,
    perfectDrawEnabled: false,
    strokeScaleEnabled: false,
    ...shapeFillPaint(vbW, vbH, element.fill, element.gradient),
    ...outline,
  }))
  return group
}

export const paintShape = async (element: PPTShapeElement, captureScale = 1, paintContext?: RasterPaintContext) => {
  if (isSimpleShape(element) && isAxisAlignedRectPath(element.path, element.viewBox)) {
    return paintSimpleShape(element)
  }
  if (!isAxisAlignedRectPath(element.path, element.viewBox)) {
    const text = element.text
    const contrasted = text?.content && !shapeTextIsEmpty(text.content)
      ? resolveRasterTextPaint(text.defaultColor, text.content, element, paintContext)
      : undefined
    const body = contrasted ? serializeRichTextHtml(contrasted.html) : ''
    if (body) await waitForFonts([text?.defaultFontName || '', ...familiesFromHtml(body)])
    return rasterHtml(shapePaintHtml(element, contrasted && body ? {
      body,
      ink: contrasted.ink,
      fontFamily: text?.defaultFontName || 'sans-serif',
      align: text?.align,
      inset: text?.inset,
      lineHeight: text?.lineHeight,
      letterSpacing: text?.wordSpace,
      paragraphSpace: text?.paragraphSpace,
    } : undefined), element.width, element.height, captureScale)
  }
  if (isSimpleShape(element)) return paintSimpleShape(element)
  const [vbW, vbH] = element.viewBox
  const scaleX = vbW ? element.width / vbW : 1
  const scaleY = vbH ? element.height / vbH : 1
  const root = new Konva.Group({ listening: false, opacity: element.opacity ?? 1 })
  const pivoted = new Konva.Group({
    x: element.width / 2,
    y: element.height / 2,
    offsetX: element.width / 2,
    offsetY: element.height / 2,
    rotation: element.rotate,
    listening: false,
    ...shadowPaint(element.shadow),
  })
  const content = new Konva.Group({
    x: element.width / 2,
    y: element.height / 2,
    offsetX: element.width / 2,
    offsetY: element.height / 2,
    scaleX: element.flipH ? -1 : 1,
    scaleY: element.flipV ? -1 : 1,
    listening: false,
  })

  let fillPaint: Record<string, unknown> = shapeFillPaint(vbW, vbH, element.fill, element.gradient)
  if (element.pattern) {
    const bitmap = await loadPreviewImageBitmap(element.pattern)
    if (bitmap) {
      fillPaint = {
        fillPatternImage: patternImageSource(bitmap),
        ...patternCoverPaint(bitmap.width, bitmap.height, vbW, vbH),
      }
    }
  }

  content.add(new Konva.Path({
    data: element.path,
    scaleX,
    scaleY,
    listening: false,
    perfectDrawEnabled: false,
    ...fillPaint,
    ...outlineStrokePaint(element.outline),
  }))

  const text = element.text
  if (text?.content && !shapeTextIsEmpty(text.content)) {
    const inset = text.inset || [10, 10, 10, 10]
    const vAlign = { top: 'flex-start', middle: 'center', bottom: 'flex-end' } as const
    const contrasted = resolveRasterTextPaint(text.defaultColor, text.content, element, paintContext)
    const body = serializeRichTextHtml(contrasted.html)
    if (!needsHtmlBooth(body)) {
      const layout = readTextPaintLayout(body)
      await waitForFonts([text.defaultFontName || '', ...familiesFromHtml(body)])
      content.add(paintKonvaHtmlBox({
        html: body,
        width: element.width,
        height: element.height,
        inset,
        fontSize: Math.max(1, layout.fontSize || 16),
        fontFamily: familiesFromHtml(body)[0] || text.defaultFontName || 'sans-serif',
        color: layout.color || contrasted.ink,
        align: layout.align || 'left',
        verticalAlign: text.align === 'top' ? 'top' : text.align === 'bottom' ? 'bottom' : 'middle',
        lineHeight: text.lineHeight ?? 1.5,
        letterSpacing: text.wordSpace || 0,
      }))
    }
    else {
      content.add(await rasterHtml(textPaintHtml({
        body,
        inset,
        paragraphSpace: text.paragraphSpace === undefined ? 5 : text.paragraphSpace,
        lineHeight: text.lineHeight ?? 1.5,
        letterSpacing: text.wordSpace || 0,
        color: contrasted.ink,
        fontFamily: text.defaultFontName || 'sans-serif',
        justify: vAlign[text.align || 'middle'],
      }), element.width, element.height, captureScale))
    }
  }

  pivoted.add(content)
  root.add(pivoted)
  return root
}
