import tinycolor from 'tinycolor2'
import { TABLE_PAPER } from '@/configs/table'
import type pptxgen from 'pptxgenjs-plus'
import { markdownMathSegments } from '@/text'
import { applyOmmlRunStyle, stripXmlIllegalChars, tryLatexToOmmlSync, type OmmlRunStyle } from './latexToOmml'
import type { TableCell } from '@/types/slides'
import { parseTableText } from './prosemirror/table'

/** Rich cells use the same document as editing, including atomic native equations. */
export function richTableCellExportText(cell: TableCell, fallback: OmmlRunStyle, ratioPx2Pt: number): pptxgen.TextProps[] {
  const doc = parseTableText(cell)
  const runs: pptxgen.TextProps[] = []
  doc.forEach((paragraph, _offset, index) => {
    if (index) {
      if (!runs.length) runs.push({ text: '' })
      runs[runs.length - 1].options = { ...runs[runs.length - 1].options, breakLine: true }
    }
    if (!paragraph.childCount) runs.push({ text: '' })
    paragraph.forEach(node => {
      const options: pptxgen.TextPropsOptions = { bold: false, italic: false, underline: { style: 'none' }, strike: false }
      if (paragraph.attrs.align) options.align = paragraph.attrs.align
      for (const mark of node.marks) {
        const attrs = mark.attrs
        switch (mark.type.name) {
          case 'strong': options.bold = true; break
          case 'em': options.italic = true; break
          case 'underline': options.underline = { style: 'sng' }; break
          case 'strikethrough': options.strike = 'sngStrike'; break
          case 'forecolor': options.color = tinycolor(attrs.color).toHex(); break
          case 'fontsize': options.fontSize = parseFloat(attrs.fontsize) * (/pt$/i.test(attrs.fontsize) ? 4 / 3 : 1) / ratioPx2Pt; break
          case 'fontname': options.fontFace = attrs.fontname; break
          case 'code': options.fontFace = 'Consolas'; break
          case 'superscript': options.superscript = true; break
          case 'subscript': options.subscript = true; break
          case 'link': options.hyperlink = { url: attrs.href }; break
        }
      }
      if (node.type.name === 'hard_break') { runs.push({ text: '', options: { ...options, breakLine: true } }); return }
      if (node.type.name === 'math') {
        const omml = tryLatexToOmmlSync(node.attrs.latex)
        if (omml) options.omml = applyOmmlRunStyle(omml, { color: typeof options.color === 'string' ? options.color : fallback.color, fontSizePt: options.fontSize || fallback.fontSizePt })
        runs.push({ text: omml ? '' : stripXmlIllegalChars(node.attrs.latex), options })
      }
      else runs.push({ text: stripXmlIllegalChars(node.text || ''), options })
    })
  })
  return runs
}

/** Legacy cells store plain text with TeX delimiters.
 * Use the display parser's source boundaries and keep equations as editable
 * OMML runs. Never interpret ordinary cell text as HTML or Markdown.
 * Call after prepareLatexToOmml, just like the other PPTX math exporters.
 */
export function tableCellExportText(text: string, style: OmmlRunStyle): string | pptxgen.TextProps[] {
  const segments = markdownMathSegments(text)
  if (!segments.some(segment => segment.type === 'math')) return stripXmlIllegalChars(text)
  return segments.flatMap((segment): pptxgen.TextProps[] => {
    if (segment.type === 'math') {
      const omml = tryLatexToOmmlSync(segment.value)
      if (omml) return [{ text: '', options: { omml: applyOmmlRunStyle(omml, style) } }]
    }
    const lines = stripXmlIllegalChars(segment.raw).split(/\r\n?|\n/)
    return lines.flatMap((line, index) => index < lines.length - 1
      ? [{ text: line, options: { breakLine: true } }]
      : line ? [{ text: line }] : [])
  })
}

/** PowerPoint cell alpha exposes the slide; themed tables paint over paper in the editor. */
export function tableCellExportFill(fill: { color: string; alpha: number }, themed: boolean) {
  return themed && fill.alpha < 1
    ? { color: tinycolor.mix(TABLE_PAPER, fill.color, fill.alpha * 100).toHexString() }
    : { color: fill.color, transparency: (1 - fill.alpha) * 100 }
}
