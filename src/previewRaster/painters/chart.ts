import Konva from 'konva'
import type { PPTChartElement } from '@/types/slides'
import { chartElementToBoothHtml } from '@/views/components/element/ChartElement/chartBooth'
import { rasterHtml } from './booth'

export const paintChart = async (element: PPTChartElement, captureScale = 1) => {
  const group = new Konva.Group({ listening: false })
  if (element.fill) {
    group.add(new Konva.Rect({
      width: element.width,
      height: element.height,
      fill: element.fill,
      listening: false,
    }))
  }
  if (element.outline?.width) {
    group.add(new Konva.Rect({
      width: element.width,
      height: element.height,
      stroke: element.outline.color || '#cbd5e1',
      strokeWidth: element.outline.width,
      listening: false,
    }))
  }
  const html = await chartElementToBoothHtml(element)
  const chart = await rasterHtml(html, element.width, element.height, captureScale)
  group.add(chart)
  if (element.rotate) group.rotation(element.rotate)
  return group
}
