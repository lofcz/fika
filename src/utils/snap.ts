import { boxesNear, buildSnapIndex, queryLinesX, queryLinesY, type SnapIndex, type SnapLine } from '@/utils/spatial'

export const SNAP_THRESHOLD = 8
export const FINE_GRID_SIZE = 8
export const GUIDE_PAD = 14
export const SNAP_MATCH = 0.51
export const SLIDE_MARGIN = 40
export const RELATED_GAP = 240
export const MAX_CTRL_MEASURES = 8

export type SnapKind = 'edge' | 'center' | 'canvas' | 'spacing' | 'size' | 'grid' | 'measure'
export type SnapMode = 'smart' | 'grid'

export interface SnapGuide {
  type: 'vertical' | 'horizontal'
  kind?: SnapKind
  axis: { x: number; y: number }
  length: number
  marks?: number[]
  label?: string
}

export interface SnapBox {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export interface SnapCanvas {
  width: number
  height: number
}

export interface SnapOptions {
  mode: SnapMode
  canvas: SnapCanvas
  gridSize: number
  threshold?: number
  index?: SnapIndex
}

/** Search pad for the per-move Flatbush query: snap threshold or related-object reach. */
export const snapQueryPad = (threshold = SNAP_THRESHOLD) => Math.max(threshold, RELATED_GAP)

const resolveIndex = (others: SnapBox[], index?: SnapIndex) => index ?? buildSnapIndex(others)

const neighborsForMove = (
  moving: SnapBox,
  others: SnapBox[],
  index: SnapIndex | undefined,
  threshold: number,
): { nearby: SnapBox[]; index: SnapIndex } => {
  const resolved = resolveIndex(others, index)
  return { nearby: boxesNear(resolved, moving, snapQueryPad(threshold)), index: resolved }
}

export const sameSnapGuides = (a: SnapGuide[], b: SnapGuide[]) => {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const left = a[i]
    const right = b[i]
    if (
      left.type !== right.type
      || left.kind !== right.kind
      || left.label !== right.label
      || left.length !== right.length
      || left.axis.x !== right.axis.x
      || left.axis.y !== right.axis.y
    ) return false
    const lm = left.marks
    const rm = right.marks
    if (lm === rm) continue
    if (!lm || !rm || lm.length !== rm.length) return false
    for (let j = 0; j < lm.length; j++) {
      if (lm[j] !== rm[j]) return false
    }
  }
  return true
}

export interface SnapResult {
  offsetX: number
  offsetY: number
  guides: SnapGuide[]
}

type Axis = 'x' | 'y'

interface SnapCandidate {
  axis: Axis
  delta: number
  kind: SnapKind
  guides: SnapGuide[]
  relation?: number
}

const KIND_RANK: Record<SnapKind, number> = {
  edge: 0,
  center: 1,
  spacing: 2,
  size: 3,
  measure: 4,
  canvas: 5,
  grid: 6,
}

export const boxWidth = (box: SnapBox) => box.maxX - box.minX
export const boxHeight = (box: SnapBox) => box.maxY - box.minY
export const boxCenterX = (box: SnapBox) => (box.minX + box.maxX) / 2
export const boxCenterY = (box: SnapBox) => (box.minY + box.maxY) / 2

export const translateBox = (box: SnapBox, dx: number, dy: number): SnapBox => ({
  minX: box.minX + dx,
  maxX: box.maxX + dx,
  minY: box.minY + dy,
  maxY: box.maxY + dy,
})

export const snapToGrid = (value: number, gridSize: number) => {
  if (gridSize <= 0) return value
  return Math.round(value / gridSize) * gridSize
}

/** Alt uses the visible layout grid, or an 8px fine grid when none is shown. */
export const resolveGridSize = (visibleGridSize: number, forceGrid: boolean) => {
  if (forceGrid) return visibleGridSize > 0 ? visibleGridSize : FINE_GRID_SIZE
  return visibleGridSize > 0 ? visibleGridSize : 0
}

export const formatSnapLabel = (value: number) => String(Math.round(value))
export const formatMeasureLabel = (value: number) => `${Math.round(value)}px`

export const unionBoxes = (boxes: SnapBox[]): SnapBox | null => {
  if (!boxes.length) return null
  return {
    minX: Math.min(...boxes.map(box => box.minX)),
    maxX: Math.max(...boxes.map(box => box.maxX)),
    minY: Math.min(...boxes.map(box => box.minY)),
    maxY: Math.max(...boxes.map(box => box.maxY)),
  }
}

const overlaps1D = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1

const uniqueSorted = (values: number[]) => {
  const next: number[] = []
  for (const value of [...values].sort((a, b) => a - b)) {
    if (!next.length || Math.abs(next[next.length - 1] - value) > 0.25) next.push(value)
  }
  return next
}

const makeAlignGuide = (
  type: SnapGuide['type'],
  value: number,
  ranges: [number, number][],
  kind: SnapKind,
): SnapGuide => {
  const lows = ranges.map(range => range[0])
  const highs = ranges.map(range => range[1])
  const start = Math.min(...lows)
  const end = Math.max(...highs)
  const paddedStart = start - GUIDE_PAD
  const marks = uniqueSorted(ranges.flat())
  if (type === 'vertical') {
    return {
      type,
      kind,
      axis: { x: value, y: paddedStart },
      length: end - start + GUIDE_PAD * 2,
      marks,
    }
  }
  return {
    type,
    kind,
    axis: { x: paddedStart, y: value },
    length: end - start + GUIDE_PAD * 2,
    marks,
  }
}

