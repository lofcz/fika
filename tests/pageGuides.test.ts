import { describe, expect, it } from '@rstest/core'
import { snapToPageGuides, validPageGuides } from '@/utils/pageGuides'
import { resizeDeckSlides } from '@/utils/resizeDeck'
import type { Slide } from '@/types/slides'

const box = { minX: 96, maxX: 196, minY: 102, maxY: 202 }
const base = { offsetX: 0, offsetY: 0, guides: [] }
describe('page guides', () => {
  it('snaps edges and centers with a constant screen-space tolerance', () => {
    const guides = [{ id: 'x', axis: 'x' as const, position: 100 }, { id: 'y', axis: 'y' as const, position: 150 }]
    const snapped = snapToPageGuides(box, guides, 1, base)
    expect(snapped.offsetX).toBe(4)
    expect(snapped.offsetY).toBe(-2)
    expect(snapped.guides).toHaveLength(2)
    expect(snapToPageGuides(box, guides, 2, base).offsetX).toBe(0)
    expect(snapToPageGuides({ ...box, minX: 89, maxX: 189 }, guides, .5, base).offsetX).toBe(11)
    expect(base.guides).toHaveLength(0)
  })
  it('chooses the closest guide and overrides conflicting object alignment on that axis', () => {
    const result = snapToPageGuides(box, [
      { id: 'farther', axis: 'x', position: 100 }, { id: 'nearer', axis: 'x', position: 94 },
    ], 1, { offsetX: 1, offsetY: 3, guides: [{ type: 'vertical', axis: { x: 97, y: 0 }, length: 200 }] })
    expect(result.offsetX).toBe(-2)
    expect(result.offsetY).toBe(3)
    expect(result.guides).toHaveLength(1)
    expect(result.guides[0].axis.x).toBe(94)
  })
  it('accepts negative guide coordinates and filters malformed imported metadata', () => {
    const valid = validPageGuides([null, {}, { id: 'x', axis: 'x', position: -50 }, { id: 'x', axis: 'y', position: 25 }, { id: 'nan', axis: 'x', position: NaN }, { id: 'bad-axis', axis: 'z', position: 10 }])
    expect(valid).toEqual([{ id: 'x', axis: 'x', position: -50 }])
    expect(validPageGuides({ guides: [] })).toEqual([])
    expect(snapToPageGuides({ minX: -53, maxX: -3, minY: 0, maxY: 50 }, valid, 1, base).offsetX).toBe(3)
  })
  it('preserves guides in serialized documents and resizes each axis independently without mutating input', () => {
    const slides: Slide[] = [{ id: 'page', elements: [], guides: [{ id: 'x', axis: 'x', position: 250 }, { id: 'y', axis: 'y', position: 100 }] }]
    const resized = resizeDeckSlides(JSON.parse(JSON.stringify(slides)), { width: 1000, height: 500 }, { width: 500, height: 1000 })
    expect(resized[0].guides?.map(guide => guide.position)).toEqual([125, 200])
    expect(slides[0].guides?.map(guide => guide.position)).toEqual([250, 100])
  })
})
