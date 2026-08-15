import type { PPTElement } from '@/types/slides'
import { isUnfilledPlaceholder } from '@/utils/placeholderPaint'
import { previewWorkingWidth } from '@/views/Editor/Thumbnails/paneSize'
import { paintImage } from './image'
import { paintShape } from './shape'
import { paintLine } from './line'
import { paintText } from './text'
import { paintTable } from './table'
import { paintChart } from './chart'
import { paintMedia } from './media'
import { latexToBoothHtml, mermaidToBoothHtml, rasterHtml } from './booth'
import { paintCode } from './code'

export const paintElement = async (
  element: PPTElement,
  destWidth: number,
  slideWidth: number,
  pixelRatio = 1,
) => {
  if (element.type === 'text' && isUnfilledPlaceholder(element)) return null
  const captureScale = previewWorkingWidth(destWidth, pixelRatio) / Math.max(1, slideWidth)
  switch (element.type) {
    case 'image':
      return paintImage(element)
    case 'shape':
      return paintShape(element, captureScale)
    case 'line':
      return paintLine(element)
    case 'text':
      return paintText(element, captureScale)
    case 'table':
      return paintTable(element, captureScale)
    case 'chart':
      return paintChart(element, captureScale)
    case 'video':
    case 'audio':
      return paintMedia(element)
    case 'latex':
      return rasterHtml(latexToBoothHtml(element), element.width, element.height, captureScale)
    case 'mermaid':
      return rasterHtml(mermaidToBoothHtml(element), element.width, element.height, captureScale)
    case 'code':
      return paintCode(element, captureScale)
    default:
      return null
  }
}

export { paintBackground } from './background'
