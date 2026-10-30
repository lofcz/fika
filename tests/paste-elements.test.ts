import { describe, expect, it, rs } from '@rstest/core'
rs.mock('../src/store', () => {
  const state = {
    slideIndex: 0,
    slides: [{ id: 'slide', elements: [{ id: 'existing', type: 'shape', left: 10, top: 10, width: 100, height: 100, rotate: 0 }] }],
    addElement: rs.fn(),
  }
  return { useSlidesStore: { getState: () => state }, selectCurrentSlide: (s: typeof state) => s.slides[s.slideIndex] }
})
rs.mock('../src/hooks/useHistorySnapshot', () => ({ default: () => ({ addHistorySnapshot: rs.fn() }) }))
rs.mock('../src/utils/selectInsertedElements', () => ({ selectInsertedElements: rs.fn() }))
import useAddSlidesOrElements from '../src/hooks/useAddSlidesOrElements'
import { useSlidesStore } from '../src/store'
import { selectInsertedElements } from '../src/utils/selectInsertedElements'
import type { PPTElement } from '../src/types/slides'

describe('element paste', () => {
  it('ignores an empty paste on a populated slide', () => {
    const { addElementsFromData } = useAddSlidesOrElements()
    expect(() => addElementsFromData([])).not.toThrow()
    expect(useSlidesStore.getState().addElement).not.toHaveBeenCalled()
    expect(selectInsertedElements).not.toHaveBeenCalled()
  })
  it('remaps and offsets a clone without modifying the clipboard payload', () => {
    const source = structuredClone(useSlidesStore.getState().slides[0].elements) as PPTElement[]
    const before = structuredClone(source)
    useAddSlidesOrElements().addElementsFromData(source)
    expect(source).toEqual(before)
    const inserted = rs.mocked(useSlidesStore.getState().addElement).mock.calls[0][0] as PPTElement[]
    expect(inserted[0].id).not.toBe(source[0].id)
    expect(inserted[0].left).toBe(20)
    expect(inserted[0].top).toBe(20)
  })
})
