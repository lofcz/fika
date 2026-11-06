import { beforeAll, describe, expect, it, rs } from '@rstest/core'
import JSZip from 'jszip'
import pptxgen from 'pptxgenjs-plus'
import { convertLatexToMathMl } from 'mathlive'
import { prepareLatexToOmml } from '../src/utils/latexToOmml'
import { tableCellExportText } from '../src/utils/tableExport'

// Use the real converter without the browser-only stylesheet/keyboard loader.
rs.mock('@/utils/math', () => ({
  ensureMathliveReady: async () => {},
  convertLatexToMathMlSync: (latex: string) => convertLatexToMathMl(latex),
}))
beforeAll(() => prepareLatexToOmml())

describe('editable equations in exported tables', () => {
  it('exports mixed prose, powers, subscripts and fractions without losing following text', async () => {
    const pptx = new pptxgen()
    const cells = [
      String.raw`Obvod \(O\) a obsah \(S\)`,
      String.raw`\(a^2\)`,
      String.raw`\(a \cdot v_a = \frac{e \cdot f}{2}\)`,
      'Výška $v_a$ je výška na stranu $a$; e a f sú uhlopriečky.',
      'Prvý riadok\n\\[90^\\circ\\]\nPosledný riadok',
    ]
    pptx.addSlide().addTable(cells.map(text => [{
      text: tableCellExportText(text, { color: '#2B3445', fontSizePt: 18 }),
      options: { fontFace: 'Calibri', fontSize: 18, color: '2B3445' },
    }]), { x: 0.5, y: 0.5, w: 8, h: 4 })
    const zip = await JSZip.loadAsync(await pptx.write({ outputType: 'nodebuffer' }))
    const xml = await zip.file('ppt/slides/slide1.xml')!.async('string')
    const table = xml.match(/<a:tbl>[\s\S]*?<\/a:tbl>/)![0]
    expect(table.match(/<m:oMath[ >]/g)).toHaveLength(7)
    expect(table).toContain('<m:f>')
    expect(table).toContain('<m:sSub>')
    expect(table).toContain('<m:sSup>')
    expect(table).toContain('sz="1800"')
    expect(table).toContain('val="2B3445"')
    for (const text of ['Obvod ', ' a obsah ', ' je výška na stranu ', '; e a f sú uhlopriečky.', 'Prvý riadok', 'Posledný riadok']) {
      expect(table).toContain(`<a:t>${text}</a:t>`)
    }
    expect(table).not.toContain('\\(')
    expect(table).not.toContain('\\frac')
    expect(table).not.toContain('$v_a$')
  })

  it('preserves plain cell text, explicit newlines, escaped dollars and code literally', () => {
    for (const text of ['', '<b>A & B</b>', 'Prvý\r\nDruhý', String.raw`Cena \$5`, '`$x^2$`', '**Názov**']) {
      expect(tableCellExportText(text, {})).toBe(text)
    }
  })
})
