import type { CSSProperties } from 'react'
import type { PPTElement } from '@/types/slides'
import { frameClipPolygon } from './nestedFrames'
const clips = new WeakMap<PPTElement[], Map<PPTElement, CSSProperties | undefined>>()
export function frameDomClip(element: PPTElement, elements: PPTElement[]): CSSProperties | undefined {
  if (!element.parentFrameId) return undefined
  let cache = clips.get(elements)
  if (!cache) { cache = new Map(); clips.set(elements, cache) }
  if (cache.has(element)) return cache.get(element)
  const points = frameClipPolygon(element, elements)
  if (points === null) { cache.set(element, undefined); return undefined }
  const style: CSSProperties = { position: 'absolute', inset: 0, clipPath: points.length ? `polygon(${points.map(p => `${p.x}px ${p.y}px`).join(',')})` : 'polygon(0px 0px,0px 0px,0px 0px)' }
  cache.set(element, style)
  return style
}
