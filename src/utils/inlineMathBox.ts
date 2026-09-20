/** Canonical class on typeset math wrappers. Kept here so text-fit can stay MathLive-free. */
export const MATH_CLASS = 'fika-math'

export function htmlHasFikaMath(html: string): boolean {
  return !!html && (html.includes(MATH_CLASS) || html.includes('data-latex'))
}

/** Readable stand-in when a math raster has not arrived yet. Never leave a blank chip. */
export function latexFallbackText(latex: string): string {
  return latex
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^{}]+)\}/g, '√($1)')
    .replace(/\\neq/g, '≠')
    .replace(/\\pm/g, '±')
    .replace(/\\times/g, '×')
    .replace(/\\cdot/g, '·')
    .replace(/\^2/g, '²')
    .replace(/\^3/g, '³')
    .replace(/_\{([^}]+)\}/g, '$1')
    .replace(/\\,/g, ' ')
    .replace(/[{}_\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Fallback box when MathLive is not loaded yet — wide enough to reserve wrap space. */
export function estimateInlineMathBox(latex: string, fontSize: number, display: boolean): {
  width: number
  height: number
} {
  const compact = latex.replace(/\\[a-zA-Z]+/g, 'x').replace(/[{}^_]/g, '')
  const tall = display || /\\frac|\\sqrt|\\dbinom|\\begin/.test(latex)
  return {
    width: Math.max(fontSize * 0.75, compact.length * fontSize * 0.42),
    height: fontSize * (tall ? 1.85 : 1.2),
  }
}

/**
 * Unstyled MathLive HTML collapses to a sliver (a few px wide, many em tall).
 * Stretching that box onto the canvas is what turns table snapshots into bars.
 */
export function isPlausibleInlineMathBox(
  box: { width: number; height: number },
  fontSize: number,
  estimate: { width: number; height: number },
): boolean {
  if (!(box.width > 0) || !(box.height > 0) || !(fontSize > 0)) return false
  if (box.width < fontSize * 0.35) return false
  if (box.height > fontSize * 4.5) return false
  if (box.width < estimate.width * 0.25) return false
  return true
}
