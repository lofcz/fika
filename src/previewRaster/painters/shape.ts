import Konva from 'konva'
import type { PPTShapeElement } from '@/types/slides'
import { loadImageBitmap } from '@/utils/imageBitmapCache'
import { serializeRichTextHtml } from '@/utils/prosemirror'
import {
  outlineStrokePaint,
  patternCoverPaint,
  patternImageSource,
  shadowPaint,
  shapeFillPaint,
} from '@/utils/elementPaint'
import { textFitScaleForHtml } from '@/utils/textFit'
import { escapeBoothText, quoteFontFamily, rasterHtml } from './booth'

export const paintShape = async (element: PPTShapeElement, captureScale = 1) => {
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
    const bitmap = await loadImageBitmap(element.pattern)
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
    ...fillPaint,
    ...outlineStrokePaint(element.outline),
  }))

  const text = element.text
  if (text?.content) {
    const inset = text.inset || [10, 10, 10, 10]
    const paragraphSpace = text.paragraphSpace === undefined ? 5 : text.paragraphSpace
    const vAlign = { top: 'flex-start', middle: 'center', bottom: 'flex-end' } as const
    const body = serializeRichTextHtml(text.content)
    const fitScale = text.fixedHeight !== false
      ? textFitScaleForHtml(body, {
        innerWidth: Math.max(1, element.width - inset[1] - inset[3]),
        innerHeight: Math.max(1, element.height - inset[0] - inset[2]),
        defaultFontFamily: text.defaultFontName,
        lineHeight: text.lineHeight ?? 1.5,
        letterSpacing: text.wordSpace || 0,
        blockSpace: paragraphSpace,
      })
      : 1
    const fittedBody = fitScale < 1
      ? `<div data-text-fit-host style="zoom:${fitScale};width:100%">${body}</div>`
      : body
    const html = `<style>.fika-booth-text p{margin:0 0 ${paragraphSpace}px}</style><div class="ProseMirror ProseMirror-static fika-booth-text" style="width:100%;height:100%;box-sizing:border-box;overflow:hidden;word-break:break-word;display:flex;flex-direction:column;justify-content:${vAlign[text.align || 'middle']};line-height:${text.lineHeight ?? 1.5};letter-spacing:${text.wordSpace || 0}px;color:${escapeBoothText(text.defaultColor || '#333')};font-family:${escapeBoothText(quoteFontFamily(text.defaultFontName || 'sans-serif'))};padding:${inset[0]}px ${inset[1]}px ${inset[2]}px ${inset[3]}px">${fittedBody}</div>`
    content.add(await rasterHtml(html, element.width, element.height, captureScale))
  }

  pivoted.add(content)
  root.add(pivoted)
  return root
}