const makeSpacingGuide = (
  type: SnapGuide['type'],
  start: number,
  end: number,
  cross: number,
  gap: number,
): SnapGuide => {
  const length = Math.max(0, end - start)
  if (type === 'horizontal') {
    return {
      type,
      kind: 'spacing',
      axis: { x: start, y: cross },
      length,
      label: formatSnapLabel(gap),
    }
  }
  return {
    type,
    kind: 'spacing',
    axis: { x: cross, y: start },
    length,
    label: formatSnapLabel(gap),
  }
}

const makeMeasureGuide = (
  type: SnapGuide['type'],
  start: number,
  end: number,
  cross: number,
  gap: number,
): SnapGuide => {
  const length = Math.max(0, end - start)
  if (type === 'horizontal') {
    return {
      type,
      kind: 'measure',
      axis: { x: start, y: cross },
      length,
      label: formatMeasureLabel(gap),
    }
  }
  return {
    type,
    kind: 'measure',
    axis: { x: cross, y: start },
    length,
    label: formatMeasureLabel(gap),
  }
}

const makeSizeGuide = (
  type: SnapGuide['type'],
  start: number,
  end: number,
  cross: number,
  size: number,
): SnapGuide => {
  const length = Math.max(0, end - start)
  if (type === 'horizontal') {
    return {
      type,
      kind: 'size',
      axis: { x: start, y: cross },
      length,
      label: formatSnapLabel(size),
    }
  }
  return {
    type,
    kind: 'size',
    axis: { x: cross, y: start },
    length,
    label: formatSnapLabel(size),
  }
}

const makeGridGuide = (type: SnapGuide['type'], value: number, box: SnapBox): SnapGuide => {
  if (type === 'vertical') {
    return {
      type,
      kind: 'grid',
      axis: { x: value, y: box.minY - GUIDE_PAD },
      length: boxHeight(box) + GUIDE_PAD * 2,
    }
  }
  return {
    type,
    kind: 'grid',
    axis: { x: box.minX - GUIDE_PAD, y: value },
    length: boxWidth(box) + GUIDE_PAD * 2,
  }
}

const relationScore = (candidate: SnapCandidate) => (
  Math.abs(candidate.delta) + (candidate.relation ?? 2) * 1.25
)

const pickBest = (candidates: SnapCandidate[], threshold: number): SnapCandidate | null => {
  let best: SnapCandidate | null = null
  for (const candidate of candidates) {
    const distance = Math.abs(candidate.delta)
    if (distance >= threshold) continue
    if (!best) {
      best = candidate
      continue
    }
    const score = relationScore(candidate)
    const bestScore = relationScore(best)
    if (score < bestScore - 0.05) best = candidate
    else if (Math.abs(score - bestScore) <= 0.05 && KIND_RANK[candidate.kind] < KIND_RANK[best.kind]) {
      best = candidate
    }
  }
  return best
}

const gap1D = (a0: number, a1: number, b0: number, b1: number) => {
  if (a1 <= b0) return { start: a1, end: b0, distance: b0 - a1 }
  if (b1 <= a0) return { start: b1, end: a0, distance: a0 - b1 }
  return null
}

/** 0 = same row/column, 1 = nearby, 2 = mid-range, 3 = distant. */
const crossRelation = (moving: SnapBox, other: SnapBox, snapAxis: Axis) => {
  const gap = snapAxis === 'x'
    ? gap1D(moving.minY, moving.maxY, other.minY, other.maxY)
    : gap1D(moving.minX, moving.maxX, other.minX, other.maxX)
  if (!gap) return 0
  if (gap.distance < 80) return 1
  if (gap.distance < RELATED_GAP) return 2
  return 3
}

const isSlideWideRange = (range: [number, number], canvas: SnapCanvas) => (
  range[0] <= 0.5 && (Math.abs(range[1] - canvas.width) <= 0.5 || Math.abs(range[1] - canvas.height) <= 0.5)
)

const isRelatedRange = (movingStart: number, movingEnd: number, range: [number, number]) => {
  if (overlaps1D(movingStart, movingEnd, range[0], range[1])) return true
  const gap = gap1D(movingStart, movingEnd, range[0], range[1])
  return !!gap && gap.distance < RELATED_GAP
}

type AlignTarget = { value: number; range: [number, number]; kind: SnapKind }

const canvasTargetsY = (canvas: SnapCanvas): AlignTarget[] => [
  { value: 0, range: [0, canvas.width], kind: 'canvas' },
  { value: SLIDE_MARGIN, range: [0, canvas.width], kind: 'canvas' },
  { value: canvas.height / 2, range: [0, canvas.width], kind: 'center' },
  { value: canvas.height - SLIDE_MARGIN, range: [0, canvas.width], kind: 'canvas' },
  { value: canvas.height, range: [0, canvas.width], kind: 'canvas' },
]

const canvasTargetsX = (canvas: SnapCanvas): AlignTarget[] => [
  { value: 0, range: [0, canvas.height], kind: 'canvas' },
  { value: SLIDE_MARGIN, range: [0, canvas.height], kind: 'canvas' },
  { value: canvas.width / 2, range: [0, canvas.height], kind: 'center' },
  { value: canvas.width - SLIDE_MARGIN, range: [0, canvas.height], kind: 'canvas' },
  { value: canvas.width, range: [0, canvas.height], kind: 'canvas' },
]

const lineToTarget = (line: SnapLine): AlignTarget => ({
  value: line.value,
  range: [line.min, line.max],
  kind: line.kind,
})

