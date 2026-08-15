import { CODE_LINE_HEIGHT, CODE_PAD_X, CODE_PAD_Y, type CodeEditorPayload } from '@/configs/code'
import { outlineRadiusToPptxRectRadius } from '@/utils/elementOutline'
import { highlightCodeTokens } from '@/utils/codeHighlight'

export type CodePptxRun = {
  text: string
  options: {
    color: string
    breakLine?: boolean
  }
}

export type CodePptxText = {
  runs: CodePptxRun[]
  bg: string
  fg: string
}

const CODE_CORNER_PX = 10
const CODE_FONT_FACE = 'Consolas'

export function hexForPptx(color: string): string {
  const raw = color.trim()
  const hex = raw.match(/#([0-9a-fA-F]{3,8})/)
  if (hex) {
    let h = hex[1]
    if (h.length === 3) h = h.split('').map(c => c + c).join('')
    return `#${h.slice(0, 6).toUpperCase()}`
  }
  const rgb = raw.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (rgb) {
    const to = (n: string) => Number(n).toString(16).padStart(2, '0').toUpperCase()
    return `#${to(rgb[1])}${to(rgb[2])}${to(rgb[3])}`
  }
  return '#E6EDF3'
}

export function mixHex(fg: string, bg: string, fgWeight: number): string {
  const parse = (color: string) => {
    const h = hexForPptx(color).slice(1)
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)] as const
  }
  const [fr, fgCh, fb] = parse(fg)
  const [br, bgCh, bb] = parse(bg)
  const mix = (a: number, b: number) => Math.round(a * fgWeight + b * (1 - fgWeight))
  const to = (n: number) => n.toString(16).padStart(2, '0').toUpperCase()
  return `#${to(mix(fr, br))}${to(mix(fgCh, bgCh))}${to(mix(fb, bb))}`
}

export async function codeElementToPptxText(el: Pick<CodeEditorPayload, 'code' | 'language' | 'theme' | 'showLineNumbers'>): Promise<CodePptxText> {
  const { lines, bg, fg } = await highlightCodeTokens(el.code, el.language, el.theme)
  const fgHex = hexForPptx(fg)
  const bgHex = hexForPptx(bg)
  const gutter = mixHex(fgHex, bgHex, 0.4)
  const width = String(Math.max(1, lines.length)).length
  const runs: CodePptxRun[] = []
  for (let i = 0; i < lines.length; i++) {
    if (el.showLineNumbers) {
      runs.push({
        text: `${String(i + 1).padStart(width, ' ')}  `,
        options: { color: gutter },
      })
    }
    const tokens = lines[i]
    if (!tokens.length) {
      runs.push({ text: ' ', options: { color: fgHex, breakLine: true } })
      continue
    }
    for (let t = 0; t < tokens.length; t++) {
      const token = tokens[t]
      runs.push({
        text: token.content || ' ',
        options: {
          color: hexForPptx(token.color || fgHex),
          ...(t === tokens.length - 1 ? { breakLine: true } : {}),
        },
      })
    }
  }
  return { runs, bg: bgHex, fg: fgHex }
}

export function codeElementPptxBox(
  el: { left: number; top: number; width: number; height: number; fontSize: number; rotate?: number },
  colors: Pick<CodePptxText, 'bg' | 'fg'>,
  ratioPx2Inch: number,
  ratioPx2Pt: number,
) {
  return {
    x: el.left / ratioPx2Inch,
    y: el.top / ratioPx2Inch,
    w: el.width / ratioPx2Inch,
    h: el.height / ratioPx2Inch,
    fontSize: el.fontSize / ratioPx2Pt,
    fontFace: CODE_FONT_FACE,
    color: colors.fg,
    fill: { color: colors.bg },
    valign: 'top' as const,
    align: 'left' as const,
    margin: [
      CODE_PAD_Y / ratioPx2Pt,
      CODE_PAD_X / ratioPx2Pt,
      CODE_PAD_Y / ratioPx2Pt,
      CODE_PAD_X / ratioPx2Pt,
    ] as [number, number, number, number],
    rectRadius: outlineRadiusToPptxRectRadius(CODE_CORNER_PX, el.width, el.height),
    lineSpacingMultiple: CODE_LINE_HEIGHT / 1.25,
    wrap: false,
    vertOverflow: 'clip' as const,
    horzOverflow: 'clip' as const,
    ...(el.rotate ? { rotate: el.rotate } : {}),
  }
}
