import { describe, expect, it } from '@rstest/core'
import { diffPaintedSlide } from '../src/utils/diffPaintedSlide'
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

const isEmpty = (diff: ReturnType<typeof diffPaintedSlide>) => (
  !diff.backgroundChanged
  && !diff.zOrderChanged
  && diff.added.length === 0
  && diff.removed.length === 0
  && diff.contentChanged.length === 0
  && diff.movedOnly.length === 0
)

describe('slide repaint diff', () => {
  const prev = slide([shapeA, shapeB, text])
  const rotated = slide([
    { ...shapeA, gradient: { ...shapeA.gradient, rotate: 90 } },
    shapeB,
    text,
  ])
  const moved = slide([{ ...shapeA, left: 40 }, shapeB, text])

  it('reports every element as added on a first paint', () => {
    const diff = diffPaintedSlide(undefined, prev)
    expect(diff.added).toEqual(['a', 'b', 't'])
    expect(diff.backgroundChanged).toBe(true)
  })

  it('diffs to empty for the same slide object', () => {
    expect(isEmpty(diffPaintedSlide(prev, prev))).toBe(true)
  })

  it('flags only the edited shape for a gradient rotate', () => {
    const diff = diffPaintedSlide(prev, rotated)
    expect(diff.contentChanged).toEqual(['a'])
    expect(diff.added).toEqual([])
    expect(diff.removed).toEqual([])
    expect(diff.backgroundChanged).toBe(false)
  })

  it('classifies a bare reposition as movedOnly', () => {
    const diff = diffPaintedSlide(prev, moved)
    expect(diff.movedOnly).toEqual(['a'])
    expect(diff.contentChanged).toEqual([])
  })

  it('a resize is contentChanged and does not flip zOrderChanged', () => {
    const resized = slide([{ ...shapeA, width: 140 }, shapeB, text])
    const diff = diffPaintedSlide(prev, resized)
    expect(diff.contentChanged).toEqual(['a'])
    expect(diff.zOrderChanged).toBe(false)
    expect(diff.added).toEqual([])
    expect(diff.removed).toEqual([])
  })
})

describe('liveElementPaint', () => {
  it('writes the SVG gradient id and transform the canvas already uses', () => {
    expect(liveGradientTransform(165)).toBe('rotate(165,0.5,0.5)')
    expect(liveGradientId('abc')).toBe('editable-gradient-abc')
  })
})
