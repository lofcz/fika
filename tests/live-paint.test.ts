import { describe, expect, it } from '@rstest/core'
import { isEmptyPaintedDiff, planSlideRaster } from '../src/previewRaster/planSlideRaster'
import { liveGradientId, liveGradientTransform } from '../src/utils/liveElementPaint'

const shapeA = {
  id: 'a',
  type: 'shape' as const,
  left: 0,
  top: 0,
  width: 100,
  height: 100,
  rotate: 0,
  viewBox: [100, 100] as [number, number],
  path: 'M 0 0 L 100 0 L 0 100 Z',
  fill: '#1c7ed6',
  gradient: {
    type: 'linear' as const,
    rotate: 0,
    colors: [
      { pos: 0, color: '#1c7ed6' },
      { pos: 100, color: '#fff' },
    ],
  },
}
const shapeB = { ...shapeA, id: 'b', left: 200, fill: '#3b5bdb', gradient: undefined }
const text = {
  id: 't',
  type: 'text' as const,
  left: 20,
  top: 300,
  width: 200,
  height: 40,
  rotate: 0,
  content: '<p>Title</p>',
  defaultFontName: 'Arial',
  defaultColor: '#111',
}
const slide = (elements: typeof shapeA[]) => ({ id: 's1', elements })

describe('planSlideRaster', () => {
  const prev = slide([shapeA, shapeB, text])
  const rotated = slide([
    { ...shapeA, gradient: { ...shapeA.gradient, rotate: 90 } },
    shapeB,
    text,
  ])
  const moved = slide([{ ...shapeA, left: 40 }, shapeB, text])

  it('full-rebuilds the first paint and an evicted scratch', () => {
    expect(planSlideRaster(undefined, prev, { destCovers: false, scratchHasSlide: false }).kind).toBe('full')
    expect(planSlideRaster(prev, rotated, { destCovers: true, scratchHasSlide: false }).kind).toBe('full')
  })

  it('skips the same slide object', () => {
    expect(planSlideRaster(prev, prev, { destCovers: true, scratchHasSlide: true }).kind).toBe('skip')
  })

  it('patches only the edited shape for a gradient rotate', () => {
    const plan = planSlideRaster(prev, rotated, { destCovers: true, scratchHasSlide: true })
    expect(plan.kind).toBe('patch')
    if (plan.kind !== 'patch') return
    expect(plan.diff.contentChanged).toEqual(['a'])
    expect(plan.diff.added).toEqual([])
    expect(plan.diff.removed).toEqual([])
    expect(plan.diff.backgroundChanged).toBe(false)
  })

  it('moves a node without destroying it', () => {
    const plan = planSlideRaster(prev, moved, { destCovers: true, scratchHasSlide: true })
    expect(plan.kind).toBe('patch')
    if (plan.kind !== 'patch') return
    expect(plan.diff.movedOnly).toEqual(['a'])
    expect(plan.diff.contentChanged).toEqual([])
  })

  it('treats an empty diff as skippable', () => {
    expect(isEmptyPaintedDiff({
      added: [],
      removed: [],
      contentChanged: [],
      movedOnly: [],
      zOrderChanged: false,
      backgroundChanged: false,
    })).toBe(true)
  })
})

describe('liveElementPaint', () => {
  it('writes the SVG gradient id and transform the canvas already uses', () => {
    expect(liveGradientTransform(165)).toBe('rotate(165,0.5,0.5)')
    expect(liveGradientId('abc')).toBe('editable-gradient-abc')
  })
})
