import { afterEach, describe, expect, it } from '@rstest/core'
import {
  collectSlideMediaSrcs,
  internMediaSrc,
  internSlidesMedia,
  isDataUrl,
  resetMediaInternForTests,
} from '../src/utils/mediaIntern'

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

afterEach(() => {
  resetMediaInternForTests()
})

describe('media intern', () => {
  it('leaves http and blob URLs alone', async () => {
    expect(isDataUrl('https://example.com/a.png')).toBe(false)
    expect(await internMediaSrc('https://example.com/a.png')).toBe('https://example.com/a.png')
    expect(await internMediaSrc('blob:https://example.com/1')).toBe('blob:https://example.com/1')
  })

  it('converts a data URL once and reuses the blob URL', async () => {
    const first = await internMediaSrc(PIXEL)
    const second = await internMediaSrc(PIXEL)
    expect(first.startsWith('blob:')).toBe(true)
    expect(second).toBe(first)
  })

  it('rewrites slide pictures, backgrounds, and patterns in place', async () => {
    const slides = [{
      id: 's',
      elements: [
        { id: 'img', type: 'image', src: PIXEL, width: 10, height: 10, left: 0, top: 0, rotate: 0 },
        { id: 'shp', type: 'shape', pattern: PIXEL, width: 10, height: 10, left: 0, top: 0, rotate: 0, viewBox: [1, 1], path: 'M0 0' },
      ],
      background: { type: 'image', image: { src: PIXEL, size: 'cover' } },
    }]
    await internSlidesMedia(slides as never)
    const srcs = collectSlideMediaSrcs(slides as never)
    expect(srcs).toHaveLength(3)
    expect(new Set(srcs).size).toBe(1)
    expect(srcs[0].startsWith('blob:')).toBe(true)
  })
})
