import type { PPTCodeElement } from '@/types/slides'
import { codeElementToBoothHtml } from '@/utils/codeHighlight'
import { rasterHtml } from './booth'

export const paintCode = async (element: PPTCodeElement, captureScale: number) => {
  const html = await codeElementToBoothHtml(element)
  return rasterHtml(html, element.width, element.height, captureScale)
}
