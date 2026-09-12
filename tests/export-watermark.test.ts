import { describe, expect, it } from '@rstest/core'
import JSZip from 'jszip'
import pptxgen from 'pptxgenjs-plus'
import {
  EXPORT_WATERMARK_MARKER,
  applyPptxExportWatermark,
  hasPptxExportWatermark,
  loadWatermarkImage,
  readWatermarkImage,
} from '../src/utils/pptxExportWatermark'

const PNG_1X1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

async function buildDeck(slideCount: number): Promise<Uint8Array> {
  const pptx = new pptxgen()
  for (let i = 0; i < slideCount; i++) {
    pptx.addSlide().addText(`Slide ${i + 1}`, { x: 1, y: 1, w: 4, h: 1 })
  }
  const out = await pptx.write({ outputType: 'nodebuffer' })
  return new Uint8Array(out as Uint8Array)
}

async function part(bytes: Uint8Array, path: string): Promise<string> {
  const zip = await JSZip.loadAsync(bytes)
  const file = zip.file(path)
  if (!file) throw new Error(`missing part ${path}`)
  return file.async('string')
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

describe('pptx export watermark', () => {
  it('reads PNG and JPEG dimensions from the header', async () => {
    const png = await loadWatermarkImage(PNG_1X1)
    expect(png.mime).toBe('image/png')
    expect(png.width).toBe(1)
    expect(png.height).toBe(1)

    // SOI + SOF0 declaring 300×61, no scan data needed for the header parser.
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x3d, 0x01, 0x2c, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    const parsed = readWatermarkImage(jpeg)
    expect(parsed.mime).toBe('image/jpeg')
    expect(parsed.width).toBe(300)
    expect(parsed.height).toBe(61)

    expect(() => readWatermarkImage(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))).toThrow()
  })

  it('stamps every slide and the master with a locked picture in the requested corner', async () => {
    const deck = await buildDeck(3)
    const image = await loadWatermarkImage(PNG_1X1)
    const stamped = await applyPptxExportWatermark(deck, { image: PNG_1X1, name: 'ScioBot', widthRatio: 0.1, marginRatio: 0.05 }, image)

    expect(await hasPptxExportWatermark(deck)).toBe(false)
    expect(await hasPptxExportWatermark(stamped)).toBe(true)

    // pptxgenjs default layout: 10in × 5.625in.
    const slideCx = 9144000
    const slideCy = 5143500
    const cx = Math.round(slideCx * 0.1)
    const margin = Math.round(slideCx * 0.05)
    const expectedX = slideCx - cx - margin
    const expectedY = slideCy - cx - margin

    for (const n of [1, 2, 3]) {
      const xml = await part(stamped, `ppt/slides/slide${n}.xml`)
      expect(count(xml, `descr="${EXPORT_WATERMARK_MARKER}"`)).toBe(1)
      expect(xml).toContain('name="ScioBot"')
      expect(xml).toContain('noSelect="1"')
      expect(xml).toContain('noMove="1"')
      expect(xml).toContain(`<a:off x="${expectedX}" y="${expectedY}"/><a:ext cx="${cx}" cy="${cx}"/>`)
      // Last shape in the tree so it renders over full-bleed content.
      expect(xml.lastIndexOf('<p:pic>')).toBeGreaterThan(xml.lastIndexOf('<p:sp>'))
      expect(xml.indexOf('</p:spTree>')).toBeGreaterThan(xml.lastIndexOf('</p:pic>'))

      const rels = await part(stamped, `ppt/slides/_rels/slide${n}.xml.rels`)
      expect(rels).toMatch(/Type="[^"]*\/relationships\/image" Target="\.\.\/media\/fika-watermark\.png"/)
      const relId = /<a:blip r:embed="(rId\d+)">/.exec(xml)?.[1]
      expect(relId).toBeTruthy()
      expect(rels).toContain(`Id="${relId}"`)
    }

    const master = await part(stamped, 'ppt/slideMasters/slideMaster1.xml')
    expect(count(master, `descr="${EXPORT_WATERMARK_MARKER}"`)).toBe(1)
    expect(master).toContain('<p:nvPr userDrawn="1"/>')
    const masterRels = await part(stamped, 'ppt/slideMasters/_rels/slideMaster1.xml.rels')
    expect(masterRels).toContain('Target="../media/fika-watermark.png"')

    const contentTypes = await part(stamped, '[Content_Types].xml')
    expect(contentTypes).toMatch(/<Default Extension="png"/i)
    const zip = await JSZip.loadAsync(stamped)
    expect(zip.file('ppt/media/fika-watermark.png')).toBeTruthy()
  })

  it('does not stack marks when a stamped package is stamped again', async () => {
    const deck = await buildDeck(1)
    const image = await loadWatermarkImage(PNG_1X1)
    const once = await applyPptxExportWatermark(deck, { image: PNG_1X1 }, image)
    const twice = await applyPptxExportWatermark(once, { image: PNG_1X1 }, image)
    expect(twice).toBe(once)
    const xml = await part(twice, 'ppt/slides/slide1.xml')
    expect(count(xml, `descr="${EXPORT_WATERMARK_MARKER}"`)).toBe(1)
  })

  it('honours corner and opacity options', async () => {
    const deck = await buildDeck(1)
    const image = await loadWatermarkImage(PNG_1X1)
    const stamped = await applyPptxExportWatermark(deck, { image: PNG_1X1, position: 'top-left', opacity: 0.5 }, image)
    const xml = await part(stamped, 'ppt/slides/slide1.xml')
    const margin = Math.round(9144000 * 0.02)
    expect(xml).toContain(`<a:off x="${margin}" y="${margin}"/>`)
    expect(xml).toContain('<a:alphaModFix amt="50000"/>')
  })
})
