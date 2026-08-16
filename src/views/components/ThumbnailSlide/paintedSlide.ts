import { useSlidesStore } from '@/store'
import type { Slide } from '@/types/slides'
import { diffPaintedSlide, type PaintedSlide, type PaintedSlideDiff } from '@/utils/diffPaintedSlide'

export type { PaintedSlide, PaintedSlideDiff }
export { diffPaintedSlide }

export type RailSlideMeta = {
  id: string
  sectionTag: Slide['sectionTag']
}

let cachedSlides: Slide[] | null = null
let railMetas: RailSlideMeta[] = []

function syncRailMetas(slides: Slide[]) {
  if (cachedSlides === slides) return
  const nextMetas: RailSlideMeta[] = slides.map(slide => ({
    id: slide.id,
    sectionTag: slide.sectionTag,
  }))
  cachedSlides = slides
  railMetas = areRailSlideMetasEqual(railMetas, nextMetas) ? railMetas : nextMetas
}

export function selectPaintedSlide<T extends { slides: Slide[] }>(state: T, slideId: string): Slide | undefined {
  return state.slides.find(slide => slide.id === slideId)
}

const backgroundMediaKey = (slide: Slide) => (
  slide.background?.type === 'image' ? slide.background.image?.src || '' : ''
)

const elementAuthoredKey = (el: Slide['elements'][number]) => {
  if (el.type === 'text') return el.content || ''
  if (el.type === 'shape') return `${el.text?.content || ''}\x1f${el.pattern || ''}`
  if (el.type === 'chart') return `${el.chartType}:${el.themeColors?.join(',')}:${el.options?.stack ? 1 : 0}:${JSON.stringify(el.data)}`
  if (el.type === 'image') return el.src || ''
  if (el.type === 'video' || el.type === 'audio') return el.poster || ''
  return ''
}

const elementPaintKey = (el: Slide['elements'][number]) => {
  const box = `${el.width}x${'height' in el ? el.height : ''}`
  if (el.type === 'text') return `${el.content || ''}\x1f${el.fixedHeight ? 1 : 0}\x1f${box}`
  if (el.type === 'shape') return `${el.text?.content || ''}\x1f${el.pattern || ''}\x1f${el.text?.fixedHeight === false ? 0 : 1}\x1f${box}`
  if (el.type === 'chart') return `${el.chartType}\x1f${el.themeColors?.join(',')}\x1f${el.options?.stack ? 1 : 0}\x1f${JSON.stringify(el.data)}\x1f${box}`
  if (el.type === 'image') return `${el.src || ''}\x1f${box}`
  if (el.type === 'video' || el.type === 'audio') return `${el.poster || ''}\x1f${box}`
  return box
}

export const paintedSlideAuthoredKey = (slide: Slide | undefined) => {
  if (!slide) return ''
  return `${backgroundMediaKey(slide)}\0${slide.elements.map(elementAuthoredKey).join('\0')}`
}

export const paintedSlidePaintKey = (slide: Slide | undefined) => {
  if (!slide) return ''
  return `${backgroundMediaKey(slide)}\0${slide.elements.map(elementPaintKey).join('\0')}`
}

export const selectPaintedSlideAuthoredKey = <T extends { slides: Slide[] }>(
  state: T,
  slideId: string,
) => paintedSlideAuthoredKey(selectPaintedSlide(state, slideId))

export const selectPaintedSlidePaintKey = <T extends { slides: Slide[] }>(
  state: T,
  slideId: string,
) => paintedSlidePaintKey(selectPaintedSlide(state, slideId))

/** Slide object identity is stable across content writes (immer + autoFreeze: false). */
export const paintedSlideContentEqual = (
  a: Slide | undefined,
  b: Slide | undefined,
) => a === b && a?.elements === b?.elements && paintedSlideAuthoredKey(a) === paintedSlideAuthoredKey(b)

export function arePaintedSlideIdentitiesEqual(a: PaintedSlide | undefined, b: PaintedSlide | undefined): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.id === b.id
    && a.elements === b.elements
    && a.background === b.background
    && a.type === b.type
}

export function areRailItemSlidesEqual(a: Slide | undefined, b: Slide | undefined): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return arePaintedSlideIdentitiesEqual(a, b)
    && a.sectionTag === b.sectionTag
    && a.notes === b.notes
}

export function areRailSlideMetasEqual(a: RailSlideMeta[], b: RailSlideMeta[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const left = a[i]
    const right = b[i]
    if (left.id !== right.id || left.sectionTag !== right.sectionTag) return false
  }
  return true
}

export function areRailSlidesEqual(a: Slide[], b: Slide[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (!areRailItemSlidesEqual(a[i], b[i])) return false
  }
  return true
}

export function usePaintedSlide(slideId: string, fallback: Slide): Slide {
  return useSlidesStore(state => selectPaintedSlide(state, slideId) ?? fallback)
}

export function useRailItemSlide(slideId: string): Slide | undefined {
  return useSlidesStore(state => selectPaintedSlide(state, slideId))
}

export function useRailSlideMetas(): RailSlideMeta[] {
  return useSlidesStore(state => {
    syncRailMetas(state.slides)
    return railMetas
  })
}

export function useRailSlides(): Slide[] {
  return useSlidesStore(state => state.slides)
}
