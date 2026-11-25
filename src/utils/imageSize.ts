export type ImageSize = { width: number; height: number }

const u16 = (bytes: Uint8Array, offset: number, le = false) => (
  le ? bytes[offset] | (bytes[offset + 1] << 8) : (bytes[offset] << 8) | bytes[offset + 1]
)

const u32 = (bytes: Uint8Array, offset: number, le = false) => (
  le
    ? bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)
    : (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]
)

const pngSize = (bytes: Uint8Array): ImageSize | null => {
  if (bytes.length < 24) return null
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return null
  return { width: u32(bytes, 16) >>> 0, height: u32(bytes, 20) >>> 0 }
}

const gifSize = (bytes: Uint8Array): ImageSize | null => {
  if (bytes.length < 10) return null
  if (bytes[0] !== 0x47 || bytes[1] !== 0x49 || bytes[2] !== 0x46) return null
  return { width: u16(bytes, 6, true), height: u16(bytes, 8, true) }
}

const jpegSize = (bytes: Uint8Array): ImageSize | null => {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  let offset = 2
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = bytes[offset + 1]
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return { height: u16(bytes, offset + 5), width: u16(bytes, offset + 7) }
    }
    const length = u16(bytes, offset + 2)
    if (length < 2) break
    offset += 2 + length
  }
  return null
}

const webpSize = (bytes: Uint8Array): ImageSize | null => {
  if (bytes.length < 30) return null
  if (bytes[0] !== 0x52 || bytes[1] !== 0x49 || bytes[2] !== 0x46 || bytes[3] !== 0x46) return null
  if (bytes[8] !== 0x57 || bytes[9] !== 0x45 || bytes[10] !== 0x42 || bytes[11] !== 0x50) return null
  const tag = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15])
  if (tag === 'VP8X') {
    return {
      width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)),
      height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)),
    }
  }
  if (tag === 'VP8 ' && bytes.length >= 30) {
    return {
      width: u16(bytes, 26, true) & 0x3fff,
      height: u16(bytes, 28, true) & 0x3fff,
    }
  }
  if (tag === 'VP8L' && bytes.length >= 25) {
    const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24)
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
  }
  return null
}

const ascii4 = (bytes: Uint8Array, offset: number) => (
  String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3])
)

const readBoxSize = (bytes: Uint8Array, offset: number, end: number): { size: number; headerSize: number } | null => {
  if (offset + 8 > end) return null
  const size32 = u32(bytes, offset) >>> 0
  if (size32 === 0) return { size: end - offset, headerSize: 8 }
  if (size32 === 1) {
    if (offset + 16 > end) return null
    const hi = u32(bytes, offset + 8) >>> 0
    const lo = u32(bytes, offset + 12) >>> 0
    const size = hi * 0x100000000 + lo
    if (size < 16) return null
    return { size, headerSize: 16 }
  }
  if (size32 < 8) return null
  return { size: size32, headerSize: 8 }
}

const findAvifBoxSize = (bytes: Uint8Array, start: number, end: number, depth = 0): ImageSize | null => {
  if (depth > 8) return null
  let offset = start
  while (offset + 8 <= end) {
    const header = readBoxSize(bytes, offset, end)
    if (!header) break
    const boxEnd = Math.min(end, offset + header.size)
    const type = ascii4(bytes, offset + 4)
    const contentStart = offset + header.headerSize

    if (type === 'ispe' && contentStart + 12 <= boxEnd) {
      const width = u32(bytes, contentStart + 4) >>> 0
      const height = u32(bytes, contentStart + 8) >>> 0
      if (width > 0 && height > 0 && width < 1_000_000 && height < 1_000_000) {
        return { width, height }
      }
    }
    else if (type === 'av01' && contentStart + 28 <= boxEnd) {
      const width = u16(bytes, contentStart + 24)
      const height = u16(bytes, contentStart + 26)
      if (width > 0 && height > 0) return { width, height }
    }
    else if (type === 'meta' && contentStart + 4 <= boxEnd) {
      const nested = findAvifBoxSize(bytes, contentStart + 4, boxEnd, depth + 1)
      if (nested) return nested
    }
    else if (type === 'stsd' && contentStart + 8 <= boxEnd) {
      const nested = findAvifBoxSize(bytes, contentStart + 8, boxEnd, depth + 1)
      if (nested) return nested
    }
    else if (
      type === 'iprp' || type === 'ipco' || type === 'moov'
      || type === 'trak' || type === 'mdia' || type === 'minf' || type === 'stbl'
    ) {
      const nested = findAvifBoxSize(bytes, contentStart, boxEnd, depth + 1)
      if (nested) return nested
    }

    if (boxEnd <= offset) break
    offset = boxEnd
  }
  return null
}

const avifSize = (bytes: Uint8Array): ImageSize | null => {
  if (bytes.length < 16 || ascii4(bytes, 4) !== 'ftyp') return null
  const ftyp = readBoxSize(bytes, 0, bytes.length)
  if (!ftyp || ftyp.size < 16 || ftyp.size > bytes.length) return null
  let isAvif = false
  for (let i = 8; i + 4 <= ftyp.size; i += 4) {
    if (i === 12) continue
    const brand = ascii4(bytes, i)
    if (brand === 'avif' || brand === 'avis' || brand === 'mif1' || brand === 'msf1') {
      isAvif = true
      break
    }
  }
  if (!isAvif) return null
  return findAvifBoxSize(bytes, ftyp.size, bytes.length)
}

export const readImageSize = (buffer: ArrayBuffer | Uint8Array): ImageSize | null => {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  return pngSize(bytes) || jpegSize(bytes) || gifSize(bytes) || webpSize(bytes) || avifSize(bytes)
}

export const resizeToMaxEdge = (width: number, height: number, maxEdge: number) => {
  const edge = Math.max(width, height)
  if (edge <= maxEdge) return { width, height }
  const scale = maxEdge / edge
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}
