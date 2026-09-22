import type { PPTElement, PPTShapeElement } from '@/types/slides'
const frameIndexes = new WeakMap<readonly PPTElement[], Map<string, PPTElement>>()
function frameIndex(elements: readonly PPTElement[]) {
  let index = frameIndexes.get(elements)
  if (!index) { index = new Map(elements.map(el => [el.id, el])); frameIndexes.set(elements, index) }
  return index
}
export type FramePoint = { x: number; y: number }
export const isFrame = (element: PPTElement): element is PPTShapeElement => element.type === 'shape' && !!element.frame
export function frameAncestors(element: PPTElement, elements: readonly PPTElement[]): PPTShapeElement[] {
  if (!element.parentFrameId) return []
  const index = frameIndex(elements)
  const result: PPTShapeElement[] = [], seen = new Set([element.id])
  let parent = element.parentFrameId
  while (parent && !seen.has(parent)) {
    seen.add(parent)
    const frame = index.get(parent)
    if (!frame || !isFrame(frame)) break
    result.push(frame); parent = frame.parentFrameId
  }
  return result
}
export function frameDescendantIds(elements: readonly PPTElement[], ids: readonly string[]): string[] {
  const result = new Set(ids)
  let changed = true
  while (changed) { changed = false; for (const el of elements) if (el.parentFrameId && result.has(el.parentFrameId) && !result.has(el.id)) { result.add(el.id); changed = true } }
  return [...result]
}
export function frameCorners(element: PPTElement): FramePoint[] {
  if (element.type === 'line') {
    const points = [element.start, element.end, ...(element.curve ? [element.curve] : []), ...(element.cubic || []), ...(element.broken ? [element.broken] : []), ...(element.broken2 ? [element.broken2] : [])]
    const xs = points.map(p => p[0] + element.left), ys = points.map(p => p[1] + element.top)
    return [{x:Math.min(...xs),y:Math.min(...ys)},{x:Math.max(...xs),y:Math.min(...ys)},{x:Math.max(...xs),y:Math.max(...ys)},{x:Math.min(...xs),y:Math.max(...ys)}]
  }
  const cx = element.left + element.width / 2, cy = element.top + element.height / 2, angle = (element.rotate || 0) * Math.PI / 180
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => ({ x: cx + x * element.width / 2 * Math.cos(angle) - y * element.height / 2 * Math.sin(angle), y: cy + x * element.width / 2 * Math.sin(angle) + y * element.height / 2 * Math.cos(angle) }))
}
const cross = (a: FramePoint, b: FramePoint, p: FramePoint) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
function intersect(subject: FramePoint[], clip: FramePoint[]) {
  let output = subject
  for (let i = 0; i < clip.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length], input = output; output = []
    if (!input.length) break
    for (let j = 0; j < input.length; j++) {
      const p = input[j], q = input[(j + 1) % input.length], dp = cross(a, b, p), dq = cross(a, b, q), pin = dp >= -1e-8, qin = dq >= -1e-8
      if (pin) output.push(p)
      if (pin !== qin) { const t = dp / (dp - dq); output.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }) }
    }
  }
  return output
}
export function frameClipPolygon(element: PPTElement, elements: readonly PPTElement[]): FramePoint[] | null {
  let polygon: FramePoint[] | null = null
  for (const frame of frameAncestors(element, elements)) if (frame.frame?.clipContent) polygon = polygon === null ? frameCorners(frame) : intersect(polygon, frameCorners(frame))
  return polygon
}
export function createFrameFromSelection(elements: readonly PPTElement[], ids: readonly string[], frameId: string, name: string): { elements: PPTElement[]; selection: string[] } {
  const groupIds = new Set(elements.filter(el => ids.includes(el.id)).map(el => el.groupId).filter(Boolean))
  ids = elements.filter(el => ids.includes(el.id) || (!!el.groupId && groupIds.has(el.groupId))).map(el => el.id)
  const selected = elements.filter(el => ids.includes(el.id))
  if (selected.some(el => el.lock || frameAncestors(el, elements).some(parent => parent.lock))) return { elements: [...elements], selection: [...ids] }
  const roots = selected.filter(el => !frameAncestors(el, elements).some(parent => ids.includes(parent.id)))
  const corners = roots.flatMap(frameCorners)
  const left = corners.length ? Math.min(...corners.map(p => p.x)) : 100, top = corners.length ? Math.min(...corners.map(p => p.y)) : 100
  const width = corners.length ? Math.max(1, Math.max(...corners.map(p => p.x)) - left) : 400, height = corners.length ? Math.max(1, Math.max(...corners.map(p => p.y)) - top) : 300
  const parentFrameId = roots.length && roots.every(el => el.parentFrameId === roots[0].parentFrameId) ? roots[0].parentFrameId : undefined
  const frame: PPTShapeElement = { id: frameId, name, type: 'shape', frame: { clipContent: true }, parentFrameId, left, top, width, height, rotate: 0, viewBox: [100, 100], path: 'M0 0H100V100H0Z', fill: '#ffffff', fixedRatio: false }
  const rootIds = new Set(roots.map(el => el.id)), first = elements.findIndex(el => rootIds.has(el.id)), next = elements.map(el => rootIds.has(el.id) ? { ...el, parentFrameId: frameId } : el)
  next.splice(first < 0 ? next.length : first, 0, frame)
  return { elements: normalizeFrameOrder(next), selection: [frameId] }
}
export function reparentFrameElements(elements: readonly PPTElement[], ids: readonly string[], parentFrameId?: string): PPTElement[] {
  const groups = new Set(elements.filter(el => ids.includes(el.id)).map(el => el.groupId).filter(Boolean))
  ids = elements.filter(el => ids.includes(el.id) || (!!el.groupId && groups.has(el.groupId))).map(el => el.id)
  ids = ids.filter(id => { const el = elements.find(item => item.id === id)!; return !frameAncestors(el, elements).some(parent => ids.includes(parent.id)) })
  const parent = elements.find(el => el.id === parentFrameId)
  if (elements.some(el => ids.includes(el.id) && (el.lock || frameAncestors(el, elements).some(ancestor => ancestor.lock)))) return [...elements]
  if (parentFrameId && (!parent || !isFrame(parent) || parent.lock || frameAncestors(parent, elements).some(ancestor => ancestor.lock))) return [...elements]
  const descendants = new Set(frameDescendantIds(elements, ids))
  if (parentFrameId && descendants.has(parentFrameId)) return [...elements]
  return normalizeFrameOrder(elements.map(el => ids.includes(el.id) ? { ...el, parentFrameId } : el))
}
/** Carry descendants with translated/rotated frames; resizing leaves child sizes unchanged. */
export function reconcileFrameTransforms(previous: readonly PPTElement[], next: readonly PPTElement[]): PPTElement[] {
  if (!next.some(el => el.parentFrameId || isFrame(el))) return [...next]
  const oldById = new Map(previous.map(el => [el.id, el]))
  const nextById = new Map(next.map(el => [el.id, el]))
  const transformed = new Map<string, PPTElement>(), visiting = new Set<string>()
  const resolve = (el: PPTElement): PPTElement => {
    if (!el.parentFrameId) return el
    const cached = transformed.get(el.id); if (cached) return cached
    if (visiting.has(el.id)) return el
    visiting.add(el.id)
    let result = el
    const old = oldById.get(el.id), parent = nextById.get(el.parentFrameId), oldParent = parent && oldById.get(parent.id)
    const geometryUnchanged = old && old.left === el.left && old.top === el.top && (old.type === 'line' && el.type === 'line' ? JSON.stringify([old.start,old.end,old.curve,old.cubic,old.broken,old.broken2]) === JSON.stringify([el.start,el.end,el.curve,el.cubic,el.broken,el.broken2]) : old.type !== 'line' && el.type !== 'line' && old.rotate === el.rotate)
    if (old && parent && oldParent && isFrame(parent) && isFrame(oldParent) && old.parentFrameId === el.parentFrameId && geometryUnchanged) {
      const updatedParent = resolve(parent)
      if (updatedParent.type === 'line') return el
      const angle = ((updatedParent.rotate || 0) - (oldParent.rotate || 0)) * Math.PI / 180
      const dx = updatedParent.left - oldParent.left, dy = updatedParent.top - oldParent.top
      const cx = oldParent.left + oldParent.width / 2, cy = oldParent.top + oldParent.height / 2
      const transform = (x: number,y: number) => ({x:cx+dx+(x-cx)*Math.cos(angle)-(y-cy)*Math.sin(angle),y:cy+dy+(x-cx)*Math.sin(angle)+(y-cy)*Math.cos(angle)})
      if (dx || dy || angle) {
        if (el.type === 'line' && old.type === 'line') {
          const origin = transform(old.left,old.top)
          const point = (p:[number,number]):[number,number] => { const v=transform(old.left+p[0],old.top+p[1]); return [v.x-origin.x,v.y-origin.y] }
          result = {...el,left:origin.x,top:origin.y,start:point(el.start),end:point(el.end),...(el.curve?{curve:point(el.curve)}:{}),...(el.cubic?{cubic:[point(el.cubic[0]),point(el.cubic[1])] as [[number,number],[number,number]]}:{}),...(el.broken?{broken:point(el.broken)}:{}),...(el.broken2?{broken2:point(el.broken2)}:{})}
        } else if (el.type !== 'line' && old.type !== 'line') {
          const center = transform(old.left+old.width/2,old.top+old.height/2)
          result = {...el,left:center.x-el.width/2,top:center.y-el.height/2,rotate:(el.rotate||0)+angle*180/Math.PI}
        }
      }
    }
    visiting.delete(el.id); transformed.set(el.id, result); return result
  }
  const resolved = next.map(resolve)
  return resolved.some(isFrame) ? normalizeFrameOrder(resolved) : resolved
}
/** Keep native painter order coherent: a frame's artwork always precedes its children. */
export function normalizeFrameOrder(elements: readonly PPTElement[]): PPTElement[] {
  const valid = new Set(elements.filter(isFrame).map(el => el.id)), seen = new Set<string>(), result: PPTElement[] = []
  const children = new Map<string, PPTElement[]>()
  for (const el of elements) if (el.parentFrameId) { const bucket = children.get(el.parentFrameId) || []; bucket.push(el); children.set(el.parentFrameId, bucket) }
  const visit = (el: PPTElement) => { if (seen.has(el.id)) return; seen.add(el.id); result.push(el); for (const child of children.get(el.id) || []) visit(child) }
  for (const el of elements) if (!el.parentFrameId || !valid.has(el.parentFrameId)) visit(el)
  for (const el of elements) visit(el)
  return result
}