const objectTargetsFromNearby = (nearby: SnapBox[]) => {
  const targetsY: AlignTarget[] = []
  const targetsX: AlignTarget[] = []
  for (const other of nearby) {
    targetsY.push(
      { value: other.minY, range: [other.minX, other.maxX], kind: 'edge' },
      { value: boxCenterY(other), range: [other.minX, other.maxX], kind: 'center' },
      { value: other.maxY, range: [other.minX, other.maxX], kind: 'edge' },
    )
    targetsX.push(
      { value: other.minX, range: [other.minY, other.maxY], kind: 'edge' },
      { value: boxCenterX(other), range: [other.minY, other.maxY], kind: 'center' },
      { value: other.maxX, range: [other.minY, other.maxY], kind: 'edge' },
    )
  }
  return { targetsY, targetsX }
}

const collectAlignCandidates = (
  moving: SnapBox,
  nearby: SnapBox[],
  canvas: SnapCanvas,
  index: SnapIndex,
  threshold: number,
): SnapCandidate[] => {
  const candidates: SnapCandidate[] = []
  const movingY = [
    { value: moving.minY, kind: 'edge' as const },
    { value: boxCenterY(moving), kind: 'center' as const },
    { value: moving.maxY, kind: 'edge' as const },
  ]
  const movingX = [
    { value: moving.minX, kind: 'edge' as const },
    { value: boxCenterX(moving), kind: 'center' as const },
    { value: moving.maxX, kind: 'edge' as const },
  ]

  const pad = snapQueryPad(threshold)
  const fromIndex = index.metaX.length > 0
  const targetsY: AlignTarget[] = [
    ...canvasTargetsY(canvas),
    ...(fromIndex
      ? movingY.flatMap(source => queryLinesY(index, source.value, threshold, moving.minX - pad, moving.maxX + pad).map(lineToTarget))
      : objectTargetsFromNearby(nearby).targetsY),
  ]
  const targetsX: AlignTarget[] = [
    ...canvasTargetsX(canvas),
    ...(fromIndex
      ? movingX.flatMap(source => queryLinesX(index, source.value, threshold, moving.minY - pad, moving.maxY + pad).map(lineToTarget))
      : objectTargetsFromNearby(nearby).targetsX),
  ]

  for (const target of targetsY) {
    for (const source of movingY) {
      const kind = target.kind === 'canvas' ? 'canvas' : source.kind === 'center' || target.kind === 'center' ? 'center' : 'edge'
      const relation = isSlideWideRange(target.range, canvas)
        ? (target.kind === 'canvas' && (target.value === SLIDE_MARGIN || target.value === canvas.height - SLIDE_MARGIN) ? 1 : 2)
        : isRelatedRange(moving.minX, moving.maxX, target.range) ? 0 : 3
      candidates.push({
        axis: 'y',
        delta: target.value - source.value,
        kind,
        relation,
        guides: [makeAlignGuide('horizontal', target.value, [target.range, [moving.minX, moving.maxX]], kind)],
      })
    }
  }
  for (const target of targetsX) {
    for (const source of movingX) {
      const kind = target.kind === 'canvas' ? 'canvas' : source.kind === 'center' || target.kind === 'center' ? 'center' : 'edge'
      const relation = isSlideWideRange(target.range, canvas)
        ? (target.kind === 'canvas' && (target.value === SLIDE_MARGIN || target.value === canvas.width - SLIDE_MARGIN) ? 1 : 2)
        : isRelatedRange(moving.minY, moving.maxY, target.range) ? 0 : 3
      candidates.push({
        axis: 'x',
        delta: target.value - source.value,
        kind,
        relation,
        guides: [makeAlignGuide('vertical', target.value, [target.range, [moving.minY, moving.maxY]], kind)],
      })
    }
  }

  const margins = [
    { axis: 'x' as const, source: moving.minX, target: SLIDE_MARGIN, range: [0, canvas.height] as [number, number] },
    { axis: 'x' as const, source: moving.maxX, target: canvas.width - SLIDE_MARGIN, range: [0, canvas.height] as [number, number] },
    { axis: 'y' as const, source: moving.minY, target: SLIDE_MARGIN, range: [0, canvas.width] as [number, number] },
    { axis: 'y' as const, source: moving.maxY, target: canvas.height - SLIDE_MARGIN, range: [0, canvas.width] as [number, number] },
  ]
  for (const margin of margins) {
    const type = margin.axis === 'x' ? 'vertical' : 'horizontal'
    const movingRange: [number, number] = margin.axis === 'x' ? [moving.minY, moving.maxY] : [moving.minX, moving.maxX]
    candidates.push({
      axis: margin.axis,
      delta: margin.target - margin.source,
      kind: 'canvas',
      relation: 1,
      guides: [makeAlignGuide(type, margin.target, [margin.range, movingRange], 'canvas')],
    })
  }
  return candidates
}

/** Pairwise gaps among the nearby k-set only — never the full others list. */
const collectGaps = (nearby: SnapBox[], axis: Axis) => {
  const gaps: number[] = []
  for (let i = 0; i < nearby.length; i++) {
    for (let j = 0; j < nearby.length; j++) {
      if (i === j) continue
      const a = nearby[i]
      const b = nearby[j]
      if (axis === 'x') {
        if (!overlaps1D(a.minY, a.maxY, b.minY, b.maxY)) continue
        const gap = b.minX - a.maxX
        if (gap > 1) gaps.push(gap)
      }
      else {
        if (!overlaps1D(a.minX, a.maxX, b.minX, b.maxX)) continue
        const gap = b.minY - a.maxY
        if (gap > 1) gaps.push(gap)
      }
    }
  }
  return uniqueSorted(gaps)
}

