import { afterEach, describe, expect, it, rs } from '@rstest/core'
import { readFileSync } from 'node:fs'
import { woff2Decode } from 'woff-lib/woff2/decode'
import PptxGen from 'pptxgenjs-plus'
import { JSZip } from '@node-projects/jszip'
import { collectEmbeddedFonts, isEmbeddableFont, preparePptxFontFamilies } from '../src/utils/exportFonts'
import { recordPptxExport } from '../src/utils/pptxExportCommands'

const nativeFetch = globalThis.fetch
const nativeWorker = globalThis.Worker
class FontWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null
  terminate() {}
  async postMessage({ id, data }: { id: number; data: ArrayBuffer }) {
    const value = new Uint8Array(await woff2Decode(new Uint8Array(data))).buffer
    this.onmessage?.({ data: { id, value } })
  }
}
afterEach(() => { globalThis.fetch = nativeFetch; globalThis.Worker = nativeWorker })

// Read a BMP format-4 cmap from the actual embedded TrueType, not just the XML.
function glyphFor(ttf: Uint8Array, code: number): number {
  const view = new DataView(ttf.buffer, ttf.byteOffset, ttf.byteLength)
  let cmap = 0
  for (let i = 0; i < view.getUint16(4); i++) {
    const at = 12 + i * 16
    if (String.fromCharCode(...ttf.slice(at, at + 4)) === 'cmap') cmap = view.getUint32(at + 8)
  }
  if (!cmap) throw new Error('Missing cmap')
  for (let i = 0; i < view.getUint16(cmap + 2); i++) {
    const table = cmap + view.getUint32(cmap + 4 + i * 8 + 4)
    if (view.getUint16(table) !== 4) continue
    const count = view.getUint16(table + 6) / 2
    for (let j = 0; j < count; j++) {
      const end = view.getUint16(table + 14 + j * 2)
      const start = view.getUint16(table + 16 + count * 2 + j * 2)
      if (code < start || code > end) continue
      const delta = view.getInt16(table + 16 + count * 4 + j * 2)
      const rangeAt = table + 16 + count * 6 + j * 2
      const range = view.getUint16(rangeAt)
      if (!range) return (code + delta) & 65535
      const glyph = view.getUint16(rangeAt + range + (code - start) * 2)
      return glyph ? (glyph + delta) & 65535 : 0
    }
  }
  return 0
}

describe('portable presentation fonts', () => {
  it('finds inline-only fonts, tables, shapes, charts and theme defaults in recorded commands', () => {
    const { pptx, commands } = recordPptxExport()
    pptx.theme = { headFontFace: 'Montserrat', bodyFontFace: 'Inter' }
    const slide = pptx.addSlide()
    slide.addText([{ text: 'Příliš žluťoučký kůň', options: { fontFace: '"Open Sans", Arial, sans-serif' } }], { fontFace: 'Arial' })
    slide.addTable([[{ text: 'Řešení', options: { fontFace: 'Source Serif 4' } }]])
    slide.addShape(pptx.ShapeType.rect, { fontFace: 'Lato' } as any)
    expect(preparePptxFontFamilies(commands)).toEqual(['Montserrat', 'Inter', 'OpenSans', 'Arial', 'SourceSerif4', 'Lato'])
    expect(JSON.stringify(commands)).not.toContain('sans-serif')
    expect(isEmbeddableFont('Inter')).toBe(true)
    expect(isEmbeddableFont(' Open Sans ')).toBe(true)
    expect(isEmbeddableFont('Arial')).toBe(false)
  })

  it('embeds bundled fonts without consulting locally installed fonts and preserves Czech glyphs in the PPTX', async () => {
    globalThis.Worker = FontWorker as unknown as typeof Worker
    const fetchFont = rs.fn(async (url: string | URL | Request) => {
      const name = String(url).match(/(Inter|Montserrat)\.woff2/)?.[1]
      if (!name) throw new Error(`Unexpected font URL: ${url}`)
      return new Response(readFileSync(`src/assets/fonts/${name}.woff2`))
    })
    globalThis.fetch = fetchFont as typeof fetch
    const fonts = await collectEmbeddedFonts(['Inter', 'Montserrat', 'Inter', 'Arial'])
    expect(fonts.map(font => font.fontFace)).toEqual(['Inter', 'Montserrat'])
    expect(fetchFont).toHaveBeenCalledTimes(2)
    const deck = new PptxGen()
    const czech = 'Příliš žluťoučký kůň úpěl ďábelské ódy. ĚŠČŘŽÝÁÍÉŮÚŤĎŇ'
    deck.addSlide().addText(czech, { fontFace: 'Inter' })
    for (const font of fonts) await deck.addFont(font)
    const zip = await JSZip.loadAsync(await deck.write({ outputType: 'arraybuffer' }) as ArrayBuffer)
    expect(await zip.file('ppt/slides/slide1.xml')!.async('string')).toContain(czech)
    expect(await zip.file('ppt/presentation.xml')!.async('string')).toContain('embedTrueTypeFonts="true"')
    const parts = Object.keys(zip.files).filter(path => path.endsWith('.fntdata'))
    expect(parts).toHaveLength(2)
    for (const part of parts) {
      const eot = await zip.file(part)!.async('uint8array')
      const fontSize = new DataView(eot.buffer, eot.byteOffset, eot.byteLength).getUint32(4, true)
      const ttf = eot.slice(-fontSize)
      for (const char of czech) expect(glyphFor(ttf, char.charCodeAt(0))).toBeGreaterThan(0)
    }
  })

  it('rejects a failed bundled font download instead of silently exporting without it', async () => {
    globalThis.fetch = (async () => new Response('', { status: 404 })) as typeof fetch
    await expect(collectEmbeddedFonts(['Inter'])).rejects.toThrow('Could not embed presentation font inter')
  })
})
