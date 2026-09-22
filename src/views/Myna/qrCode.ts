import QRCode from 'qrcode'
import type { PPTImageElement } from '@/types/slides'
export type QrCodeOptions = NonNullable<PPTImageElement['qrCode']>
export const DEFAULT_QR: QrCodeOptions = { text: 'https://example.com', errorCorrection: 'M', foreground: '#202024', background: '#ffffff' }
function luminance(color: string) {
  const channels = color.slice(1).match(/../g)!.map(channel => parseInt(channel, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722
}
export function validateQrOptions(options: QrCodeOptions) {
  if (!options.text.trim() || new TextEncoder().encode(options.text).length > 2000) throw new Error('text')
  if (!['L', 'M', 'Q', 'H'].includes(options.errorCorrection)) throw new Error('text')
  if (!/^#[\da-f]{6}$/i.test(options.foreground) || !/^#[\da-f]{6}$/i.test(options.background)) throw new Error('contrast')
  const dark = luminance(options.foreground), light = luminance(options.background)
  // A light background, dark modules, and a four-module quiet zone support ordinary scanners.
  if (light <= dark || (light + .05) / (dark + .05) < 4.5) throw new Error('contrast')
}
/** Encoder owns all QR structure/error correction. SVG is only a vector rendering of its module matrix. */
export function qrSvg(options: QrCodeOptions): string {
  validateQrOptions(options)
  const { modules } = QRCode.create(options.text, { errorCorrectionLevel: options.errorCorrection })
  const size = modules.size + 8
  const paths: string[] = []
  for (let y = 0; y < modules.size; y++) for (let x = 0; x < modules.size; x++) {
    if (modules.get(y, x)) paths.push(`M${x + 4} ${y + 4}h1v1h-1z`)
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size * 8}" height="${size * 8}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><path fill="${options.background}" d="M0 0h${size}v${size}H0z"/><path fill="${options.foreground}" d="${paths.join('')}"/></svg>`
}
export const qrImageSrc = (options: QrCodeOptions) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg(options))}`
