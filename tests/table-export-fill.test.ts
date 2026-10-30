import { describe, expect, it } from '@rstest/core'
import PptxGen from 'pptxgenjs-plus'
import { JSZip } from '@node-projects/jszip'
import { tableCellExportFill } from '../src/utils/tableExport'
import { getTableThemeColors } from '../src/utils/element'

describe('table cell fills in PPTX', () => {
  it('preserves active table theme colors and explicit cell fills without a table-wide fill', async () => {
    const deck = new PptxGen()
    for (const themeColor of ['#14532d', '#7c3aed']) {
      const palette = getTableThemeColors(themeColor)
      const colors = [palette.header, palette.stripe, palette.stripeAlt, '#f97316']
      deck.addSlide().addTable([colors.map(color => ({
        text: color,
        options: { fill: tableCellExportFill({ color, alpha: 1 }, true) },
      }))], { x: 0, y: 0, w: 6, h: 1 })
    }
    const zip = await JSZip.loadAsync(await deck.write({ outputType: 'arraybuffer' }) as ArrayBuffer)
    for (const [index, themeColor] of ['14532D', '7C3AED'].entries()) {
      const xml = await zip.file(`ppt/slides/slide${index + 1}.xml`)!.async('string')
      const fills = [...xml.matchAll(/<a:tcPr[^>]*>[\s\S]*?<a:solidFill><a:srgbClr val="([A-Fa-f0-9]+)"/g)].map(match => match[1])
      expect(fills).toEqual([themeColor, 'F4F4F5', 'FAFAFA', 'F97316'])
    }
  })

  it('flattens translucent themed cells onto Fika paper, preserving unthemed alpha', async () => {
    const deck = new PptxGen()
    const slide = deck.addSlide()
    slide.background = { color: '123456' }
    for (const [index, themed] of [true, false].entries()) {
      slide.addTable([[{ text: 'half red', options: { fill: tableCellExportFill({ color: '#ff0000', alpha: 0.5 }, themed) } },
        { text: 'clear', options: { fill: tableCellExportFill({ color: '#000000', alpha: 0 }, themed) } },
        { text: 'opaque', options: { fill: tableCellExportFill({ color: '#2468ac', alpha: 1 }, themed) } }]],
      { x: 0, y: index, w: 6, h: 0.5 })
    }
    const zip = await JSZip.loadAsync(await deck.write({ outputType: 'arraybuffer' }) as ArrayBuffer)
    const xml = await zip.file('ppt/slides/slide1.xml')!.async('string')
    const tables = [...xml.matchAll(/<a:tbl>([\s\S]*?)<\/a:tbl>/g)].map(match => match[1])
    expect(tables).toHaveLength(2)
    expect(tables[0]).toContain('val="FD7D7D"')
    expect(tables[0]).toContain('val="FAFAFA"')
    expect(tables[0]).not.toContain('<a:alpha')
    expect(tables[0]).toContain('val="2468AC"')
    expect(tables[1]).toContain('val="FF0000"')
    expect(tables[1]).toContain('<a:alpha val="50000"')
    expect(tables[1]).toContain('<a:alpha val="0"')
  })
})