const collectSpacingCandidates = (moving: SnapBox, nearby: SnapBox[]): SnapCandidate[] => {
  const candidates: SnapCandidate[] = []
  const gapsX = collectGaps(nearby, 'x')
  const gapsY = collectGaps(nearby, 'y')

  for (const other of nearby) {
    if (overlaps1D(moving.minY, moving.maxY, other.minY, other.maxY)) {
      const midY = (Math.max(moving.minY, other.minY) + Math.min(moving.maxY, other.maxY)) / 2
      for (const gap of gapsX) {
        const rightMinX = other.maxX + gap
        candidates.push({
          axis: 'x',
          delta: rightMinX - moving.minX,
          kind: 'spacing',
          relation: 0,
          guides: [makeSpacingGuide('horizontal', other.maxX, rightMinX, midY, gap)],
        })
        const leftMaxX = other.minX - gap
        candidates.push({
          axis: 'x',
          delta: leftMaxX - moving.maxX,
          kind: 'spacing',
          relation: 0,
          guides: [makeSpacingGuide('horizontal', leftMaxX, other.minX, midY, gap)],
        })
      }
    }
    if (overlaps1D(moving.minX, moving.maxX, other.minX, other.maxX)) {
      const midX = (Math.max(moving.minX, other.minX) + Math.min(moving.maxX, other.maxX)) / 2
      for (const gap of gapsY) {
        const belowMinY = other.maxY + gap
        candidates.push({
          axis: 'y',
          delta: belowMinY - moving.minY,
          kind: 'spacing',
          relation: 0,
          guides: [makeSpacingGuide('vertical', other.maxY, belowMinY, midX, gap)],
        })
        const aboveMaxY = other.minY - gap
        candidates.push({
          axis: 'y',
          delta: aboveMaxY - moving.maxY,
          kind: 'spacing',
          relation: 0,
          guides: [makeSpacingGuide('vertical', aboveMaxY, other.minY, midX, gap)],
        })
      }
    }
  }

  for (let i = 0; i < nearby.length; i++) {
    for (let j = 0; j < nearby.length; j++) {
      if (i === j) continue
      const left = nearby[i]
      const right = nearby[j]
      if (right.minX > left.maxX && overlaps1D(left.minY, left.maxY, right.minY, right.maxY)) {
        const inner = right.minX - left.maxX
        const width = boxWidth(moving)
        const gap = (inner - width) / 2
        if (gap > 2) {
          const targetMinX = left.maxX + gap
          const midY = (Math.max(left.minY, right.minY, moving.minY) + Math.min(left.maxY, right.maxY, moving.maxY)) / 2
          candidates.push({
            axis: 'x',
            delta: targetMinX - moving.minX,
            kind: 'spacing',
            relation: 0,
            guides: [
              makeSpacingGuide('horizontal', left.maxX, targetMinX, midY, gap),
              makeSpacingGuide('horizontal', targetMinX + width, right.minX, midY, gap),
            ],
          })
        }
      }
      const top = nearby[i]
      const bottom = nearby[j]
      if (bottom.minY > top.maxY && overlaps1D(top.minX, top.maxX, bottom.minX, bottom.maxX)) {
        const inner = bottom.minY - top.maxY
        const height = boxHeight(moving)
        const gap = (inner - height) / 2
        if (gap > 2) {
          const targetMinY = top.maxY + gap
          const midX = (Math.max(top.minX, bottom.minX, moving.minX) + Math.min(top.maxX, bottom.maxX, moving.maxX)) / 2
          candidates.push({
            axis: 'y',
            delta: targetMinY - moving.minY,
            kind: 'spacing',
            relation: 0,
            guides: [
              makeSpacingGuide('vertical', top.maxY, targetMinY, midX, gap),
              makeSpacingGuide('vertical', targetMinY + height, bottom.minY, midX, gap),
            ],
          })
        }
      }
    }
  }

  return candidates
}

const collectGridCandidates = (moving: SnapBox, gridSize: number): SnapCandidate[] => {
  if (gridSize <= 0) return []
  const snappedMinX = snapToGrid(moving.minX, gridSize)
  const snappedMinY = snapToGrid(moving.minY, gridSize)
  const snapped = translateBox(moving, snappedMinX - moving.minX, snappedMinY - moving.minY)
  return [
    {
      axis: 'x',
      delta: snappedMinX - moving.minX,
      kind: 'grid',
      guides: [makeGridGuide('vertical', snappedMinX, snapped)],
    },
    {
      axis: 'y',
      delta: snappedMinY - moving.minY,
      kind: 'grid',
      guides: [makeGridGuide('horizontal', snappedMinY, snapped)],
    },
  ]
}

