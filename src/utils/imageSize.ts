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

export const readImageSize = (buffer: ArrayBuffer | Uint8Array): ImageSize | null => {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  return pngSize(bytes) || jpegSize(bytes) || gifSize(bytes) || webpSize(bytes)
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
