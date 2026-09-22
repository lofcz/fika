import { describe, expect, it } from '@rstest/core'
import { FRAME_LAYOUTS, createPhotoFrames, coverRange, fillPhotoFrame, layoutPhotoFrames } from '@/views/Myna/photoFrames'
describe('native photo frames', () => {
  it('creates editable cells with distinct IDs and shared group identity', () => {
    for (const layout of FRAME_LAYOUTS) {
      const cells = createPhotoFrames(layout, 1080, 1080)
      expect(new Set(cells.map(c => c.id)).size).toBe(cells.length)
      expect(cells.every(c => c.type === 'image' && c.width > 0 && c.height > 0 && c.left >= 0 && c.top >= 0)).toBe(true)
      expect(new Set(cells.map(c => c.groupId)).size).toBe(1)
      for (const [i, a] of cells.entries()) for (const b of cells.slice(i + 1)) {
        expect(a.left + a.width <= b.left || b.left + b.width <= a.left || a.top + a.height <= b.top || b.top + b.height <= a.top).toBe(true)
      }
    }
    expect(createPhotoFrames('nine', 1080, 1080)).toHaveLength(9)
  })
  it('covers without distortion for both image orientations', () => {
    expect(coverRange(200, 100, 100, 100)).toEqual([[25, 0], [75, 100]])
    expect(coverRange(100, 200, 100, 100)).toEqual([[0, 25], [100, 75]])
    expect(coverRange(0, 200, 100, 100)).toEqual([[0, 0], [100, 100]])
  })
  it('persists source, crop, mask and cell geometry through serialization', () => {
    const frame = createPhotoFrames('ellipse', 1000, 800)[0]
    const filled = fillPhotoFrame(frame, 'data:image/png;base64,test', 200, 100)
    const restored = JSON.parse(JSON.stringify(filled))
    expect(restored.clip.shape).toBe('ellipse')
    expect(restored.photoFrame.empty).toBe(false)
    expect(restored.clip.range).toEqual([[25, 0], [75, 100]])
    expect(restored.left).toBe(frame.left)
    expect(restored.width).toBe(frame.width)
    expect(frame.photoFrame?.empty).toBe(true)
  })
  it('updates gutters after group movement/resize without changing bounds', () => {
    const original = createPhotoFrames('hero', 1080, 1080).map(e => ({ ...e, left: e.left * 2 + 40, top: e.top * 2 + 90, width: e.width * 2, height: e.height * 2 }))
    const updated = layoutPhotoFrames(original, 30)
    const bounds = (cells: typeof original) => [Math.min(...cells.map(e => e.left)), Math.min(...cells.map(e => e.top)), Math.max(...cells.map(e => e.left + e.width)), Math.max(...cells.map(e => e.top + e.height))]
    expect(bounds(updated)).toEqual(bounds(original))
    expect(updated[1].left - updated[0].left - updated[0].width).toBeCloseTo(30)
    expect(updated[2].top - updated[1].top - updated[1].height).toBeCloseTo(30)
    expect(updated[0].id).toBe(original[0].id)
  })
})
