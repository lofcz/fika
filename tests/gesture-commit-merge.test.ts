import { describe, expect, it } from '@rstest/core'
import type { PPTElement, Slide } from '../src/types/slides'
import { mergeGestureLayout } from '../src/utils/liveLayoutCommit'
import { repairDuplicateElementIds } from '../src/utils/repairElementIds'

const shape = (id: string, left: number, top = 0): PPTElement => ({
  id, type: 'shape', left, top, width: 100, height: 80, rotate: 0, viewBox: [100, 80], path: 'M0 0H100V80H0Z', fill: '#123456', fixedRatio: false,
} as PPTElement)

describe('mergeGestureLayout', () => {
  it('never copies another slide\'s fork onto the target slide', () => {
    const target = [shape('a1', 0), shape('a2', 200)]
    const otherSlide = [shape('t1', 50), shape('t2', 300)]
    const foreign = new Set(['t1', 't2'])
    expect(mergeGestureLayout(otherSlide, target, target, foreign)).toBe(target)
  })

  it('applies the gesture layout to its own slide', () => {
    const base = [shape('a1', 0), shape('a2', 200)]
    const live = [shape('a1', 40), base[1]]
    const merged = mergeGestureLayout(live, base, base, new Set())
    expect(merged.map(el => el.left)).toEqual([40, 200])
  })

  it('keeps concurrent edits: added elements stay, deleted stay gone, untouched layout wins', () => {
    const base = [shape('a1', 0), shape('a2', 200), shape('a3', 400)]
    const store = [shape('a1', 0), shape('a2', 250), shape('agent-new', 600)] // agent moved a2, deleted a3, added one
    const live = [shape('a1', 40), shape('a2', 200), shape('a3', 400)] // teacher dragged a1
    const merged = mergeGestureLayout(live, base, store, new Set())
    expect(merged.map(el => `${el.id}@${el.left}`)).toEqual(['a1@40', 'a2@250', 'agent-new@600'])
  })

  it('appends elements the gesture created (copy-drag) but not foreign ones', () => {
    const base = [shape('a1', 0)]
    const store = [shape('a1', 0), shape('x', 10)]
    const live = [shape('a1', 0), shape('copy-1', 60), shape('t1', 5)]
    const merged = mergeGestureLayout(live, base, store, new Set(['t1']))
    expect(merged.map(el => el.id)).toEqual(['a1', 'x', 'copy-1'])
  })
})

describe('repairDuplicateElementIds', () => {
  it('returns the same array when ids are unique', () => {
    const slides = [{ id: 's1', elements: [shape('a', 0)] }, { id: 's2', elements: [shape('b', 0)] }] as Slide[]
    expect(repairDuplicateElementIds(slides)).toBe(slides)
  })

  it('gives later repeats deterministic slide-scoped ids and remaps references', () => {
    const slides = [
      { id: 's1', elements: [shape('a', 0), shape('b', 0)] },
      { id: 's2', elements: [shape('a', 0), { ...shape('b', 0), parentFrameId: 'a' }], animations: [{ id: 'an', elId: 'a', effect: 'fadeIn', type: 'in', duration: 500, trigger: 'click' }] },
    ] as Slide[]
    const once = repairDuplicateElementIds(slides)
    const twice = repairDuplicateElementIds(slides)
    expect(once[0]).toBe(slides[0])
    expect(once[1].elements.map(el => el.id)).toEqual(['a-s2', 'b-s2'])
    expect(once[1].elements[1].parentFrameId).toBe('a-s2')
    expect(once[1].animations?.[0].elId).toBe('a-s2')
    expect(twice[1].elements.map(el => el.id)).toEqual(['a-s2', 'b-s2'])
    expect(repairDuplicateElementIds(once)).toBe(once)
  })
})
