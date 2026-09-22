import { describe, expect, it } from '@rstest/core'
import { resolvePagePositions, arrangePagePositions, pageLayoutBounds, movePageElements } from '@/views/Myna/pageLayout'
import type { Slide } from '@/types/slides'
const page = (id: string, canvasPosition?: { x: number; y: number }): Slide => ({ id, elements: [], canvasPosition })
describe('freeform page layout', () => {
  it('keeps authored negative and overlapping positions and includes them in bounds', () => {
    const pages = [page('a', { x: -100, y: -80 }), page('b', { x: -100, y: -80 }), page('c', { x: 1300, y: 700 })]
    expect(resolvePagePositions(pages, 1000, 800).get('b')).toEqual({ x: -100, y: -80 })
    expect(pageLayoutBounds(pages, 1000, 800)).toEqual({ x: -100, y: -80, width: 2400, height: 1580 })
  })
  it('places unpositioned pages without collisions and ignores malformed positions', () => {
    const pages = [page('a', { x: 0, y: 0 }), page('b'), page('c', { x: NaN, y: 0 })]
    const positions = resolvePagePositions(pages, 1000, 800)
    expect(positions.get('b')).toEqual({ x: 1120, y: 0 })
    expect(positions.get('c')).toEqual({ x: 2240, y: 0 })
    expect(resolvePagePositions([...pages, page('d')], 1000, 800).get('b')).toEqual(positions.get('b'))
  })
  it('arranges pages independently of order and does not mutate authored data', () => {
    const pages = [page('a', { x: -5, y: 2 }), page('b'), page('c'), page('d')]
    expect(arrangePagePositions(pages, 100, 80, 'grid').get('d')).toEqual({ x: 220, y: 200 })
    expect(arrangePagePositions(pages, 100, 80, 'horizontal').get('d')).toEqual({ x: 660, y: 0 })
    expect(arrangePagePositions(pages, 100, 80, 'vertical').get('d')).toEqual({ x: 0, y: 600 })
    expect(pages[0].canvasPosition).toEqual({ x: -5, y: 2 })
  })
  it('moves complete groups and attached metadata without moving local geometry', () => {
    const source = { ...page('source'), elements: [{ id: 'one', type: 'text', groupId: 'g', left: 70, top: -5 }, { id: 'two', type: 'text', groupId: 'g', left: 120, top: 10 }, { id: 'three', type: 'text' }], notes: [{ id: 'note', elId: 'one' }, { id: 'page-note' }], animations: [{ id: 'anim', elId: 'two' }] } as Slide
    const result = movePageElements(source, page('target'), ['one'])
    expect(result.movedIds).toEqual(['one', 'two'])
    expect(result.source.elements.map(element => element.id)).toEqual(['three'])
    expect(result.target.elements[0].left).toBe(70)
    expect(result.target.notes?.map(note => note.id)).toEqual(['note'])
    expect(result.source.notes?.map(note => note.id)).toEqual(['page-note'])
    expect(result.target.animations?.map(animation => animation.id)).toEqual(['anim'])
    expect(source.elements).toHaveLength(3)
  })
})
