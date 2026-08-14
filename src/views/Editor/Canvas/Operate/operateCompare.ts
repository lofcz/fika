import type { CSSProperties } from 'react'
import type { PPTElement } from '@/types/slides'

/** HTML / cell text — operate chrome does not read these while idle. */
const CONTENT_KEYS = new Set(['content', 'text'])

export function styleEqual(a?: CSSProperties, b?: CSSProperties) {
  if (a === b) return true
  if (!a || !b) return !a && !b
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    if ((a as Record<string, unknown>)[key] !== (b as Record<string, unknown>)[key]) return false
  }
  return true
}

export function deepEqualIgnore(a: unknown, b: unknown, ignoreKeys: ReadonlySet<string>): boolean {
  if (a === b) return true
  if (a == null || b == null) return a === b
  if (typeof a !== typeof b) return false
  if (typeof a !== 'object') return a === b

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!deepEqualIgnore(a[i], b[i], ignoreKeys)) return false
    }
    return true
  }

  const aObj = a as Record<string, unknown>
  const bObj = b as Record<string, unknown>
  const keys = new Set([...Object.keys(aObj), ...Object.keys(bObj)])
  for (const key of keys) {
    if (ignoreKeys.has(key)) continue
    if (!deepEqualIgnore(aObj[key], bObj[key], ignoreKeys)) return false
  }
  return true
}

export function elementChromeEqual(prev: PPTElement, next: PPTElement, ignoreContent = true) {
  if (prev === next) return true
  return deepEqualIgnore(prev, next, ignoreContent ? CONTENT_KEYS : new Set())
}

export function boxGeometryChanged(prev: PPTElement, next: PPTElement) {
  if (prev.left !== next.left || prev.top !== next.top || prev.width !== next.width) return true
  const prevH = 'height' in prev ? prev.height : 0
  const nextH = 'height' in next ? next.height : 0
  if (prevH !== nextH) return true
  const prevR = 'rotate' in prev ? prev.rotate : 0
  const nextR = 'rotate' in next ? next.rotate : 0
  return prevR !== nextR
}

type OperateFlags = {
  isSelected: boolean
  isActive: boolean
  isActiveGroupElement: boolean
  isMultiSelect: boolean
  isEditing: boolean
  className?: string
  style?: CSSProperties
  elementInfo: PPTElement
}

export function operatePropsEqual(prev: OperateFlags, next: OperateFlags, ignoreContent = true) {
  if (prev.isSelected !== next.isSelected) return false
  if (prev.isActive !== next.isActive) return false
  if (prev.isActiveGroupElement !== next.isActiveGroupElement) return false
  if (prev.isMultiSelect !== next.isMultiSelect) return false
  if (prev.isEditing !== next.isEditing) return false
  if (prev.className !== next.className) return false
  if (prev.style?.display !== next.style?.display) return false
  return elementChromeEqual(prev.elementInfo, next.elementInfo, ignoreContent)
}

export function typedOperateEqual<T extends { elementInfo: PPTElement; handlerVisible: boolean }>(prev: T, next: T, ignoreContent = true) {
  if (prev.handlerVisible !== next.handlerVisible) return false
  return elementChromeEqual(prev.elementInfo, next.elementInfo, ignoreContent)
}

export function multiSelectOperateEqual(prev: { elementList: PPTElement[] }, next: { elementList: PPTElement[] }, ignoreContent = true) {
  const a = prev.elementList
  const b = next.elementList
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false
    if (!elementChromeEqual(a[i], b[i], ignoreContent)) return false
  }
  return true
}

export function handlerChromeEqual<T extends { type?: unknown; rotate?: number; className?: string; style?: CSSProperties }>(prev: T, next: T) {
  return prev.type === next.type
    && prev.rotate === next.rotate
    && prev.className === next.className
    && styleEqual(prev.style, next.style)
}
