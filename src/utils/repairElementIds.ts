import type { Slide } from '@/types/slides'

/**
 * Element ids must be unique across a deck: lookups by id (editor commits,
 * agent commands without a slideId) take the first match. Decks saved while a
 * gesture could commit one slide's element list onto another carry whole
 * slides of repeated ids. Later repeats get a slide-scoped id (deterministic,
 * so reloading the same saved deck yields the same ids), and references inside
 * that slide (frames, animations, notes) follow. Returns `slides` itself when
 * nothing collides.
 */
export function repairDuplicateElementIds(slides: Slide[]): Slide[] {
  const taken = new Set<string>()
  for (const slide of slides) for (const el of slide.elements || []) taken.add(el.id)
  const seen = new Set<string>()
  let changed = false
  const repaired = slides.map(slide => {
    const elements = slide.elements || []
    const map = new Map<string, string>()
    for (const el of elements) {
      if (!seen.has(el.id) || map.has(el.id)) continue
      let id = `${el.id}-${slide.id}`
      for (let n = 2; taken.has(id); n++) id = `${el.id}-${slide.id}-${n}`
      taken.add(id)
      map.set(el.id, id)
    }
    for (const el of elements) seen.add(map.get(el.id) ?? el.id)
    if (!map.size) return slide
    changed = true
    const remap = (id: string | undefined) => (id && map.get(id)) || id
    return {
      ...slide,
      elements: elements.map(el => ({
        ...el,
        id: remap(el.id)!,
        ...(el.parentFrameId ? { parentFrameId: remap(el.parentFrameId) } : {}),
      })),
      ...(slide.animations ? { animations: slide.animations.map(a => ({ ...a, elId: remap(a.elId)! })) } : {}),
      ...(slide.notes ? { notes: slide.notes.map(note => note.elId ? { ...note, elId: remap(note.elId) } : note) } : {}),
    }
  })
  return changed ? repaired : slides
}
