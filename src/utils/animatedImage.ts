import { loadImageBlob, onImageBitmapEvict } from './imageBitmapCache'
import { bitmapSrcKeys, isBlobUrl, onMediaInterned } from './mediaIntern'

export type AnimatedImageFormat = 'gif' | 'webp' | 'avif' | 'apng'

export interface AnimatedImageAsset {
  src: string
  format: AnimatedImageFormat
  mimeType: string
  blob: Blob
  /** Same-origin object URL (or existing blob: src) suitable for fallback <img> playback. */
  objectUrl: string
  /** True when this module allocated `objectUrl` and owns revoking it on eviction. */
  ownsObjectUrl: boolean
}

const FORMAT_MIME: Record<AnimatedImageFormat, string> = {
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  apng: 'image/png',
}

const NON_ANIMATED_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/svg+xml',
  'image/bmp',
  'image/x-icon',
  'image/vnd.microsoft.icon',
])

const HEADER_SLICE_BYTES = 64 * 1024

const u32be = (bytes: Uint8Array, offset: number) => (
  ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
)

const u32le = (bytes: Uint8Array, offset: number) => (
  (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
)

const ascii = (bytes: Uint8Array, offset: number, length: number) => {
  let out = ''
  const end = Math.min(bytes.length, offset + length)
  for (let i = offset; i < end; i++) out += String.fromCharCode(bytes[i])
  return out
}

const skipGifSubBlocks = (bytes: Uint8Array, offset: number): number => {
  let pos = offset
  while (pos < bytes.length) {
    const size = bytes[pos]
    pos += 1
    if (size === 0) return pos
    pos += size
  }
  return bytes.length
}

const isAnimatedGif = (bytes: Uint8Array): boolean => {
  if (bytes.length < 14) return false
  const sig = ascii(bytes, 0, 6)
  if (sig !== 'GIF87a' && sig !== 'GIF89a') return false
  let pos = 13
  const packed = bytes[10]
  if (packed & 0x80) {
    pos += 3 * (1 << ((packed & 0x07) + 1))
  }
  let frames = 0
  while (pos < bytes.length) {
    const block = bytes[pos]
    if (block === 0x3b) break // trailer
    if (block === 0x2c) {
      // Image descriptor (10 bytes: 0x2C + left(2) + top(2) + w(2) + h(2) + packed(1))
      frames += 1
      if (frames >= 2) return true
      if (pos + 10 > bytes.length) break
      const localPacked = bytes[pos + 9]
      pos += 10
      if (localPacked & 0x80) {
        pos += 3 * (1 << ((localPacked & 0x07) + 1))
      }
      if (pos >= bytes.length) break
      pos += 1 // LZW minimum code size
      pos = skipGifSubBlocks(bytes, pos)
      continue
    }
    if (block === 0x21) {
      // Extension block (0x21 + label + sub-blocks)
      if (pos + 2 > bytes.length) break
      pos = skipGifSubBlocks(bytes, pos + 2)
      continue
    }
    // Tolerate stray padding bytes gracefully
    pos += 1
  }
  return false
}

const isAnimatedPng = (bytes: Uint8Array): boolean => {
  if (bytes.length < 33) return false
  if (
    bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47
    || bytes[4] !== 0x0d || bytes[5] !== 0x0a || bytes[6] !== 0x1a || bytes[7] !== 0x0a
  ) return false
  let pos = 8
  while (pos + 12 <= bytes.length) {
    const length = u32be(bytes, pos)
    const type = ascii(bytes, pos + 4, 4)
    if (type === 'acTL' && length >= 8 && pos + 16 <= bytes.length) {
      const numFrames = u32be(bytes, pos + 8)
      return numFrames > 1
    }
    if (type === 'IDAT' || type === 'IEND') return false
    const next = pos + 12 + length
    if (next <= pos) break
    pos = next
  }
  return false
}

const isAnimatedWebp = (bytes: Uint8Array): boolean => {
  if (bytes.length < 21) return false
  if (ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return false
  let pos = 12
  let anmfCount = 0
  while (pos + 8 <= bytes.length) {
    const fourcc = ascii(bytes, pos, 4)
    const size = u32le(bytes, pos + 4)
    const dataStart = pos + 8
    if (fourcc === 'VP8X' && dataStart < bytes.length) {
      if ((bytes[dataStart] & 0x02) !== 0) return true
    }
    else if (fourcc === 'ANIM') {
      return true
    }
    else if (fourcc === 'ANMF') {
      anmfCount += 1
      if (anmfCount >= 2) return true
    }
    const padded = size + (size & 1)
    const next = dataStart + padded
    if (next <= pos) break
    pos = next
  }
  return false
}

const readIsoBox = (bytes: Uint8Array, offset: number, end: number): { size: number; headerSize: number; type: string } | null => {
  if (offset + 8 > end) return null
  const size32 = u32be(bytes, offset)
  const type = ascii(bytes, offset + 4, 4)
  if (size32 === 0) return { size: end - offset, headerSize: 8, type }
  if (size32 === 1) {
    if (offset + 16 > end) return null
    const hi = u32be(bytes, offset + 8)
    const lo = u32be(bytes, offset + 12)
    const size = hi * 0x100000000 + lo
    if (size < 16) return null
    return { size, headerSize: 16, type }
  }
  if (size32 < 8) return null
  return { size: size32, headerSize: 8, type }
}

const moovHasMultipleSamples = (bytes: Uint8Array, start: number, end: number, depth = 0): boolean | null => {
  if (depth > 6) return null
  let offset = start
  while (offset + 8 <= end) {
    const box = readIsoBox(bytes, offset, end)
    if (!box) break
    const boxEnd = Math.min(end, offset + box.size)
    const content = offset + box.headerSize
    if (box.type === 'stsz' && content + 12 <= boxEnd) {
      const sampleCount = u32be(bytes, content + 8)
      if (sampleCount > 1) return true
      return false
    }
    if (box.type === 'stts' && content + 8 <= boxEnd) {
      const entryCount = u32be(bytes, content + 4)
      let total = 0
      for (let i = 0; i < entryCount && content + 8 + (i + 1) * 8 <= boxEnd; i++) {
        total += u32be(bytes, content + 8 + i * 8)
        if (total > 1) return true
      }
      if (entryCount > 0) return total > 1
    }
    if (box.type === 'trak' || box.type === 'mdia' || box.type === 'minf' || box.type === 'stbl') {
      const nested = moovHasMultipleSamples(bytes, content, boxEnd, depth + 1)
      if (nested !== null) return nested
    }
    if (boxEnd <= offset) break
    offset = boxEnd
  }
  return null
}

const isAnimatedAvif = (bytes: Uint8Array): boolean => {
  if (bytes.length < 16 || ascii(bytes, 4, 4) !== 'ftyp') return false
  const ftyp = readIsoBox(bytes, 0, bytes.length)
  if (!ftyp || ftyp.size < 16 || ftyp.size > bytes.length) return false
  const brands: string[] = []
  for (let i = 8; i + 4 <= ftyp.size; i += 4) {
    if (i === 12) continue
    brands.push(ascii(bytes, i, 4))
  }
  const hasAvifOrHeif = brands.some(b => b === 'avif' || b === 'avis' || b === 'mif1' || b === 'msf1')
  if (!hasAvifOrHeif) return false
  if (brands.includes('avis') || brands.includes('msf1')) return true

  let offset = ftyp.size
  while (offset + 8 <= bytes.length) {
    const box = readIsoBox(bytes, offset, bytes.length)
    if (!box) break
    const boxEnd = Math.min(bytes.length, offset + box.size)
    if (box.type === 'moov') {
      const multi = moovHasMultipleSamples(bytes, offset + box.headerSize, boxEnd)
      // If moov is truncated in a header slice, presence of moov in an AVIF container signals an image sequence.
      return multi !== false
    }
    if (boxEnd <= offset) break
    offset = boxEnd
  }
  return false
}

/**
 * Pure binary detector for multi-frame animated images (GIF, APNG, animated WebP, animated AVIF).
 * Returns the animated format when the payload has >1 frame, or `null` for static images.
 */
export const detectAnimatedImageBytes = (
  bytes: Uint8Array,
  mimeType?: string,
): AnimatedImageFormat | null => {
  if (!bytes || bytes.byteLength < 12) return null
  const mime = (mimeType || '').split(';')[0].trim().toLowerCase()
  if (mime && NON_ANIMATED_MIMES.has(mime)) return null
  if (isAnimatedGif(bytes)) return 'gif'
  if (isAnimatedWebp(bytes)) return 'webp'
  if (isAnimatedPng(bytes)) return 'apng'
  if (isAnimatedAvif(bytes)) return 'avif'
  return null
}

/** Fast heuristic for URLs/data-URIs used only for metadata hints (never trusted alone for playback). */
export const looksLikeAnimatedImageUrl = (src: string): boolean => {
  if (!src) return false
  if (/^data:image\/(?:gif|apng|avif)/i.test(src)) return true
  const path = src.split(/[?#]/, 1)[0].toLowerCase()
  return path.endsWith('.gif') || path.endsWith('.apng') || path.endsWith('.avif')
}

const cache = new Map<string, AnimatedImageAsset | null>()
const pending = new Map<string, Promise<AnimatedImageAsset | null>>()
const decoderSupportCache = new Map<string, Promise<boolean>>()

const findCached = (src: string): AnimatedImageAsset | null | undefined => {
  for (const key of bitmapSrcKeys(src)) {
    if (cache.has(key)) return cache.get(key)
  }
  return undefined
}

const disposeAsset = (asset: AnimatedImageAsset | null | undefined) => {
  if (asset?.ownsObjectUrl && asset.objectUrl) {
    URL.revokeObjectURL(asset.objectUrl)
  }
}

export const getCachedAnimatedImage = (src: string): AnimatedImageAsset | null | undefined => {
  if (!src) return null
  return findCached(src)
}

export const supportsImageDecoderForMime = (mimeType: string): Promise<boolean> => {
  const mime = mimeType.split(';')[0].trim().toLowerCase()
  if (!mime || typeof globalThis.ImageDecoder !== 'function') return Promise.resolve(false)
  const hit = decoderSupportCache.get(mime)
  if (hit) return hit
  const job = globalThis.ImageDecoder.isTypeSupported(mime).catch(() => false)
  decoderSupportCache.set(mime, job)
  return job
}

const readBytesForDetection = async (blob: Blob, mime: string): Promise<Uint8Array> => {
  // GIF image descriptors can live past 64 KB when frame 1 is large; read the full GIF blob.
  // PNG (`acTL` before `IDAT`), WebP (`VP8X`/`ANIM`), and AVIF (`ftyp`/`avis`) carry animation headers near the start.
  const mayNeedFullScan = mime === 'image/gif' || mime === '' || mime === 'application/octet-stream'
  if (mayNeedFullScan || blob.size <= HEADER_SLICE_BYTES) {
    return new Uint8Array(await blob.arrayBuffer())
  }
  const head = new Uint8Array(await blob.slice(0, HEADER_SLICE_BYTES).arrayBuffer())
  // If an empty-mime or mislabeled blob turned out to be GIF, scan the full buffer so frame 2 is never missed.
  if (head.length >= 6 && (ascii(head, 0, 6) === 'GIF87a' || ascii(head, 0, 6) === 'GIF89a')) {
    return new Uint8Array(await blob.arrayBuffer())
  }
  return head
}

export const probeAnimatedImage = (src: string): Promise<AnimatedImageAsset | null> => {
  if (!src) return Promise.resolve(null)
  const hit = findCached(src)
  if (hit !== undefined) return Promise.resolve(hit)
  const existing = pending.get(src)
  if (existing) return existing

  const job = (async (): Promise<AnimatedImageAsset | null> => {
    try {
      const blob = await loadImageBlob(src)
      if (!blob) return null
      const rawMime = (blob.type || '').split(';')[0].trim().toLowerCase()
      if (rawMime && NON_ANIMATED_MIMES.has(rawMime)) {
        cache.set(src, null)
        return null
      }

      const bytes = await readBytesForDetection(blob, rawMime)
      let format = detectAnimatedImageBytes(bytes, rawMime)

      // When AVIF `moov` sits after `mdat` (beyond the first 64 KB), check the tail or ImageDecoder.
      if (!format && (rawMime === 'image/avif' || (bytes.length >= 16 && ascii(bytes, 4, 4) === 'ftyp'))) {
        if (blob.size > HEADER_SLICE_BYTES && blob.size <= 16 * 1024 * 1024) {
          const fullBytes = new Uint8Array(await blob.arrayBuffer())
          format = detectAnimatedImageBytes(fullBytes, rawMime)
        }
      }

      if (!format) {
        cache.set(src, null)
        return null
      }

      const mimeType = FORMAT_MIME[format]
      const ownsObjectUrl = !isBlobUrl(src)
      const objectUrl = ownsObjectUrl ? URL.createObjectURL(blob) : src
      const asset: AnimatedImageAsset = { src, format, mimeType, blob, objectUrl, ownsObjectUrl }
      cache.set(src, asset)
      return asset
    }
    catch {
      return null
    }
    finally {
      pending.delete(src)
    }
  })()

  pending.set(src, job)
  return job
}

onImageBitmapEvict(retain => {
  for (const [src, asset] of [...cache.entries()]) {
    if (!retain.has(src)) {
      disposeAsset(asset)
      cache.delete(src)
    }
  }
})

onMediaInterned((from, to) => {
  if (!from || !to || from === to) return
  if (cache.has(from) && !cache.has(to)) {
    const entry = cache.get(from) ?? null
    cache.delete(from)
    if (entry) entry.src = to
    cache.set(to, entry)
  }
  const job = pending.get(from)
  if (job && !pending.has(to)) {
    pending.delete(from)
    pending.set(to, job)
  }
})

export const resetAnimatedImageCacheForTests = () => {
  for (const asset of cache.values()) disposeAsset(asset)
  cache.clear()
  pending.clear()
  decoderSupportCache.clear()
}
