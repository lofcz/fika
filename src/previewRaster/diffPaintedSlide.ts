import { deepEqual } from 'fast-equals'
import type { PPTElement, Slide, SlideBackground } from '@/types/slides'

export type PaintedSlide = Pick<Slide, 'id' | 'elements' | 'background' | 'type'>

export type PaintedSlideDiff = {
  added: string[]
  removed: string[]
  contentChanged: string[]
  movedOnly: string[]
  zOrderChanged: boolean
  backgroundChanged: boolean
}

const POSITION_KEYS = new Set(['left', 'top'])

const paintPropsOf = (element: PPTElement): Record<string, unknown> => {
  const next: Record<string, unknown> = { ...element }
  delete next.left
  delete next.top
  return next
}

const isMoveOnly = (prev: PPTElement, next: PPTElement) => {
  if (prev === next) return false
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)])
  for (const key of keys) {
    if (POSITION_KEYS.has(key)) continue
    if (!deepEqual((prev as unknown as Record<string, unknown>)[key], (next as unknown as Record<string, unknown>)[key])) return false
  }
  return prev.left !== next.left || prev.top !== next.top
}

export function diffPaintedSlide(prev: PaintedSlide | undefined, next: PaintedSlide | undefined): PaintedSlideDiff {
  const empty: PaintedSlideDiff = {
    added: [],
    removed: [],
    contentChanged: [],
    movedOnly: [],
    zOrderChanged: false,
    backgroundChanged: false,
  }
  if (!prev && !next) return empty
  if (!prev && next) {
    return { ...empty, added: next.elements.map(el => el.id), backgroundChanged: true }
  }
  if (prev && !next) {
    return { ...empty, removed: prev.elements.map(el => el.id) }
  }
  const before = prev!
  const after = next!
  const prevById = new Map(before.elements.map(el => [el.id, el]))
  const nextById = new Map(after.elements.map(el => [el.id, el]))
  const added: string[] = []
  const removed: string[] = []
  const contentChanged: string[] = []
  const movedOnly: string[] = []
  for (const [id, el] of nextById) {
    const older = prevById.get(id)
    if (!older) {
      added.push(id)
      continue
    }
    if (older === el) continue
    if (isMoveOnly(older, el)) movedOnly.push(id)
    else if (!deepEqual(paintPropsOf(older), paintPropsOf(el))) contentChanged.push(id)
  }
  for (const id of prevById.keys()) {
    if (!nextById.has(id)) removed.push(id)
  }
  const prevOrder = before.elements.map(el => el.id).join('\0')
  const nextOrder = after.elements.map(el => el.id).join('\0')
  return {
    added,
    removed,
    contentChanged,
    movedOnly,
    zOrderChanged: prevOrder !== nextOrder,
    backgroundChanged: !deepEqual(before.background as SlideBackground | undefined, after.background),
  }
}
