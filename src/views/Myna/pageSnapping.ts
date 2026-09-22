/** Geometry is in document coordinates; tolerance is measured in screen pixels. */
export interface PageSnapRect { id: string; x: number; y: number; width: number; height: number }
export interface PageSnapGuide { axis: 'x' | 'y'; position: number; start: number; end: number }
export interface PageSnapSpacing { axis: 'x' | 'y'; from: number; to: number; cross: number; distance: number }
export interface PageSnapOptions {
  moving: readonly PageSnapRect[]
  stationary: readonly PageSnapRect[]
  dx: number
  dy: number
  scale: number
  thresholdPx?: number
  gridSize?: number
  customGuides?: readonly PageSnapGuide[]
  /** Constrain movement to this axis. */
  axis?: 'x' | 'y'
}
export interface PageSnapResult { dx: number; dy: number; guides: PageSnapGuide[]; spacing: PageSnapSpacing[] }
interface Candidate { correction: number; priority: number; guides: PageSnapGuide[]; spacing: PageSnapSpacing[] }
const valid = (r: PageSnapRect) => [r.x, r.y, r.width, r.height].every(Number.isFinite) && r.width > 0 && r.height > 0
const bounds = (rects: readonly PageSnapRect[]): PageSnapRect => {
  const x = Math.min(...rects.map(r => r.x)), y = Math.min(...rects.map(r => r.y))
  return { id: '', x, y, width: Math.max(...rects.map(r => r.x + r.width)) - x, height: Math.max(...rects.map(r => r.y + r.height)) - y }
}

/** Applies a single translation to a selection, retaining its internal layout. */
export function snapPageDrag(options: PageSnapOptions): PageSnapResult {
  const dx = options.axis === 'y' ? 0 : Number.isFinite(options.dx) ? options.dx : 0
  const dy = options.axis === 'x' ? 0 : Number.isFinite(options.dy) ? options.dy : 0
  const result: PageSnapResult = { dx, dy, guides: [], spacing: [] }
  const moving = options.moving.filter(valid).map(r => ({ ...r, x: r.x + dx, y: r.y + dy }))
  if (!moving.length) return result
  const ids = new Set(options.moving.map(r => r.id))
  const stationary = options.stationary.filter(r => valid(r) && !ids.has(r.id)).slice().sort((a, b) => a.id.localeCompare(b.id))
  const group = bounds(moving)
  const tolerance = Math.max(0, options.thresholdPx ?? 6) / (Number.isFinite(options.scale) && options.scale > 0 ? options.scale : 1)
  for (const axis of ['x', 'y'] as const) {
    if (options.axis && options.axis !== axis) continue
    const crossAxis = axis === 'x' ? 'y' : 'x'
    const size = axis === 'x' ? 'width' : 'height'
    const crossSize = axis === 'x' ? 'height' : 'width'
    const anchors = (r: PageSnapRect) => [r[axis], r[axis] + r[size] / 2, r[axis] + r[size]]
    const candidates: Candidate[] = []
    const add = (candidate: Candidate) => { if (Math.abs(candidate.correction) <= tolerance + 1e-8) candidates.push(candidate) }
    for (const own of moving.length > 1 ? [...moving, group] : moving) {
      for (const other of stationary) for (const origin of anchors(own)) for (const target of anchors(other)) {
        add({ correction: target - origin, priority: 0, spacing: [], guides: [{ axis, position: target, start: Math.min(own[crossAxis], other[crossAxis]), end: Math.max(own[crossAxis] + own[crossSize], other[crossAxis] + other[crossSize]) }] })
      }
    }
    for (const guide of options.customGuides || []) {
      if (guide.axis !== axis || ![guide.position, guide.start, guide.end].every(Number.isFinite)) continue
      for (const own of moving.length > 1 ? [...moving, group] : moving) for (const anchor of anchors(own)) {
        add({ correction: guide.position - anchor, priority: -1, spacing: [], guides: [{ ...guide, start: Math.min(guide.start, own[crossAxis]), end: Math.max(guide.end, own[crossAxis] + own[crossSize]) }] })
      }
    }
    // Compare collinear neighbors: center in a gap, or repeat an existing gap on either side.
    const peers = stationary.filter(r => r[crossAxis] < group[crossAxis] + group[crossSize] && r[crossAxis] + r[crossSize] > group[crossAxis]).sort((a, b) => a[axis] - b[axis] || a.id.localeCompare(b.id))
    const cross = group[crossAxis] + group[crossSize] / 2
    const spacing = (from: number, to: number): PageSnapSpacing => ({ axis, from, to, cross, distance: to - from })
    for (let index = 0; index + 1 < peers.length; index++) {
      const a = peers[index], b = peers[index + 1]
      const endA = a[axis] + a[size], startB = b[axis], gap = startB - endA
      if (gap < 0) continue
      if (gap >= group[size]) {
        const position = endA + (gap - group[size]) / 2
        add({ correction: position - group[axis], priority: 1, guides: [], spacing: [spacing(endA, position), spacing(position + group[size], startB)] })
      }
      const before = a[axis] - gap - group[size]
      add({ correction: before - group[axis], priority: 1, guides: [], spacing: [spacing(before + group[size], a[axis]), spacing(endA, startB)] })
      const after = b[axis] + b[size] + gap
      add({ correction: after - group[axis], priority: 1, guides: [], spacing: [spacing(endA, startB), spacing(b[axis] + b[size], after)] })
    }
    const grid = options.gridSize
    const gridPosition = grid && Number.isFinite(grid) && grid > 0 ? Math.round(group[axis] / grid) * grid : undefined
    // Grid is the fallback, while a nearby page alignment remains more useful.
    if (!candidates.length && gridPosition !== undefined) candidates.push({ correction: gridPosition - group[axis], priority: 2, spacing: [], guides: [{ axis, position: gridPosition, start: group[crossAxis], end: group[crossAxis] + group[crossSize] }] })
    candidates.sort((a, b) => Math.abs(a.correction) - Math.abs(b.correction) || a.priority - b.priority || a.correction - b.correction)
    const winner = candidates[0]
    if (!winner) continue
    if (axis === 'x') result.dx += winner.correction
    else result.dy += winner.correction
    const matching = candidates.filter(c => Math.abs(c.correction - winner.correction) < 1e-8)
    for (const candidate of matching) {
      result.guides.push(...candidate.guides)
      result.spacing.push(...candidate.spacing)
    }
  }
  // Collapse coincident guide lines into one segment spanning every aligned page.
  const merged = new Map<string, PageSnapGuide>()
  for (const guide of result.guides) {
    const key = `${guide.axis}:${guide.position.toFixed(6)}`
    const previous = merged.get(key)
    if (previous) { previous.start = Math.min(previous.start, guide.start); previous.end = Math.max(previous.end, guide.end) }
    else merged.set(key, { ...guide })
  }
  result.guides = [...merged.values()]
  result.spacing = [...new Map(result.spacing.map(s => [`${s.axis}:${s.from}:${s.to}:${s.cross}`, s])).values()]
  return result
}
