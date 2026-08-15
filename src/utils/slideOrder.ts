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

export const insertSlidesPreservingIdentity = (
  slides: readonly Slide[],
  index: number,
  incoming: readonly Slide[],
): Slide[] => {
  if (!incoming.length) return slides as Slide[]
  const at = Math.max(0, Math.min(index, slides.length))
  const next = slides.slice()
  next.splice(at, 0, ...incoming)
  return next
}

export const deleteSlidesPreservingIdentity = (
  slides: readonly Slide[],
  slideIds: readonly string[],
): { slides: Slide[]; deletedIndexes: number[] } => {
  const next = slides.slice()
  const deletedIndexes: number[] = []
  for (const deletedId of slideIds) {
    const index = next.findIndex(item => item.id === deletedId)
    if (index < 0) continue
    deletedIndexes.push(index)
    const section = next[index].sectionTag
    if (section && next[index + 1] && !next[index + 1].sectionTag) {
      cloneAt(next, index + 1).sectionTag = section
    }
    next.splice(index, 1)
  }
  return { slides: next, deletedIndexes }
}

export const slideIndexAfterDelete = (
  prevIndex: number,
  prevSlides: readonly Slide[],
  deletedIds: ReadonlySet<string>,
  nextLength: number,
  deletedIndexes: readonly number[],
) => {
  if (nextLength <= 0) return 0
  const prevCurrent = prevSlides[prevIndex]
  if (prevCurrent && !deletedIds.has(prevCurrent.id)) {
    const shift = deletedIndexes.filter(index => index >= 0 && index < prevIndex).length
    return prevIndex - shift
  }
  if (!deletedIndexes.length) return Math.min(prevIndex, nextLength - 1)
  const hole = Math.min(...deletedIndexes)
  return hole > nextLength - 1 ? nextLength - 1 : hole
}

export const moveSlidePreservingIdentity = (
  slides: readonly Slide[],
  fromIndex: number,
  toIndex: number,
): { slides: Slide[]; index: number } => {
  if (fromIndex < 0 || fromIndex >= slides.length) {
    return { slides: slides as Slide[], index: fromIndex }
  }
  if (fromIndex === toIndex) return { slides: slides as Slide[], index: toIndex }
  const next = slides.slice()
  const [slide] = next.splice(fromIndex, 1)
  const at = Math.max(0, Math.min(toIndex, next.length))
  next.splice(at, 0, slide)
  return { slides: next, index: at }
}