const collectAlignmentGuides = (
  snapped: SnapBox,
  nearby: SnapBox[],
  canvas: SnapCanvas,
  index: SnapIndex,
): SnapGuide[] => {
  const guides: SnapGuide[] = []
  const movingY = [
    { value: snapped.minY, kind: 'edge' as const },
    { value: boxCenterY(snapped), kind: 'center' as const },
    { value: snapped.maxY, kind: 'edge' as const },
  ]
  const movingX = [
    { value: snapped.minX, kind: 'edge' as const },
    { value: boxCenterX(snapped), kind: 'center' as const },
    { value: snapped.maxX, kind: 'edge' as const },
  ]
  const pad = snapQueryPad()
  const fromIndex = index.metaX.length > 0
  const nearbyTargets = fromIndex ? null : objectTargetsFromNearby(nearby)
  const targetsY: AlignTarget[] = [
    ...canvasTargetsY(canvas),
    ...(fromIndex
      ? movingY.flatMap(source => queryLinesY(index, source.value, SNAP_MATCH, snapped.minX - pad, snapped.maxX + pad).map(lineToTarget))
      : nearbyTargets!.targetsY),
  ]
  const targetsX: AlignTarget[] = [
    ...canvasTargetsX(canvas),
    ...(fromIndex
      ? movingX.flatMap(source => queryLinesX(index, source.value, SNAP_MATCH, snapped.minY - pad, snapped.maxY + pad).map(lineToTarget))
      : nearbyTargets!.targetsX),
  ]

  const pickMatches = (
    matched: { value: number; range: [number, number]; kind: SnapKind }[],
    movingStart: number,
    movingEnd: number,
  ) => {
    const objects = matched.filter(target => !isSlideWideRange(target.range, canvas))
    const related = objects.filter(target => isRelatedRange(movingStart, movingEnd, target.range))
    if (related.length) return related
    if (objects.length) {
      return [objects.reduce((best, target) => {
        const gap = gap1D(movingStart, movingEnd, target.range[0], target.range[1])
        const bestGap = gap1D(movingStart, movingEnd, best.range[0], best.range[1])
        return (gap?.distance ?? Infinity) < (bestGap?.distance ?? Infinity) ? target : best
      })]
    }
    return matched.filter(target => isSlideWideRange(target.range, canvas))
  }

  for (const source of movingY) {
    const matched = targetsY.filter(target => Math.abs(target.value - source.value) <= SNAP_MATCH)
    if (!matched.length) continue
    const chosen = pickMatches(matched, snapped.minX, snapped.maxX)
    if (!chosen.length) continue
    const kind = chosen.every(target => target.kind === 'canvas')
      ? 'canvas'
      : source.kind === 'center' || chosen.some(target => target.kind === 'center')
        ? 'center'
        : 'edge'
    guides.push(makeAlignGuide(
      'horizontal',
      source.value,
      [[snapped.minX, snapped.maxX], ...chosen.map(target => target.range)],
      kind,
    ))
  }
  for (const source of movingX) {
    const matched = targetsX.filter(target => Math.abs(target.value - source.value) <= SNAP_MATCH)
    if (!matched.length) continue
    const chosen = pickMatches(matched, snapped.minY, snapped.maxY)
    if (!chosen.length) continue
    const kind = chosen.every(target => target.kind === 'canvas')
      ? 'canvas'
      : source.kind === 'center' || chosen.some(target => target.kind === 'center')
        ? 'center'
        : 'edge'
    guides.push(makeAlignGuide(
      'vertical',
      source.value,
      [[snapped.minY, snapped.maxY], ...chosen.map(target => target.range)],
      kind,
    ))
  }
  return guides
}

const mergeGuides = (guides: SnapGuide[]) => {
  const merged: SnapGuide[] = []
  for (const guide of guides) {
    if (guide.kind === 'spacing' || guide.kind === 'size' || guide.kind === 'grid' || guide.kind === 'measure') {
      const duplicate = merged.some(item => (
        item.kind === guide.kind
        && item.type === guide.type
        && Math.abs(item.axis.x - guide.axis.x) < 0.25
        && Math.abs(item.axis.y - guide.axis.y) < 0.25
        && Math.abs(item.length - guide.length) < 0.25
      ))
      if (!duplicate) merged.push(guide)
      continue
    }
    const lineValue = guide.type === 'vertical' ? guide.axis.x : guide.axis.y
    const index = merged.findIndex(item => {
      if (item.type !== guide.type || item.kind === 'spacing' || item.kind === 'size' || item.kind === 'grid' || item.kind === 'measure') return false
      const otherValue = item.type === 'vertical' ? item.axis.x : item.axis.y
      return Math.abs(otherValue - lineValue) < 0.25
    })
    if (index === -1) {
      merged.push(guide)
      continue
    }
    const current = merged[index]
    const marks = uniqueSorted([...(current.marks || []), ...(guide.marks || [])])
    const start = Math.min(
      guide.type === 'vertical' ? current.axis.y : current.axis.x,
      guide.type === 'vertical' ? guide.axis.y : guide.axis.x,
    )
    const end = Math.max(
      (guide.type === 'vertical' ? current.axis.y : current.axis.x) + current.length,
      (guide.type === 'vertical' ? guide.axis.y : guide.axis.x) + guide.length,
    )
    merged[index] = {
      ...current,
      axis: guide.type === 'vertical' ? { x: lineValue, y: start } : { x: start, y: lineValue },
      length: end - start,
      marks,
      kind: KIND_RANK[guide.kind || 'edge'] < KIND_RANK[current.kind || 'edge'] ? guide.kind : current.kind,
    }
  }
  return merged
}

export const snapMovingBox = (moving: SnapBox, others: SnapBox[], options: SnapOptions): SnapResult => {
  const threshold = options.threshold ?? SNAP_THRESHOLD
  const { mode, canvas, gridSize } = options
  const { nearby, index } = neighborsForMove(moving, others, options.index, threshold)

  if (mode === 'grid') {
    const size = gridSize > 0 ? gridSize : FINE_GRID_SIZE
    const offsetX = snapToGrid(moving.minX, size) - moving.minX
    const offsetY = snapToGrid(moving.minY, size) - moving.minY
    const snapped = translateBox(moving, offsetX, offsetY)
    return {
      offsetX,
      offsetY,
      guides: mergeGuides([
        ...collectAlignmentGuides(snapped, nearby, canvas, index),
        ...(offsetX ? [makeGridGuide('vertical', snapped.minX, snapped)] : []),
        ...(offsetY ? [makeGridGuide('horizontal', snapped.minY, snapped)] : []),
      ]),
    }
  }

  const candidates = [
    ...collectAlignCandidates(moving, nearby, canvas, index, threshold),
    ...collectSpacingCandidates(moving, nearby),
    ...collectGridCandidates(moving, gridSize),
  ]
  const xWin = pickBest(candidates.filter(candidate => candidate.axis === 'x'), threshold)
  const yWin = pickBest(candidates.filter(candidate => candidate.axis === 'y'), threshold)
  const offsetX = xWin?.delta ?? 0
  const offsetY = yWin?.delta ?? 0
  const snapped = translateBox(moving, offsetX, offsetY)
  const guides = mergeGuides([
    ...collectAlignmentGuides(snapped, nearby, canvas, index),
    ...(xWin && (xWin.kind === 'spacing' || xWin.kind === 'size' || xWin.kind === 'grid') ? xWin.guides : []),
    ...(yWin && (yWin.kind === 'spacing' || yWin.kind === 'size' || yWin.kind === 'grid') ? yWin.guides : []),
  ])
  return { offsetX, offsetY, guides }
}

