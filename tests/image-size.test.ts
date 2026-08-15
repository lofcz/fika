import { describe, expect, it } from '@rstest/core'
import { readImageSize, resizeToMaxEdge } from '../src/utils/imageSize'

const bytes = (...values: number[]) => new Uint8Array(values)

describe('readImageSize', () => {
  it('reads PNG IHDR dimensions', () => {
    const png = bytes(
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x07, 0x80,
      0x00, 0x00, 0x04, 0x38,
    )
    expect(readImageSize(png)).toEqual({ width: 1920, height: 1080 })
  })

  it('reads GIF logical screen size', () => {
    const gif = bytes(
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61,
      0x40, 0x01,
      0xf0, 0x00,
    )
    expect(readImageSize(gif)).toEqual({ width: 320, height: 240 })
  })

  it('reads JPEG SOF0 dimensions', () => {
    const jpeg = bytes(
      0xff, 0xd8,
      0xff, 0xc0,
      0x00, 0x11,
      0x08,
      0x01, 0xe0,
      0x02, 0x80,
      0x00, 0x00, 0x00, 0x00,
    )
    expect(readImageSize(jpeg)).toEqual({ width: 640, height: 480 })
  })

  it('reads WebP VP8X canvas size', () => {
    const webp = new Uint8Array(30)
    webp.set([0x52, 0x49, 0x46, 0x46], 0)
    webp.set([0x57, 0x45, 0x42, 0x50], 8)
    webp.set([0x56, 0x50, 0x38, 0x58], 12)
    webp[24] = 1919 & 0xff
    webp[25] = (1919 >> 8) & 0xff
    webp[26] = (1919 >> 16) & 0xff
    webp[27] = 1079 & 0xff
    webp[28] = (1079 >> 8) & 0xff
    webp[29] = (1079 >> 16) & 0xff
    expect(readImageSize(webp)).toEqual({ width: 1920, height: 1080 })
  })

  it('returns null for unknown bytes', () => {
    expect(readImageSize(bytes(0x00, 0x01, 0x02, 0x03))).toBeNull()
  })
})

describe('resizeToMaxEdge', () => {
  it('leaves already-small images alone', () => {
    expect(resizeToMaxEdge(400, 300, 512)).toEqual({ width: 400, height: 300 })
  })

  it('scales the long edge down and keeps aspect', () => {
    expect(resizeToMaxEdge(4000, 2000, 512)).toEqual({ width: 512, height: 256 })
    expect(resizeToMaxEdge(2000, 4000, 512)).toEqual({ width: 256, height: 512 })
  })
})
