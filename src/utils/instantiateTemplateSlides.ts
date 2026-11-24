import { nanoid } from 'nanoid'
import type { Slide } from '@/types/slides'
import { clonePlain } from './clonePlain'
import { createElementIdMap, createSlideIdMap } from './element'

/** Copy a batch together so links between its pages follow the new pages. */
export function instantiateTemplateSlides(source: Slide[], { preserveExternalSlideLinks = true } = {}): Slide[] {
  const slides = clonePlain(source)
  const slideIds = createSlideIdMap(slides)
  const sectionIds = new Map<string, string>()
  for (const slide of slides) {
    const { elIdMap, groupIdMap } = createElementIdMap(slide.elements)
    slide.id = slideIds[slide.id]
    for (const el of slide.elements) {
      el.id = elIdMap[el.id]
      if (el.groupId) el.groupId = groupIdMap[el.groupId]
      if (el.parentFrameId) el.parentFrameId = elIdMap[el.parentFrameId]
      if (el.link?.type === 'slide') {
        const target = slideIds[el.link.target]
        if (target) el.link.target = target
        else if (!preserveExternalSlideLinks) delete el.link
      }
      if (el.type === 'table') {
        for (const row of el.data) for (const cell of row) cell.id = nanoid(10)
      }
    }
    if (slide.animations) {
      slide.animations = slide.animations.filter(animation => elIdMap[animation.elId])
      for (const animation of slide.animations) {
        animation.id = nanoid(10)
        animation.elId = elIdMap[animation.elId]
      }
    }
    for (const note of slide.notes ?? []) {
      note.id = nanoid(10)
      if (note.elId) note.elId = elIdMap[note.elId]
      for (const reply of note.replies ?? []) reply.id = nanoid(10)
    }
    for (const guide of slide.guides ?? []) guide.id = nanoid(10)
    for (const label of slide.workspaceLabels ?? []) {
      label.id = nanoid(10)
      if (label.pageIds) {
        label.pageIds = label.pageIds.flatMap(id => slideIds[id] ?? (preserveExternalSlideLinks ? id : []))
      }
    }
    if (slide.sectionTag) {
      const section = slide.sectionTag
      if (!sectionIds.has(section.id)) sectionIds.set(section.id, nanoid(10))
      section.id = sectionIds.get(section.id)!
    }
  }
  return slides
}
