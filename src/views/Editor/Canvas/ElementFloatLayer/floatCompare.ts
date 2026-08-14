import type { PPTElement, Slide } from '@/types/slides'

type SlidesLookup = {
  slides: Slide[]
  slideIndex: number
}

export function findSlideElement(state: SlidesLookup, id: string) {
  return state.slides[state.slideIndex]?.elements.find(element => element.id === id) || null
}

export function elementLayoutSignature(element: PPTElement) {
  const link = element.link ? `${element.link.type}:${element.link.target}` : ''
  if (element.type === 'line') {
    return [
      element.id,
      element.type,
      element.left,
      element.top,
      element.start[0],
      element.start[1],
      element.end[0],
      element.end[1],
      link,
    ].join('|')
  }
  return [
    element.id,
    element.type,
    element.left,
    element.top,
    element.width,
    element.height,
    element.rotate,
    link,
  ].join('|')
}

export function elementListLayoutEqual(prev: PPTElement[], next: PPTElement[]) {
  if (prev === next) return true
  if (prev.length !== next.length) return false
  for (let i = 0; i < prev.length; i++) {
    if (elementLayoutSignature(prev[i]) !== elementLayoutSignature(next[i])) return false
  }
  return true
}

export function sameOffsetStyle(prev?: Record<string, string>, next?: Record<string, string>) {
  if (prev === next) return true
  if (!prev || !next) return false
  return prev.left === next.left && prev.top === next.top
}

export function sameElementId<T extends { elementInfo: { id: string } }>(prev: T, next: T) {
  return prev.elementInfo.id === next.elementInfo.id
}
