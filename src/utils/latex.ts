import type { PPTLatexElement } from '@/types/slides'

/**
 * Apply an editor save onto an existing formula.
 *
 * The canvas box (`width` / `height`) is the authored scale. Never replace it
 * with the newly measured natural size — `useLiveBoxFit` scales the new
 * formula into that box. `viewBox` stores the natural measure for export.
 */
export function latexPropsAfterEdit(
  _current: Pick<PPTLatexElement, 'width' | 'height'>,
  next: { latex: string; path?: string; w: number; h: number },
): Pick<PPTLatexElement, 'latex' | 'path' | 'viewBox'> {
  return {
    latex: next.latex,
    path: next.path ?? '',
    viewBox: [next.w, next.h],
  }
}

/** Same uniform scale `useLiveBoxFit` writes: authored box / natural viewBox. */
export function latexPaintScale(el: Pick<PPTLatexElement, 'width' | 'height' | 'viewBox'>): number {
  const [naturalW, naturalH] = el.viewBox || [0, 0]
  if (!(naturalW > 0) || !(naturalH > 0) || !(el.width > 0) || !(el.height > 0)) return 1
  return Math.min(el.width / naturalW, el.height / naturalH)
}

/**
 * Extract the contents of every equation (or equation*) environment.
 */
export const extractEquationLatex = (source: string) => {
  const equations: string[] = [];
  const equationPattern = /\\begin\s*\{\s*equation(\*)?\s*\}([\s\S]*?)\\end\s*\{\s*equation\1\s*\}/g;
  for (const match of source.matchAll(equationPattern)) {
    const latex = match[2].trim();
    if (latex) equations.push(latex);
  }
  return equations;
};

/**
 * MathLive emits compact TeX (`4^5\cdot3x`). hfmath's tokenizer treats digits
 * as part of a command name, so `\cdot3x` becomes one unknown token and is
 * drawn as literal text. TeX ends a control word before a digit; insert that
 * space here before handing the string to hfmath.
 */
export const toHfmathLatex = (latex: string) => {
  return latex.replace(/\\displaystyle\b/g, '').replace(/\\textstyle\b/g, '').replace(/\\([A-Za-z]+)(?=[0-9.])/g, '\\$1 ').trim();
};
