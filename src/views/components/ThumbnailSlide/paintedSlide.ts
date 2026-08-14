import { useSlidesStore } from '@/store'
import type { Slide } from '@/types/slides'
import { useToolbarStoreSelect } from '@/views/Editor/Toolbar/common/handleElement'

export type PaintedSlide = Pick<Slide, 'id' | 'elements' | 'background' | 'type'>

export function selectPaintedSlide<T extends { slides: Slide[] }>(state: T, slideId: string): Slide | undefined {
  return state.slides.find(slide => slide.id === slideId)
}

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

export function areRailSlidesEqual(a: Slide[], b: Slide[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (!areRailItemSlidesEqual(a[i], b[i])) return false
  }
  return true
}

export function usePaintedSlide(slideId: string, fallback: Slide): Slide {
  return useToolbarStoreSelect(
    () => selectPaintedSlide(useSlidesStore.getState(), slideId) ?? fallback,
    arePaintedSlideIdentitiesEqual,
  )
}

export function useRailItemSlide(slideId: string): Slide | undefined {
  return useToolbarStoreSelect(
    () => useSlidesStore.getState().slides.find(item => item.id === slideId),
    areRailItemSlidesEqual,
  )
}

export function useRailSlides(): Slide[] {
  return useToolbarStoreSelect(() => useSlidesStore.getState().slides, areRailSlidesEqual)
}
