import type { PPTElement } from '@/types/slides'
import { isUnfilledPlaceholder } from '@/utils/placeholderPaint'
import { previewWorkingWidth, type PreviewWorkingQuality } from '@/views/Editor/Thumbnails/paneSize'
import { paintImage } from './image'
import { paintShape, paintSimpleShape } from './shape'
import { isAxisAlignedRectPath, isSimpleShape } from '../simpleShape'
import { paintLine } from './line'
import { paintText } from './text'
import { paintTable } from './table'
import { paintChart } from './chart'
import { paintMedia } from './media'
import { paintLatex, paintMermaid } from './booth'
import { paintCode } from './code'
import type { RasterPaintContext } from './contrast'
import { paintLqElement } from './lq'
import { timePhase, timePhaseSync, type RasterPhase } from '../stats'

const phaseOf = (type: PPTElement['type']): RasterPhase => {
  if (type === 'text') return 'text'
  if (type === 'shape') return 'shape'
  if (type === 'image') return 'image'
  return 'other'
}

export const paintElement = (
  element: PPTElement,
  destWidth: number,
  slideWidth: number,
  pixelRatio = 1,
  quality: PreviewWorkingQuality = 'full',
  paintContext?: RasterPaintContext,
) => {
  if (element.type === 'text' && isUnfilledPlaceholder(element)) return null
  if (quality === 'lq') return timePhaseSync(phaseOf(element.type), () => paintLqElement(element, paintContext))
  if (element.type === 'shape' && isSimpleShape(element) && isAxisAlignedRectPath(element.path, element.viewBox)) {
    return timePhaseSync('shape', () => paintSimpleShape(element))
  }
  const captureScale = previewWorkingWidth(destWidth, pixelRatio, quality) / Math.max(1, slideWidth)
  return timePhase(phaseOf(element.type), () => {
    switch (element.type) {
      case 'image':
        return paintImage(element)
      case 'shape':
        return paintShape(element, captureScale, paintContext)
      case 'line':
        return paintLine(element)
      case 'text':
        return paintText(element, captureScale, paintContext)
      case 'table':
        return paintTable(element, captureScale)
      case 'chart':
        return paintChart(element, captureScale)
      case 'video':
      case 'audio':
        return paintMedia(element)
      case 'latex':
        return paintLatex(element, captureScale)
      case 'mermaid':
        return paintMermaid(element)
      case 'code':
        return paintCode(element, captureScale)
      default:
        return null
    }
  })
}

export { paintBackground } from './background'
