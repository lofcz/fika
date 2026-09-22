import type { Slide } from '@/types/slides'
import { resolvePagePositions } from '@/views/Myna/pageLayout'

/** Move a complete selection between page coordinate spaces in one transaction. */
export function transferPageElements(slides: Slide[], sourceId: string, targetId: string, ids: readonly string[], width: number, height: number) {
  const source = slides.find(page => page.id === sourceId), target = slides.find(page => page.id === targetId)
  if (!source || !target || source === target) return slides
  const positions = resolvePagePositions(slides, width, height)
  const from = positions.get(sourceId)!, to = positions.get(targetId)!
  const moving = new Set(ids)
  const elements = source.elements.filter(el => moving.has(el.id)).map(el => ({
    ...el, left: el.left + from.x - to.x, top: el.top + from.y - to.y,
    ...(el.parentFrameId && !moving.has(el.parentFrameId) ? { parentFrameId: undefined } : {}),
  }))
  if (!elements.length) return slides
  const animations = source.animations?.filter(animation => moving.has(animation.elId)) || []
  return slides.map(page => page === source ? {
    ...page, elements: page.elements.filter(el => !moving.has(el.id)),
    ...(page.animations ? { animations: page.animations.filter(animation => !moving.has(animation.elId)) } : {}),
  } : page === target ? {
    ...page, elements: [...page.elements, ...elements],
    ...(animations.length ? { animations: [...(page.animations || []), ...animations] } : {}),
  } : page)
}
