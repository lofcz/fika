import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const INK = [0x18, 0x18, 0x1b, 255]
const WHITE = [255, 255, 255, 255]

const crcTable = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  crcTable[n] = c >>> 0
}
const crc32 = (buf) => {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const t = Buffer.from(type)
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crc])
}
const encodePng = (width, height, rgba) => {
  const stride = width * 4 + 1
  const raw = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const roundedRect = (x, y, l, t, r, b, rad) => {
  if (x < l || x > r || y < t || y > b) return false
  const cx = x < l + rad ? l + rad : x > r - rad ? r - rad : x
  const cy = y < t + rad ? t + rad : y > b - rad ? b - rad : y
  if (cx === x || cy === y) return true
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= rad * rad
}
const ellipse = (x, y, cx, cy, rx, ry) => {
  const dx = (x - cx) / rx
  const dy = (y - cy) / ry
  return dx * dx + dy * dy <= 1
}
const strokeRightArc = (x, y, cx, cy, radius, halfWidth) => {
  const dx = x - cx
  const dy = y - cy
  const dist = Math.hypot(dx, dy)
  if (Math.abs(dist - radius) > halfWidth) return false
  return dx >= -halfWidth * 0.35
}

const sample = (x, y) => {
  if (!roundedRect(x, y, 0.4, 0.4, 63.6, 63.6, 18)) return [0, 0, 0, 0]
  if (roundedRect(x, y, 14.5, 17.5, 39, 46, 7.2)) {
    if (ellipse(x, y, 26.8, 23.6, 9.6, 3.05)) return INK
    return WHITE
  }
  if (strokeRightArc(x, y, 38.4, 33.2, 7.7, 2.3)) return WHITE
  return INK
}

const raster = (size) => {
  const rgba = Buffer.alloc(size * size * 4)
  const ss = 4
  const step = 64 / size
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = (px + (sx + 0.5) / ss) * step
          const y = (py + (sy + 0.5) / ss) * step
          const [sr, sg, sb, sa] = sample(x, y)
          r += sr
          g += sg
          b += sb
          a += sa
        }
      }
      const n = ss * ss
      const i = (py * size + px) * 4
      rgba[i] = Math.round(r / n)
      rgba[i + 1] = Math.round(g / n)
      rgba[i + 2] = Math.round(b / n)
      rgba[i + 3] = Math.round(a / n)
    }
  }
  return encodePng(size, size, rgba)
}

const encodeIco = (pngs) => {
  const count = pngs.length
  const header = Buffer.alloc(6 + 16 * count)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(count, 4)
  let offset = header.length
  pngs.forEach((png, i) => {
    const entry = 6 + i * 16
    const size = png.size >= 256 ? 0 : png.size
    header[entry] = size
    header[entry + 1] = size
    header[entry + 2] = 0
    header[entry + 3] = 0
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(png.bytes.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += png.bytes.length
  })
  return Buffer.concat([header, ...pngs.map((png) => png.bytes)])
}

const png32 = raster(32)
const png48 = raster(48)
const png180 = raster(180)
const png512 = raster(512)
writeFileSync(join(root, 'public', 'favicon-32.png'), png32)
writeFileSync(join(root, 'public', 'apple-touch-icon.png'), png180)
writeFileSync(join(root, 'public', 'logo.png'), png512)
writeFileSync(join(root, 'public', 'favicon.ico'), encodeIco([
  { size: 32, bytes: png32 },
  { size: 48, bytes: png48 },
]))
console.log('wrote public/favicon.ico, public/favicon-32.png, public/apple-touch-icon.png, public/logo.png')
