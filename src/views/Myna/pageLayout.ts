import type { Slide } from '@/types/slides'

export interface PagePosition { x: number; y: number }
export type PageArrangement = 'grid' | 'horizontal' | 'vertical'
export const PAGE_GAP = 120
const valid = (point: PagePosition | undefined): point is PagePosition => !!point && Number.isFinite(point.x) && Number.isFinite(point.y)
const size = (value: number) => Number.isFinite(value) && value > 0 ? value : 1

/** Explicit positions may intentionally overlap. Only new, unpositioned pages avoid collisions. */
export function resolvePagePositions(slides: readonly Pick<Slide, 'id' | 'canvasPosition'>[], width: number, height: number): Map<string, PagePosition> {
  const result = new Map<string, PagePosition>()
  width = size(width); height = size(height)
  for (const slide of slides) if (valid(slide.canvasPosition)) result.set(slide.id, { ...slide.canvasPosition })
  // A fixed column count means adding a page does not rearrange existing implicit positions.
  let slot = 0
  for (const slide of slides) {
    if (result.has(slide.id)) continue
    let point: PagePosition
    do {
      point = { x: (slot % 3) * (width + PAGE_GAP), y: Math.floor(slot / 3) * (height + PAGE_GAP) }
      slot++
    } while ([...result.values()].some(other => point.x < other.x + width + PAGE_GAP && point.x + width + PAGE_GAP > other.x && point.y < other.y + height + PAGE_GAP && point.y + height + PAGE_GAP > other.y))
    result.set(slide.id, point)
  }
  return result
}

export function arrangePagePositions(slides: readonly Pick<Slide, 'id'>[], width: number, height: number, arrangement: PageArrangement): Map<string, PagePosition> {
  const columns = arrangement === 'horizontal' ? Math.max(1, slides.length) : arrangement === 'vertical' ? 1 : Math.max(1, Math.ceil(Math.sqrt(slides.length)))
  return new Map(slides.map((slide, index) => [slide.id, { x: (index % columns) * (size(width) + PAGE_GAP), y: Math.floor(index / columns) * (size(height) + PAGE_GAP) }]))
}

export function pageLayoutBounds(slides: readonly Pick<Slide, 'id' | 'canvasPosition'>[], width: number, height: number, positions = resolvePagePositions(slides, width, height)) {
  if (!slides.length) return { x: 0, y: 0, width: size(width), height: size(height) }
  const points = slides.map(slide => positions.get(slide.id) || { x: 0, y: 0 })
  const x = Math.min(...points.map(point => point.x)), y = Math.min(...points.map(point => point.y))
  return { x, y, width: Math.max(...points.map(point => point.x)) + size(width) - x, height: Math.max(...points.map(point => point.y)) + size(height) - y }
}

/** Move complete groups with their element-linked notes and animations; page-local geometry is retained. */
export function movePageElements(source: Slide, target: Slide, selectedIds: readonly string[]): { source: Slide; target: Slide; movedIds: string[] } {
  if (source.id === target.id) return { source, target, movedIds: [] }
  const selected = new Set(selectedIds)
  const groups = new Set(source.elements.filter(element => selected.has(element.id) && element.groupId).map(element => element.groupId))
  const moved = source.elements.filter(element => selected.has(element.id) || !!element.groupId && groups.has(element.groupId))
  const ids = new Set(moved.map(element => element.id))
  if (!ids.size) return { source, target, movedIds: [] }
  return {
    source: { ...source, elements: source.elements.filter(element => !ids.has(element.id)), animations: source.animations?.filter(animation => !ids.has(animation.elId)), notes: source.notes?.filter(note => !note.elId || !ids.has(note.elId)) },
    target: { ...target, elements: [...target.elements, ...moved], animations: [...(target.animations || []), ...(source.animations || []).filter(animation => ids.has(animation.elId))], notes: [...(target.notes || []), ...(source.notes || []).filter(note => !!note.elId && ids.has(note.elId))] },
    movedIds: [...ids],
  }
}
