import { describe, expect, it } from '@rstest/core'
import { snapPageDrag, type PageSnapRect } from '@/views/Myna/pageSnapping'
const rect = (id: string, x: number, y: number, width = 100, height = 100): PageSnapRect => ({ id, x, y, width, height })
describe('freeform page snapping', () => {
  it('aligns against explicit world-space ruler guides and ignores invalid guides', () => {
    const result = snapPageDrag({ moving: [rect('a', 0, 0)], stationary: [], dx: 123, dy: 7, scale: 1, customGuides: [{ axis: 'x', position: 125, start: -50, end: 300 }, { axis: 'y', position: NaN, start: 0, end: 100 }] })
    expect(result.dx).toBe(125)
    expect(result.dy).toBe(7)
    expect(result.guides).toEqual([{ axis: 'x', position: 125, start: -50, end: 300 }])
  })
  it('aligns page edges at negative coordinates and reports world-space guides', () => {
    const result = snapPageDrag({ moving: [rect('a', 0, 0)], stationary: [rect('b', -200, -200)], dx: -197, dy: -198, scale: 1 })
    expect([result.dx, result.dy]).toEqual([-200, -200])
    expect(result.guides.some(g => g.axis === 'x' && g.position === -200)).toBe(true)
  })
  it('uses a six screen-pixel threshold regardless of zoom', () => {
    const base = { moving: [rect('a', 0, 0)], stationary: [rect('b', 200, 500)], dx: 210, dy: 0 }
    expect(snapPageDrag({ ...base, scale: .5 }).dx).toBe(200)
    expect(snapPageDrag({ ...base, scale: 1 }).dx).toBe(210)
    expect(snapPageDrag({ ...base, dx: 204, scale: 2 }).dx).toBe(204)
  })
  it('preserves group offsets and excludes every moving page from snap targets', () => {
    const moving = [rect('a', 0, 0), rect('b', 170, 30)]
    const result = snapPageDrag({ moving, stationary: [...moving, rect('c', 500, 400)], dx: 234, dy: 0, scale: 1 })
    expect(result.dx).toBe(230) // group right edge aligns with stationary left
    expect(moving[1].x - moving[0].x).toBe(170)
    expect(snapPageDrag({ moving, stationary: moving, dx: 3, dy: 3, scale: 1 }).guides).toEqual([])
  })
  it('snaps a group origin to a grid including negative coordinates and respects axis lock', () => {
    const result = snapPageDrag({ moving: [rect('a', -200, -200)], stationary: [], dx: 17, dy: 37, scale: 1, gridSize: 20, axis: 'x' })
    expect([result.dx, result.dy]).toEqual([20, 0])
    expect(result.guides).toEqual([{ axis: 'x', position: -180, start: -200, end: -100 }])
  })
  it('quantizes to the grid outside the magnetic threshold, while nearby page anchors win', () => {
    const options = { moving: [rect('a', 0, 0)], stationary: [], dx: 43, dy: 43, scale: 1, gridSize: 100 }
    expect(snapPageDrag(options).dx).toBe(0)
    expect(snapPageDrag({ ...options, stationary: [rect('b', 47, 500)] }).dx).toBe(47)
  })
  it('equalizes the gap between two neighboring pages', () => {
    const result = snapPageDrag({ moving: [rect('a', 0, 0)], stationary: [rect('b', 0, 0), rect('c', 400, 0)], dx: 196, dy: 0, scale: 1 })
    expect(result.dx).toBe(200)
    expect(result.spacing.filter(s => s.axis === 'x').map(s => s.distance)).toEqual([100, 100])
  })
  it('repeats a neighboring gap at the end of a row', () => {
    const result = snapPageDrag({ moving: [rect('a', 0, 0)], stationary: [rect('b', 0, 0), rect('c', 220, 0)], dx: 443, dy: 0, scale: 1 })
    expect(result.dx).toBe(440)
    expect(result.spacing.filter(s => s.axis === 'x').map(s => s.distance)).toEqual([120, 120])
  })
  it('is deterministic across target order and ignores invalid rectangles', () => {
    const options = { moving: [rect('a', 0, 0)], stationary: [rect('b', 200, 400), rect('c', 208, 400), rect('bad', NaN, 0)], dx: 204, dy: 0, scale: 1 }
    expect(snapPageDrag(options)).toEqual(snapPageDrag({ ...options, stationary: [...options.stationary].reverse() }))
    expect(snapPageDrag({ ...options, moving: [] }).dx).toBe(204)
  })
})
