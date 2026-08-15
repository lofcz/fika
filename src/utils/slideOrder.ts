import type { Slide } from '@/types/slides'

const cloneAt = (slides: Slide[], index: number) => {
  slides[index] = { ...slides[index] }
  return slides[index]
}

/** Reorder slides without cloning unchanged slide objects (elements/background stay referentially equal). */
export const reorderSlidesPreservingIdentity = (
  slides: readonly Slide[],
  oldIndex: number,
  newIndex: number,
): Slide[] => {
  if (oldIndex === newIndex) return slides as Slide[]
  if (oldIndex < 0 || newIndex < 0 || oldIndex >= slides.length || newIndex >= slides.length) {
    return slides as Slide[]
  }

  const next = slides.slice()
  const movingSection = next[oldIndex].sectionTag
  if (movingSection) {
    delete cloneAt(next, oldIndex).sectionTag
    if (next[oldIndex + 1] && !next[oldIndex + 1].sectionTag) {
      cloneAt(next, oldIndex + 1).sectionTag = movingSection
    }
  }

  if (newIndex === 0) {
    const firstSection = next[0].sectionTag
    if (firstSection) {
      delete cloneAt(next, 0).sectionTag
      cloneAt(next, oldIndex).sectionTag = firstSection
    }
  }

  const [slide] = next.splice(oldIndex, 1)
  next.splice(newIndex, 0, slide)
  return next
}
