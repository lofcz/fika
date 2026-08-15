import type { PPTElement } from '@/types/slides'

export const LQ_SHAPE_CAP = 32
export const LQ_MIN_SHAPE_AREA = 24 * 24

const areaOf = (element: PPTElement) => (
  'width' in element && 'height' in element ? element.width * element.height : 0
)

/** Keep a recognizable silhouette: images + a handful of large shapes. Skip the rest. */
export const pickLqElements = (elements: readonly PPTElement[]): PPTElement[] => {
  const keep: PPTElement[] = []
  const shapes: PPTElement[] = []
  for (const element of elements) {
    if (element.type === 'image' || element.type === 'text' || element.type === 'table' || element.type === 'chart' || element.type === 'code') {
      keep.push(element)
      continue
    }
    if (element.type === 'shape' && areaOf(element) >= LQ_MIN_SHAPE_AREA) shapes.push(element)
  }
  shapes.sort((a, b) => areaOf(b) - areaOf(a))
  return [...keep, ...shapes.slice(0, LQ_SHAPE_CAP)]
}
