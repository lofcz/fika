import type { Slide } from '@/types/slides'
import type { FikaDeckViewport } from './agentic/types'

const DEFAULT_SIZE = 1000
const DEFAULT_RATIO = 0.5625

const STANDARD_VIEWPORTS: FikaDeckViewport[] = [
  { size: 1280, ratio: 720 / 1280 },
  { size: 1920, ratio: 1080 / 1920 },
]

function elementRight(element: Slide['elements'][number]): number {
  const width = 'width' in element && typeof element.width === 'number' ? element.width : 0
  return (element.left ?? 0) + width
}

function elementBottom(element: Slide['elements'][number]): number {
  const height = 'height' in element && typeof element.height === 'number' ? element.height : 0
  return (element.top ?? 0) + height
}

function contentBounds(slides: Slide[]): { maxRight: number; maxBottom: number } {
  let maxRight = 0
  let maxBottom = 0
  for (const slide of slides) {
    for (const element of slide.elements ?? []) {
      const right = elementRight(element)
      const bottom = elementBottom(element)
      if (right > maxRight) maxRight = right
      if (bottom > maxBottom) maxBottom = bottom
    }
  }
  return { maxRight, maxBottom }
}

function fits(maxRight: number, maxBottom: number, size: number, ratio: number): boolean {
  return maxRight <= size + 1 && maxBottom <= size * ratio + 1
}

/**
 * Recover the authored coordinate space from element bounds.
 *
 * Agent/import pipelines often author at 1280×720. Remounting those slides on
 * the 1000×16:9 default (or a persisted default written before inference)
 * overflows the canvas. Prefer an explicit viewport when it actually contains
 * the content; otherwise upgrade to the smallest standard size that fits.
 */
export function inferViewportFromSlides(
  slides: Slide[],
  existing?: Partial<FikaDeckViewport>,
): FikaDeckViewport | undefined {
  const { maxRight, maxBottom } = contentBounds(slides)
  const size = existing?.size ?? DEFAULT_SIZE
  const ratio = existing?.ratio ?? DEFAULT_RATIO

  if (fits(maxRight, maxBottom, size, ratio)) {
    return existing?.size ? { size, ratio } : undefined
  }

  for (const candidate of STANDARD_VIEWPORTS) {
    if (fits(maxRight, maxBottom, candidate.size, candidate.ratio)) return candidate
  }

  return {
    size: Math.ceil(maxRight),
    ratio: maxBottom / Math.max(maxRight, 1),
  }
}