export interface ResizeSnapOptions extends SnapOptions {
  moving?: SnapBox
  resizeWidth?: boolean
  resizeHeight?: boolean
}

const collectSizeCandidates = (
  currentX: number | null,
  currentY: number | null,
  moving: SnapBox,
  nearby: SnapBox[],
  resizeWidth: boolean,
  resizeHeight: boolean,
): SnapCandidate[] => {
  const candidates: SnapCandidate[] = []
  if (resizeWidth && currentX !== null) {
    const fromLeft = Math.abs(currentX - moving.maxX) <= Math.abs(currentX - moving.minX)
    for (const other of nearby) {
      const width = boxWidth(other)
      const targetX = fromLeft ? moving.minX + width : moving.maxX - width
      const cross = Math.min(moving.maxY, other.maxY) - 8
      candidates.push({
        axis: 'x',
        delta: currentX - targetX,
        kind: 'size',
        relation: crossRelation(moving, other, 'x'),
        guides: [makeSizeGuide('horizontal', Math.min(moving.minX, other.minX), Math.min(moving.minX, other.minX) + width, cross, width)],
      })
    }
  }
  if (resizeHeight && currentY !== null) {
    const fromTop = Math.abs(currentY - moving.maxY) <= Math.abs(currentY - moving.minY)
    for (const other of nearby) {
      const height = boxHeight(other)
      const targetY = fromTop ? moving.minY + height : moving.maxY - height
      const cross = Math.min(moving.maxX, other.maxX) - 8
      candidates.push({
        axis: 'y',
        delta: currentY - targetY,
        kind: 'size',
        relation: crossRelation(moving, other, 'y'),
        guides: [makeSizeGuide('vertical', Math.min(moving.minY, other.minY), Math.min(moving.minY, other.minY) + height, cross, height)],
      })
    }
  }
  return candidates
}

const collectPointAlignCandidates = (
  currentX: number | null,
  currentY: number | null,
  nearby: SnapBox[],
  canvas: SnapCanvas,
  moving?: SnapBox,
): SnapCandidate[] => {
  const candidates: SnapCandidate[] = []
  const pointBox = moving || {
    minX: currentX ?? 0,
    maxX: currentX ?? 0,
    minY: currentY ?? 0,
    maxY: currentY ?? 0,
  }
  if (currentY !== null) {
    const targets = [0, SLIDE_MARGIN, canvas.height / 2, canvas.height - SLIDE_MARGIN, canvas.height]
    const ranges: [number, number][] = Array.from({ length: 5 }, () => [0, canvas.width] as [number, number])
    const kinds: SnapKind[] = ['canvas', 'canvas', 'center', 'canvas', 'canvas']
    for (const other of nearby) {
      targets.push(other.minY, boxCenterY(other), other.maxY)
      ranges.push([other.minX, other.maxX], [other.minX, other.maxX], [other.minX, other.maxX])
      kinds.push('edge', 'center', 'edge')
    }
    targets.forEach((value, index) => {
      const slideWide = isSlideWideRange(ranges[index], canvas)
      const inset = value === SLIDE_MARGIN || value === canvas.height - SLIDE_MARGIN
      candidates.push({
        axis: 'y',
        delta: currentY - value,
        kind: kinds[index],
        relation: slideWide ? (inset ? 1 : 2) : crossRelation(pointBox, { minX: ranges[index][0], maxX: ranges[index][1], minY: value, maxY: value }, 'y'),
        guides: [makeAlignGuide('horizontal', value, [ranges[index], [currentX ?? ranges[index][0], currentX ?? ranges[index][1]]], kinds[index])],
      })
    })
  }
  if (currentX !== null) {
    const targets = [0, SLIDE_MARGIN, canvas.width / 2, canvas.width - SLIDE_MARGIN, canvas.width]
    const ranges: [number, number][] = Array.from({ length: 5 }, () => [0, canvas.height] as [number, number])
    const kinds: SnapKind[] = ['canvas', 'canvas', 'center', 'canvas', 'canvas']
    for (const other of nearby) {
      targets.push(other.minX, boxCenterX(other), other.maxX)
      ranges.push([other.minY, other.maxY], [other.minY, other.maxY], [other.minY, other.maxY])
      kinds.push('edge', 'center', 'edge')
    }
    targets.forEach((value, index) => {
      const slideWide = isSlideWideRange(ranges[index], canvas)
      const inset = value === SLIDE_MARGIN || value === canvas.width - SLIDE_MARGIN
      candidates.push({
        axis: 'x',
        delta: currentX - value,
        kind: kinds[index],
        relation: slideWide ? (inset ? 1 : 2) : crossRelation(pointBox, { minX: value, maxX: value, minY: ranges[index][0], maxY: ranges[index][1] }, 'x'),
        guides: [makeAlignGuide('vertical', value, [ranges[index], [currentY ?? ranges[index][0], currentY ?? ranges[index][1]]], kinds[index])],
      })
    })
  }
  return candidates
}

