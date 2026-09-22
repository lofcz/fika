import type { FikaExportWatermark } from '@/configs/exportWatermark'
import { loadWatermarkImage, watermarkSurfaceFromHex } from '@/utils/pptxExportWatermark'
export async function watermarkSvg(svg: string, width: number, height: number, watermark: FikaExportWatermark, background: string): Promise<Blob> {
  const dark = watermarkSurfaceFromHex(background) === 'dark'
  const mark = await loadWatermarkImage(dark && watermark.imageOnDark ? watermark.imageOnDark : watermark.image)
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result)); reader.onerror = reject
    reader.readAsDataURL(new Blob([new Uint8Array(mark.bytes)], { type: mark.mime }))
  })
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  if (doc.querySelector('parsererror')) throw new Error('Invalid SVG')
  const root = doc.documentElement
  const viewBox = root.getAttribute('viewBox')?.split(/[\s,]+/).map(Number)
  const x0 = viewBox?.[0] || 0, y0 = viewBox?.[1] || 0
  const w = width * (watermark.widthRatio ?? .12), h = w * mark.height / mark.width
  const margin = width * (watermark.marginRatio ?? .02), position = watermark.position ?? 'bottom-right'
  const image = doc.createElementNS('http://www.w3.org/2000/svg', 'image')
  image.setAttribute('href', data)
  image.setAttribute('x', String(x0 + (position.endsWith('left') ? margin : width - margin - w)))
  image.setAttribute('y', String(y0 + (position.startsWith('top') ? margin : height - margin - h)))
  image.setAttribute('width', String(w)); image.setAttribute('height', String(h)); image.setAttribute('opacity', String(watermark.opacity ?? 1))
  root.appendChild(image)
  return new Blob([new XMLSerializer().serializeToString(doc)], { type: 'image/svg+xml' })
}
