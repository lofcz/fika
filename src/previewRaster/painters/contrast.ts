import type { PPTShapeElement, PPTTextElement, Slide, SlideBackground } from '@/types/slides'
import { resolveLiveTextPaint } from '@/utils/textContrast'

export type RasterPaintContext = {
  background?: SlideBackground
  themeBackgroundColor?: string
  themeFontColor?: string
  elements?: Slide['elements']
}

export const rasterPaintContextOf = (slide: Slide, theme: { backgroundColor?: string; fontColor?: string }): RasterPaintContext => ({
  background: slide.background,
  themeBackgroundColor: theme.backgroundColor,
  themeFontColor: theme.fontColor,
  elements: slide.elements,
})

export const resolveRasterTextPaint = (
  preferred: string | undefined,
  html: string,
  element: PPTTextElement | PPTShapeElement | undefined,
  ctx?: RasterPaintContext,
) => resolveLiveTextPaint(preferred, html, {
  element,
  fill: element?.fill,
  elements: ctx?.elements,
  background: ctx?.background,
  fallbackSurface: ctx?.themeBackgroundColor,
  themeFontColor: ctx?.themeFontColor,
})
