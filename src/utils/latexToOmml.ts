/**
 * LaTeX → MathML (MathLive) → OMML (mathml2omml-plus) for native PowerPoint equations.
 * No hand-rolled math grammar — conversion is entirely library-based.
 */

import tinycolor from 'tinycolor2';
import { mml2omml } from 'mathml2omml-plus';
import { convertLatexToMathMlSync, ensureMathliveReady } from '@/utils/math';
const MATH_NS = 'http://www.w3.org/1998/Math/MathML';
function wrapMathMl(fragment: string): string {
  const trimmed = fragment.trim();
  if (!trimmed) throw new Error('empty MathML from MathLive');
  if (/^<math[\s/>]/i.test(trimmed)) return trimmed;
  return `<math xmlns="${MATH_NS}">${trimmed}</math>`;
}
function mathMlToOmml(mathmlFragment: string): string {
  const omml = mml2omml(wrapMathMl(mathmlFragment));
  if (!omml || !/<m:oMath[\s/>]/i.test(omml)) {
    throw new Error('mathml2omml produced no m:oMath');
  }
  return omml;
}
export interface OmmlRunStyle {
  /** CSS/hex color applied to every math glyph run and control (vinculum, …). */
  color?: string;
  /** Font size in points (`a:rPr sz` is hundredths of a point). */
  fontSizePt?: number;
}
const buildArPr = (style: OmmlRunStyle): string | null => {
  const parts: string[] = [];
  const attrs: string[] = ['dirty="0"'];
  if (style.fontSizePt && Number.isFinite(style.fontSizePt) && style.fontSizePt > 0) {
    attrs.push(`sz="${Math.round(style.fontSizePt * 100)}"`);
  }
  if (style.color) {
    const c = tinycolor(style.color);
    if (c.isValid()) {
      parts.push(`<a:solidFill><a:srgbClr val="${c.toHex().toUpperCase()}"/></a:solidFill>`);
    }
  }
  if (!parts.length && attrs.length === 1) return null;
  return `<a:rPr ${attrs.join(' ')}>${parts.join('')}</a:rPr>`;
};

/**
 * Stamp `a:rPr` (color / size) onto every `m:r` and `m:ctrlPr` in an OMML
 * fragment. pptxgenjs embeds OMML as opaque XML and does not propagate the
 * surrounding text-run `options.color`, so contrast-fixed (and user-styled)
 * equation colors must be written into the math markup itself.
 */
export function applyOmmlRunStyle(omml: string, style: OmmlRunStyle): string {
  const rPr = buildArPr(style);
  if (!rPr || !omml) return omml;
  const withRunPr = omml.replace(/<m:r(\s[^>]*)?>([\s\S]*?)<\/m:r>/g, (_full, attrs = '', body: string) => {
    const next = /<a:rPr[\s/>]/.test(body) ? body.replace(/<a:rPr\b[^>]*\/>|<a:rPr\b[\s\S]*?<\/a:rPr>/, rPr) : /<m:rPr\b[\s\S]*?<\/m:rPr>/.test(body) ? body.replace(/<\/m:rPr>/, `</m:rPr>${rPr}`) : `${rPr}${body}`;
    return `<m:r${attrs}>${next}</m:r>`;
  });

  return withRunPr.replace(/<m:ctrlPr(\s[^>]*)?\/>/g, `<m:ctrlPr$1>${rPr}</m:ctrlPr>`).replace(/<m:ctrlPr(\s[^>]*)?>([\s\S]*?)<\/m:ctrlPr>/g, (_full, attrs = '', body: string) => {
    const next = /<a:rPr[\s/>]/.test(body) ? body.replace(/<a:rPr\b[^>]*\/>|<a:rPr\b[\s\S]*?<\/a:rPr>/, rPr) : `${rPr}${body}`;
    return `<m:ctrlPr${attrs}>${next}</m:ctrlPr>`;
  });
}

/** Ensure MathLive is loaded so sync conversion can run during PPTX export. */
export async function prepareLatexToOmml(): Promise<void> {
  await ensureMathliveReady();
}

/**
 * Convert a LaTeX expression to an OMML `<m:oMath>…</m:oMath>` string.
 */
export async function latexToOmml(latex: string): Promise<string> {
  const source = latex.trim();
  if (!source) throw new Error('empty LaTeX');
  await prepareLatexToOmml();
  return mathMlToOmml(convertLatexToMathMlSync(source));
}

/**
 * Sync conversion — MathLive must already be loaded via {@link prepareLatexToOmml}.
 * Returns null when conversion fails (caller falls back to plain LaTeX text).
 */
export function tryLatexToOmmlSync(latex: string): string | null {
  const source = latex.trim();
  if (!source) return null;
  try {
    return mathMlToOmml(convertLatexToMathMlSync(source));
  } catch {
    return null;
  }
}