export const snapResizePoint = (
  currentX: number | null,
  currentY: number | null,
  others: SnapBox[],
  options: ResizeSnapOptions,
): SnapResult => {
  const threshold = options.threshold ?? SNAP_THRESHOLD
  const { mode, canvas, gridSize } = options
  const movingBox = options.moving || {
    minX: currentX ?? 0,
    maxX: currentX ?? 0,
    minY: currentY ?? 0,
    maxY: currentY ?? 0,
  }
  const { nearby, index } = neighborsForMove(movingBox, others, options.index, threshold)

  if (mode === 'grid') {
    const size = gridSize > 0 ? gridSize : FINE_GRID_SIZE
    const offsetX = currentX === null ? 0 : currentX - snapToGrid(currentX, size)
    const offsetY = currentY === null ? 0 : currentY - snapToGrid(currentY, size)
    const box = movingBox
    const snapped = translateBox(box, -offsetX, -offsetY)
    return {
      offsetX,
      offsetY,
      guides: mergeGuides([
        ...collectAlignmentGuides(snapped, nearby, canvas, index),
        ...(currentX !== null && offsetX ? [makeGridGuide('vertical', currentX - offsetX, snapped)] : []),
        ...(currentY !== null && offsetY ? [makeGridGuide('horizontal', currentY - offsetY, snapped)] : []),
      ]),
    }
  }

  const candidates = [
    ...collectPointAlignCandidates(currentX, currentY, nearby, canvas, options.moving),
    ...(options.moving
      ? collectSizeCandidates(currentX, currentY, options.moving, nearby, !!options.resizeWidth, !!options.resizeHeight)
      : []),
  ]
  const xWin = currentX === null ? null : pickBest(candidates.filter(candidate => candidate.axis === 'x'), threshold)
  const yWin = currentY === null ? null : pickBest(candidates.filter(candidate => candidate.axis === 'y'), threshold)
  return {
    offsetX: xWin?.delta ?? 0,
    offsetY: yWin?.delta ?? 0,
    guides: mergeGuides([
      ...(xWin?.guides || []),
      ...(yWin?.guides || []),
    ]),
  }
}

const onVerticalLine = (box: SnapBox, x: number) => (
  Math.abs(box.minX - x) <= SNAP_MATCH
  || Math.abs(boxCenterX(box) - x) <= SNAP_MATCH
  || Math.abs(box.maxX - x) <= SNAP_MATCH
)

const onHorizontalLine = (box: SnapBox, y: number) => (
  Math.abs(box.minY - y) <= SNAP_MATCH
  || Math.abs(boxCenterY(box) - y) <= SNAP_MATCH
  || Math.abs(box.maxY - y) <= SNAP_MATCH
)

const overlapCenter = (a0: number, a1: number, b0: number, b1: number) => {
  const start = Math.max(a0, b0)
  const end = Math.min(a1, b1)
  if (end > start) return (start + end) / 2
  return (a0 + a1 + b0 + b1) / 4
}

const measureKey = (guide: SnapGuide) => {
  const start = guide.type === 'vertical' ? guide.axis.y : guide.axis.x
  return `${guide.type}:${Math.round(start * 10)}:${Math.round(guide.length * 10)}`
}

const pushUniqueMeasure = (guides: SnapGuide[], measure: SnapGuide, seen: Set<string>) => {
  if (measure.length < 1) return false
  const key = measureKey(measure)
  if (seen.has(key)) return false
  seen.add(key)
  guides.push(measure)
  return true
}

const measureVerticalGap = (a: SnapBox, b: SnapBox, cross: number) => {
  const gap = gap1D(a.minY, a.maxY, b.minY, b.maxY)
  if (!gap) return null
  return makeMeasureGuide('vertical', gap.start, gap.end, cross, gap.distance)
}

const measureHorizontalGap = (a: SnapBox, b: SnapBox, cross: number) => {
  const gap = gap1D(a.minX, a.maxX, b.minX, b.maxX)
  if (!gap) return null
  return makeMeasureGuide('horizontal', gap.start, gap.end, cross, gap.distance)
}

const nearestInDirection = (
  moving: SnapBox,
  others: SnapBox[],
  direction: 'left' | 'right' | 'up' | 'down',
) => {
  let best: SnapBox | null = null
  let bestScore = Infinity
  for (const other of others) {
    if (direction === 'left' || direction === 'right') {
      const gap = gap1D(moving.minX, moving.maxX, other.minX, other.maxX)
      if (!gap) continue
      const isLeft = other.maxX <= moving.minX + SNAP_MATCH
      if (direction === 'left' && !isLeft) continue
      if (direction === 'right' && isLeft) continue
      const score = gap.distance + crossRelation(moving, other, 'x') * 80
      if (score < bestScore) {
        best = other
        bestScore = score
      }
    }
    else {
      const gap = gap1D(moving.minY, moving.maxY, other.minY, other.maxY)
      if (!gap) continue
      const isUp = other.maxY <= moving.minY + SNAP_MATCH
      if (direction === 'up' && !isUp) continue
      if (direction === 'down' && isUp) continue
      const score = gap.distance + crossRelation(moving, other, 'y') * 80
      if (score < bestScore) {
        best = other
        bestScore = score
      }
    }
  }
  return best
}

const primaryCounterpart = (moving: SnapBox, others: SnapBox[]) => {
  let best: SnapBox | null = null
  let bestScore = Infinity
  for (const other of others) {
    const xGap = gap1D(moving.minX, moving.maxX, other.minX, other.maxX)
    const yGap = gap1D(moving.minY, moving.maxY, other.minY, other.maxY)
    const relation = Math.min(crossRelation(moving, other, 'x'), crossRelation(moving, other, 'y'))
    const distance = Math.min(xGap?.distance ?? 1e6, yGap?.distance ?? 1e6)
    const score = relation * 400 + distance
    if (score < bestScore) {
      best = other
      bestScore = score
    }
  }
  return best
}

