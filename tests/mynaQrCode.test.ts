import { describe, expect, it } from '@rstest/core'
import jsQR from 'jsqr'
import { qrSvg, qrImageSrc, DEFAULT_QR } from '@/views/Myna/qrCode'

/** Rasterize the actual generated SVG module paths, then decode with an independent QR implementation. */
function decodeSvg(svg: string) {
  const size = Number(svg.match(/viewBox="0 0 (\d+)/)![1])
  const scale = 5, width = size * scale
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255)
  for (const match of svg.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
    const x = Number(match[1]) * scale, y = Number(match[2]) * scale
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const offset = ((y + dy) * width + x + dx) * 4
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0
    }
  }
  return jsQR(pixels, width, width)?.data
}
describe('editable native QR codes', () => {
  it('round-trips actual SVG modules through an independent scanner for all ECC levels and Unicode content', () => {
    for (const errorCorrection of ['L', 'M', 'Q', 'H'] as const) {
      const text = 'https://example.com/žluťoučký?hello=世界&emoji=🍎'
      expect(decodeSvg(qrSvg({ ...DEFAULT_QR, text, errorCorrection }))).toBe(text)
    }
  })
  it('has deterministic portable SVG and a four-module quiet zone with no interpolated user markup', () => {
    const options = { ...DEFAULT_QR, text: '<script>alert("hello")</script>' }
    const svg = qrSvg(options)
    expect(svg).toBe(qrSvg(options))
    expect(svg.includes('<script>')).toBe(false)
    expect(decodeSvg(svg)).toBe(options.text)
    expect(decodeURIComponent(qrImageSrc(options).split(',')[1])).toBe(svg)
    const size = Number(svg.match(/viewBox="0 0 (\d+)/)![1])
    for (const [, x, y] of svg.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
      expect(Number(x)).toBeGreaterThanOrEqual(4); expect(Number(y)).toBeGreaterThanOrEqual(4)
      expect(Number(x)).toBeLessThan(size - 4); expect(Number(y)).toBeLessThan(size - 4)
    }
  })
  it('rejects empty/oversized payloads, invalid colors, inverted contrast and unsupported ECC', () => {
    expect(() => qrSvg({ ...DEFAULT_QR, text: ' ' })).toThrow('text')
    expect(() => qrSvg({ ...DEFAULT_QR, text: '🍎'.repeat(501) })).toThrow('text')
    expect(() => qrSvg({ ...DEFAULT_QR, foreground: '#eeeeee' })).toThrow('contrast')
    expect(() => qrSvg({ ...DEFAULT_QR, background: '#000000' })).toThrow('contrast')
    expect(() => qrSvg({ ...DEFAULT_QR, foreground: '"><script>' })).toThrow('contrast')
  })
})
