import type { SlideGuide } from '@/types/slides'
import type { SnapBox, SnapResult } from './snap'

/** Import may contain unknown metadata. Ignore invalid guides before geometry calculations. */
export function validPageGuides(value: unknown): SlideGuide[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value.filter((guide): guide is SlideGuide => {
    if (!guide || typeof guide.id !== 'string' || !guide.id || seen.has(guide.id) || (guide.axis !== 'x' && guide.axis !== 'y') || !Number.isFinite(guide.position)) return false
    seen.add(guide.id)
    return true
  })
}

/** Explicit guides take priority within six screen pixels, independent of zoom. */
export function snapToPageGuides(box: SnapBox, guides: readonly SlideGuide[], scale: number, base: SnapResult): SnapResult {
  const threshold = 6 / Math.max(.01, scale)
  const result = { ...base, guides: [...base.guides] }
  for (const axis of ['x', 'y'] as const) {
    const anchors = axis === 'x' ? [box.minX, (box.minX + box.maxX) / 2, box.maxX] : [box.minY, (box.minY + box.maxY) / 2, box.maxY]
    let best: { delta: number; position: number } | undefined
    for (const guide of guides) {
      if (guide.axis !== axis || !Number.isFinite(guide.position)) continue
      for (const anchor of anchors) {
        const delta = guide.position - anchor
        if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, position: guide.position }
      }
    }
    if (!best) continue
    const type = axis === 'x' ? 'vertical' : 'horizontal'
    result.guides = result.guides.filter(guide => guide.type !== type)
    if (axis === 'x') {
      result.offsetX = best.delta
      result.guides.push({ type, kind: 'edge', axis: { x: best.position, y: box.minY - 14 }, length: box.maxY - box.minY + 28 })
    } else {
      result.offsetY = best.delta
      result.guides.push({ type, kind: 'edge', axis: { x: box.minX - 14, y: best.position }, length: box.maxX - box.minX + 28 })
    }
  }
  return result
}
