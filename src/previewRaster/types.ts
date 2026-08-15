import type Konva from 'konva'
import type { PPTElement, Slide, SlideBackground } from '@/types/slides'

export type PreviewPainter = (
  element: PPTElement,
  destWidth: number,
  slideWidth: number,
  pixelRatio?: number,
) => Promise<Konva.Node | null> | Konva.Node | null

export type PreviewBackgroundPainter = (
  background: SlideBackground | undefined,
  themeBackgroundColor: string,
  width: number,
  height: number,
) => Promise<Konva.Node | null> | Konva.Node | null

export type PreviewSlideInput = Pick<Slide, 'id' | 'elements' | 'background'>

export type PreviewStageEntry = {
  slideId: string
  destWidth: number
  destHeight: number
  pixelRatio: number
  cachedDestDpr: number
}
