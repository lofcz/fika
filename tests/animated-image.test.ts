import { beforeEach, describe, expect, it } from '@rstest/core'
import { readImageSize } from '../src/utils/imageSize'
import { detectAnimatedImageBytes, resetAnimatedImageCacheForTests } from '../src/utils/animatedImage'
import {
  getAnimatedElementsForSlide,
  isAnimatedImagePaused,
  registerAnimatedImageElement,
  resetAnimatedImagePlaybackForSlide,
  resetAnimatedImagePlaybackForTests,
  setAnimatedImagePaused,
  toggleAnimatedImagePlayback,
} from '../src/utils/animatedImagePlayback'

const concat = (...chunks: Uint8Array[]) => {
  const total = chunks.reduce((sum, c) => sum + c.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

const ascii = (text: string) => Uint8Array.from([...text].map(ch => ch.charCodeAt(0)))

const u32be = (value: number) => new Uint8Array([
  (value >>> 24) & 0xff,
  (value >>> 16) & 0xff,
  (value >>> 8) & 0xff,
  value & 0xff,
])

const u16be = (value: number) => new Uint8Array([
  (value >>> 8) & 0xff,
  value & 0xff,
])

const box = (type: string, body: Uint8Array) => concat(u32be(8 + body.length), ascii(type), body)

const fullBox = (type: string, version: number, flags: number, body: Uint8Array) => (
  box(type, concat(new Uint8Array([version, (flags >>> 16) & 0xff, (flags >>> 8) & 0xff, flags & 0xff]), body))
)

const makeGif = (frameCount: number) => {
  // GIF89a 2x2 with 2-color Global Color Table (6 bytes)
  const header = new Uint8Array([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61,
    0x02, 0x00, 0x02, 0x00,
    0x80, 0x00, 0x00,
    0x00, 0x00, 0x00, 0xff, 0xff, 0xff,
  ])
  const frame = new Uint8Array([
    0x21, 0xf9, 0x04, 0x00, 0x0a, 0x00, 0x00, 0x00, // GCE
    0x2c, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x02, 0x00, 0x00, // image descriptor
    0x02, 0x02, 0x44, 0x01, 0x00, // LZW min code size + 2-byte sub-block + terminator
  ])
  const parts: Uint8Array[] = [header]
  for (let i = 0; i < frameCount; i++) parts.push(frame)
  parts.push(new Uint8Array([0x3b]))
  return concat(...parts)
}

const makePng = (actlFrames?: number) => {
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const chunk = (type: string, data: Uint8Array) => concat(u32be(data.length), ascii(type), data, new Uint8Array(4))
  const ihdr = chunk('IHDR', concat(u32be(64), u32be(48), new Uint8Array([8, 6, 0, 0, 0])))
  const idat = chunk('IDAT', new Uint8Array([0x00]))
  const iend = chunk('IEND', new Uint8Array(0))
  if (actlFrames !== undefined) {
    const actl = chunk('acTL', concat(u32be(actlFrames), u32be(0)))
    return concat(sig, ihdr, actl, idat, iend)
  }
  return concat(sig, ihdr, idat, iend)
}

const makeWebp = (animated: boolean) => {
  const buf = new Uint8Array(30)
  buf.set(ascii('RIFF'), 0)
  buf[4] = 22
  buf.set(ascii('WEBP'), 8)
  buf.set(ascii('VP8X'), 12)
  buf[16] = 10
  buf[20] = animated ? 0x02 : 0x00
  buf[24] = 199
  buf[27] = 99
  return buf
}

const makeAvif = ({
  brands,
  width,
  height,
  moovSamples,
}: {
  brands: string[]
  width: number
  height: number
  moovSamples?: number
}) => {
  const [major, ...compat] = brands
  const ftyp = box('ftyp', concat(ascii(major), u32be(0), ...compat.map(ascii)))
  const ispe = fullBox('ispe', 0, 0, concat(u32be(width), u32be(height)))
  const meta = fullBox('meta', 0, 0, box('iprp', box('ipco', ispe)))
  if (moovSamples === undefined) return concat(ftyp, meta)
  const stsz = fullBox('stsz', 0, 0, concat(u32be(0), u32be(moovSamples)))
  const av01 = box('av01', concat(new Uint8Array(24), u16be(width), u16be(height), new Uint8Array(10)))
  const stsd = fullBox('stsd', 0, 0, concat(u32be(1), av01))
  const moov = box('moov', box('trak', box('mdia', box('minf', box('stbl', concat(stsd, stsz))))))
  return concat(ftyp, meta, moov)
}

describe('detectAnimatedImageBytes', () => {
  it('distinguishes multi-frame animated GIF from static 1-frame GIF', () => {
    expect(detectAnimatedImageBytes(makeGif(3), 'image/gif')).toBe('gif')
    expect(detectAnimatedImageBytes(makeGif(1), 'image/gif')).toBeNull()
  })

  it('distinguishes APNG from static PNG', () => {
    expect(detectAnimatedImageBytes(makePng(4), 'image/png')).toBe('apng')
    expect(detectAnimatedImageBytes(makePng(1), 'image/png')).toBeNull()
    expect(detectAnimatedImageBytes(makePng(), 'image/png')).toBeNull()
  })

  it('distinguishes animated WebP from static WebP', () => {
    expect(detectAnimatedImageBytes(makeWebp(true), 'image/webp')).toBe('webp')
    expect(detectAnimatedImageBytes(makeWebp(false), 'image/webp')).toBeNull()
  })

  it('distinguishes animated AVIF (avis brand or multi-sample moov) from static AVIF', () => {
    const avis = makeAvif({ brands: ['avis', 'mif1', 'avif'], width: 640, height: 360, moovSamples: 6 })
    const moovOnly = makeAvif({ brands: ['avif', 'mif1'], width: 640, height: 360, moovSamples: 5 })
    const staticAvif = makeAvif({ brands: ['avif', 'mif1'], width: 640, height: 360 })
    const singleSampleMoov = makeAvif({ brands: ['avif', 'mif1'], width: 640, height: 360, moovSamples: 1 })
    expect(detectAnimatedImageBytes(avis, 'image/avif')).toBe('avif')
    expect(detectAnimatedImageBytes(moovOnly, 'image/avif')).toBe('avif')
    expect(detectAnimatedImageBytes(staticAvif, 'image/avif')).toBeNull()
    expect(detectAnimatedImageBytes(singleSampleMoov, 'image/avif')).toBeNull()
  })
})

describe('readImageSize AVIF support', () => {
  it('reads dimensions from AVIF ispe box and animated sequence av01 fallback', () => {
    const staticAvif = makeAvif({ brands: ['avif', 'mif1'], width: 800, height: 450 })
    expect(readImageSize(staticAvif)).toEqual({ width: 800, height: 450 })

    // Sequence without meta/ispe falls back to moov/stsd/av01 dimensions.
    const ftyp = box('ftyp', concat(ascii('avis'), u32be(0), ascii('avif')))
    const av01 = box('av01', concat(new Uint8Array(24), u16be(512), u16be(384), new Uint8Array(10)))
    const stsd = fullBox('stsd', 0, 0, concat(u32be(1), av01))
    const seqOnly = concat(ftyp, box('moov', box('trak', box('mdia', box('minf', box('stbl', stsd))))))
    expect(readImageSize(seqOnly)).toEqual({ width: 512, height: 384 })
  })
})

describe('animatedImagePlayback registry', () => {
  beforeEach(() => {
    resetAnimatedImageCacheForTests()
    resetAnimatedImagePlaybackForTests()
  })

  it('registers animated elements per slide, toggles playback, and resets on slide change', () => {
    const unreg = registerAnimatedImageElement('s1', 'el1', 'gif')
    expect(getAnimatedElementsForSlide('s1')).toEqual([{ slideId: 's1', elementId: 'el1', format: 'gif' }])
    expect(getAnimatedElementsForSlide('s2')).toEqual([])

    expect(isAnimatedImagePaused('s1', 'el1')).toBe(false)
    expect(toggleAnimatedImagePlayback('s1', 'el1')).toBe(true)
    expect(isAnimatedImagePaused('s1', 'el1')).toBe(true)
    expect(toggleAnimatedImagePlayback('s1', 'el1')).toBe(false)
    expect(isAnimatedImagePaused('s1', 'el1')).toBe(false)

    setAnimatedImagePaused('s1', 'el1', true)
    expect(isAnimatedImagePaused('s1', 'el1')).toBe(true)
    resetAnimatedImagePlaybackForSlide('s1')
    expect(isAnimatedImagePaused('s1', 'el1')).toBe(false)

    unreg()
    expect(getAnimatedElementsForSlide('s1')).toEqual([])
  })
})
