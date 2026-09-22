/** Flattened, multipage PDF export. Each JPEG preserves the canvas rendering. */
export interface MynaPdfPage {
  jpeg: Uint8Array
  pixelWidth: number
  pixelHeight: number
  /** PDF points (1/72 inch), independent of the raster resolution. */
  width: number
  height: number
}

export function createMynaPdf(pages: MynaPdfPage[]): Uint8Array {
  if (!pages.length) throw new Error('A PDF needs at least one page.')
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  const offsets: number[] = [0]
  let length = 0
  const append = (value: string | Uint8Array) => {
    const bytes = typeof value === 'string' ? encoder.encode(value) : value
    chunks.push(bytes); length += bytes.length
  }
  const object = (id: number, value: string, binary?: Uint8Array) => {
    offsets[id] = length
    append(`${id} 0 obj\n${value}`)
    if (binary) { append('\nstream\n'); append(binary); append('\nendstream') }
    append('\nendobj\n')
  }
  append('%PDF-1.4\n%'); append(new Uint8Array([0xe2, 0xe3, 0xcf, 0xd3])); append('\n')
  object(1, '<< /Type /Catalog /Pages 2 0 R >>')
  object(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>`)
  pages.forEach((page, index) => {
    if (![page.width, page.height, page.pixelWidth, page.pixelHeight].every(n => Number.isFinite(n) && n > 0) || page.jpeg[0] !== 0xff || page.jpeg[1] !== 0xd8) throw new Error('Invalid PDF page image or dimensions.')
    const id = 3 + index * 3
    const w = Number(page.width.toFixed(4)), h = Number(page.height.toFixed(4))
    const commands = encoder.encode(`q\n${w} 0 0 ${h} 0 0 cm\n/Im0 Do\nQ\n`)
    object(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`)
    object(id + 1, `<< /Type /XObject /Subtype /Image /Width ${page.pixelWidth} /Height ${page.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>`, page.jpeg)
    object(id + 2, `<< /Length ${commands.length} >>`, commands)
  })
  const xref = length
  append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`)
  for (const offset of offsets.slice(1)) append(`${String(offset).padStart(10, '0')} 00000 n \n`)
  append(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  const result = new Uint8Array(length)
  let cursor = 0
  for (const chunk of chunks) { result.set(chunk, cursor); cursor += chunk.length }
  return result
}
