import tinycolor from 'tinycolor2'
import { TABLE_PAPER } from '@/configs/table'
import type pptxgen from 'pptxgenjs-plus'
import { markdownMathSegments } from '@/text'
import { applyOmmlRunStyle, stripXmlIllegalChars, tryLatexToOmmlSync, type OmmlRunStyle } from './latexToOmml'

/** Cells store plain text with TeX delimiters, unlike rich text elements.
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
