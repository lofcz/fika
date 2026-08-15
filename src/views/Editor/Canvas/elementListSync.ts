import type { PPTElement, Slide } from '@/types/slides'
import { tableGridStructureEqual } from '@/views/components/element/TableElement/gridCompare'

const shallowChangedKeys = (prev: object, next: object): string[] => {
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)])
  const changed: string[] = []
  for (const key of keys) {
    if ((prev as Record<string, unknown>)[key] !== (next as Record<string, unknown>)[key]) {
      changed.push(key)
    }
  }
  return changed
}

const isShapeTextContentOnly = (prev: PPTElement, next: PPTElement): boolean => {
  const prevText = 'text' in prev ? prev.text : undefined
  const nextText = 'text' in next ? next.text : undefined
  if (!nextText) return false
  if (!prevText) return true
  return shallowChangedKeys(prevText, nextText).every(key => key === 'content')
}

export const isContentLikeKey = (key: string, prev: PPTElement, next: PPTElement): boolean => {
  if (key === 'content') return true
  if (key === 'data') {
    if (prev.type === 'table' && next.type === 'table') return tableGridStructureEqual(prev.data, next.data)
    return true
  }
  if (key === 'text') return isShapeTextContentOnly(prev, next)
  return false
}

const isChromeKey = (key: string) => (
  key === 'height' || key === 'width' || key === 'fixedHeight' || key === 'vAlign'
)

export type ElementListSyncAction = 'replace' | 'skip' | 'patch-chrome'

export type SlideElementsSnap = {
  id: string
  elements: PPTElement[]
}

export const snapSlideElements = (slide: Slide | undefined): SlideElementsSnap | undefined => {
  if (!slide) return undefined
  return { id: slide.id, elements: slide.elements }
}

export const slideElementsSnapEqual = (
  prev: SlideElementsSnap | undefined,
  next: SlideElementsSnap | undefined,
  editingId: string,
) => {
  if (prev === next) return true
  if (!prev || !next) return false
  if (prev.id !== next.id) return false
  if (prev.elements === next.elements) return true
  return classifyElementListSync(
    { id: prev.id, elements: prev.elements } as Slide,
    { id: next.id, elements: next.elements } as Slide,
    editingId,
  ) === 'skip'
}

export const classifyElementListSync = (
  prev: Slide | undefined,
  next: Slide | undefined,
  editingId: string,
): ElementListSyncAction => {
  if (!next) return 'replace'
  if (!prev || prev.id !== next.id) return 'replace'
  if (prev.elements === next.elements) return 'skip'
  if (prev.elements.length !== next.elements.length) return 'replace'

  let changedIndex = -1
  for (let i = 0; i < next.elements.length; i++) {
    if (prev.elements[i].id !== next.elements[i].id) return 'replace'
    if (prev.elements[i] !== next.elements[i]) {
      if (changedIndex !== -1) return 'replace'
      changedIndex = i
    }
  }
  if (changedIndex === -1) return 'skip'

  const prevEl = prev.elements[changedIndex]
  const nextEl = next.elements[changedIndex]
  if (!editingId || nextEl.id !== editingId) return 'replace'

  const keys = shallowChangedKeys(prevEl, nextEl)
  if (keys.length === 0) return 'skip'
  if (keys.every(key => isContentLikeKey(key, prevEl, nextEl))) return 'skip'
  if (keys.every(key => isChromeKey(key) || isContentLikeKey(key, prevEl, nextEl))) return 'patch-chrome'
  return 'replace'
}

export const isInPlaceEditingContentPatch = (
  prev: Slide | undefined,
  next: Slide | undefined,
  editingId: string,
) => classifyElementListSync(prev, next, editingId) === 'skip'

export const patchEditingElementChrome = (list: PPTElement[], storeEl: PPTElement): PPTElement[] => {
  const index = list.findIndex(el => el.id === storeEl.id)
  if (index < 0) return list
  const el = list[index]
  const nextHeight = 'height' in storeEl ? storeEl.height : undefined
  const prevHeight = 'height' in el ? el.height : undefined
  const nextFixed = 'fixedHeight' in storeEl ? storeEl.fixedHeight : undefined
  const prevFixed = 'fixedHeight' in el ? el.fixedHeight : undefined
  const nextAlign = 'vAlign' in storeEl ? storeEl.vAlign : undefined
  const prevAlign = 'vAlign' in el ? el.vAlign : undefined
  if (
    el.width === storeEl.width
    && prevHeight === nextHeight
    && prevFixed === nextFixed
    && prevAlign === nextAlign
  ) return list
  const next = list.slice()
  const patched = {
    ...el,
    width: storeEl.width,
    ...(nextHeight !== undefined ? { height: nextHeight } : {}),
  } as PPTElement
  if (storeEl.type === 'text' && patched.type === 'text') {
    if (nextFixed) patched.fixedHeight = true
    else delete patched.fixedHeight
    if (nextAlign) patched.vAlign = nextAlign
    else delete patched.vAlign
  }
  next[index] = patched
  return next
}