const emitGapChain = (
  boxes: SnapBox[],
  type: SnapGuide['type'],
  cross: number,
  measures: SnapGuide[],
  seen: Set<string>,
) => {
  const sorted = [...boxes].sort((a, b) => (type === 'vertical' ? a.minY - b.minY : a.minX - b.minX))
  for (let i = 0; i < sorted.length - 1; i++) {
    const measure = type === 'vertical'
      ? measureVerticalGap(sorted[i], sorted[i + 1], cross)
      : measureHorizontalGap(sorted[i], sorted[i + 1], cross)
    if (measure && measure.length <= RELATED_GAP) pushUniqueMeasure(measures, measure, seen)
  }
}

/**
 * Ctrl-held distance badges: adjacent gaps along live guides, both axes to
 * the most related object, nearest same-row/column neighbors, and slide margins.
 */
export const collectCtrlMeasures = (
  moving: SnapBox,
  others: SnapBox[],
  canvas: SnapCanvas,
  guides: SnapGuide[] = [],
): SnapGuide[] => {
  const measures: SnapGuide[] = []
  const seen = new Set<string>()
  for (const guide of guides) {
    if (guide.kind === 'spacing' || guide.kind === 'size' || guide.kind === 'measure') {
      seen.add(measureKey(guide))
    }
  }

  const alignGuides = guides.filter(guide => (
    guide.kind !== 'spacing'
    && guide.kind !== 'size'
    && guide.kind !== 'measure'
    && guide.kind !== 'grid'
  ))

  for (const guide of alignGuides) {
    if (guide.type === 'vertical') {
      const x = guide.axis.x
      emitGapChain([moving, ...others.filter(other => onVerticalLine(other, x))], 'vertical', x, measures, seen)
    }
    else {
      const y = guide.axis.y
      emitGapChain([moving, ...others.filter(other => onHorizontalLine(other, y))], 'horizontal', y, measures, seen)
    }
  }

  const counterpart = primaryCounterpart(moving, others)
  if (counterpart) {
    const xMeasure = measureHorizontalGap(moving, counterpart, overlapCenter(moving.minY, moving.maxY, counterpart.minY, counterpart.maxY))
    const yMeasure = measureVerticalGap(moving, counterpart, overlapCenter(moving.minX, moving.maxX, counterpart.minX, counterpart.maxX))
    if (xMeasure && xMeasure.length <= RELATED_GAP) pushUniqueMeasure(measures, xMeasure, seen)
    if (yMeasure && yMeasure.length <= RELATED_GAP) pushUniqueMeasure(measures, yMeasure, seen)
  }

  const left = nearestInDirection(moving, others, 'left')
  const right = nearestInDirection(moving, others, 'right')
  const up = nearestInDirection(moving, others, 'up')
  const down = nearestInDirection(moving, others, 'down')
  if (left) {
    const measure = measureHorizontalGap(moving, left, overlapCenter(moving.minY, moving.maxY, left.minY, left.maxY))
    if (measure && measure.length <= RELATED_GAP) pushUniqueMeasure(measures, measure, seen)
  }
  if (right) {
    const measure = measureHorizontalGap(moving, right, overlapCenter(moving.minY, moving.maxY, right.minY, right.maxY))
    if (measure && measure.length <= RELATED_GAP) pushUniqueMeasure(measures, measure, seen)
  }
  if (up) {
    const measure = measureVerticalGap(moving, up, overlapCenter(moving.minX, moving.maxX, up.minX, up.maxX))
    if (measure && measure.length <= RELATED_GAP) pushUniqueMeasure(measures, measure, seen)
  }
  if (down) {
    const measure = measureVerticalGap(moving, down, overlapCenter(moving.minX, moving.maxX, down.minX, down.maxX))
    if (measure && measure.length <= RELATED_GAP) pushUniqueMeasure(measures, measure, seen)
  }

  const leftGap = left ? gap1D(moving.minX, moving.maxX, left.minX, left.maxX)?.distance ?? Infinity : Infinity
  const rightGap = right ? gap1D(moving.minX, moving.maxX, right.minX, right.maxX)?.distance ?? Infinity : Infinity
  const upGap = up ? gap1D(moving.minY, moving.maxY, up.minY, up.maxY)?.distance ?? Infinity : Infinity
  const downGap = down ? gap1D(moving.minY, moving.maxY, down.minY, down.maxY)?.distance ?? Infinity : Infinity
  const midY = boxCenterY(moving)
  const midX = boxCenterX(moving)
  const idleMargin = SLIDE_MARGIN * 3
  const usefulMargin = (distance: number, neighborGap: number, hasNeighbor: boolean) => (
    distance > 0.5
    && distance <= neighborGap
    && (hasNeighbor || distance <= idleMargin)
  )
  if (usefulMargin(moving.minX, leftGap, !!left)) {
    pushUniqueMeasure(measures, makeMeasureGuide('horizontal', 0, moving.minX, midY, moving.minX), seen)
  }
  if (usefulMargin(canvas.width - moving.maxX, rightGap, !!right)) {
    pushUniqueMeasure(measures, makeMeasureGuide('horizontal', moving.maxX, canvas.width, midY, canvas.width - moving.maxX), seen)
  }
  if (usefulMargin(moving.minY, upGap, !!up)) {
    pushUniqueMeasure(measures, makeMeasureGuide('vertical', 0, moving.minY, midX, moving.minY), seen)
  }
  if (usefulMargin(canvas.height - moving.maxY, downGap, !!down)) {
    pushUniqueMeasure(measures, makeMeasureGuide('vertical', moving.maxY, canvas.height, midX, canvas.height - moving.maxY), seen)
  }

  return measures
    .sort((a, b) => a.length - b.length)
    .slice(0, MAX_CTRL_MEASURES)
}
