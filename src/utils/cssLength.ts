import { convertUnits, splitUnitValue } from '@karibash/pixel-units'

const LENGTH_SUFFIX_RE = /(px|cm|mm|q|in|pc|pt|rem|em|vw|vh|vmin|vmax)$/i

/** Compact a CSS length so pixel-units can split it (`13.5 pt` → `13.5pt`). */
export const compactCssLength = (raw: string) => {
  let value = raw.trim().replace(/\s+/g, '')
  if (value.startsWith('.')) value = `0${value}`
  return value.replace(LENGTH_SUFFIX_RE, (unit) => (
    unit.toLowerCase() === 'q' ? 'Q' : unit.toLowerCase()
  ))
}

/** Convert a CSS length to px. Unknown / keyword / % values return undefined. */
export const cssLengthToPx = (raw: string | null | undefined, basePx: number): number | undefined => {
  if (!raw) return undefined
  const compact = compactCssLength(raw)
  if (!compact) return undefined
  try {
    const { value, unitSuffix } = splitUnitValue(compact as `${number}px`)
    if (unitSuffix === 'px') return value > 0 ? value : undefined
    const px = parseFloat(convertUnits(compact as `${number}pt`, 'px', {
      em: `${basePx}px`,
      rem: `${basePx}px`,
    }))
    return Number.isFinite(px) && px > 0 ? px : undefined
  }
  catch {
    return undefined
  }
}

export const cssLengthParts = (raw: string | null | undefined, basePx: number): { px?: number; em?: number } => {
  if (!raw) return {}
  const compact = compactCssLength(raw)
  if (!compact) return {}
  try {
    const { value, unitSuffix } = splitUnitValue(compact as `${number}px`)
    if (unitSuffix === 'em') return { em: value }
  }
  catch {
    return {}
  }
  const px = cssLengthToPx(compact, basePx)
  return px == null ? {} : { px }
}
