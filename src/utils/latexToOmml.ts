/**
 * LaTeX → MathML (MathLive) → OMML (mathml2omml-plus) for native PowerPoint equations.
 * No hand-rolled math grammar — conversion is entirely library-based.
 */

import tinycolor from 'tinycolor2';
import { mml2omml } from 'mathml2omml-plus';
import { parseXml } from '@rgrove/parse-xml';
import { convertLatexToMathMlSync, ensureMathliveReady } from '@/utils/math';
const MATH_NS = 'http://www.w3.org/1998/Math/MathML';

/**
 * Characters XML 1.0 forbids anywhere in a document: C0 controls other than
 * TAB / LF / CR, the non-characters U+FFFE / U+FFFF and unpaired surrogates.
 * Model-authored LaTeX occasionally carries one (a stray `\u0005` where
 * `\text` was meant); pptxgenjs rejects the run and the whole export fails.
 */
// oxlint-disable-next-line no-control-regex
const XML_ILLEGAL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** Drop every character that cannot appear in an XML 1.0 document. */
export function stripXmlIllegalChars(text: string): string {
  return text.replace(XML_ILLEGAL_CHARS, '');
}

/**
 * Well-formedness check mirroring the one pptxgenjs runs on `options.omml`
 * (strict XML 1.0 via `@rgrove/parse-xml` around a synthetic root). Returns
 * the first problem, or null when the fragment is safe to embed.
 */
export function validateOmmlFragment(omml: string): string | null {
  try {
    parseXml(`<x>${omml}</x>`);
    return null;
  } catch (error) {
    return (error as Error).message.split('\n')[0] || 'malformed XML';
  }
}
function wrapMathMl(fragment: string): string {
  const trimmed = fragment.trim();
  if (!trimmed) throw new Error('empty MathML from MathLive');
  if (/^<math[\s/>]/i.test(trimmed)) return trimmed;
  return `<math xmlns="${MATH_NS}">${trimmed}</math>`;
}
function mathMlToOmml(mathmlFragment: string): string {
  const omml = stripXmlIllegalChars(mml2omml(wrapMathMl(mathmlFragment)) || '');
  if (!omml || !/<m:oMath[\s/>]/i.test(omml)) {
    throw new Error('mathml2omml produced no m:oMath');
  }
  // pptxgenjs throws on malformed OMML and that would abort the whole export;
  // reject here so callers fall back to plain LaTeX text for this one run.
  const problem = validateOmmlFragment(omml);
  if (problem) throw new Error(`OMML is not well-formed XML: ${problem}`);
  return omml;
}

/** LaTeX as MathLive should see it: trimmed, with XML-illegal characters removed. */
function cleanLatexSource(latex: string): string {
  return stripXmlIllegalChars(latex).trim();
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
  const source = cleanLatexSource(latex);
  if (!source) throw new Error('empty LaTeX');
  await prepareLatexToOmml();
  return mathMlToOmml(convertLatexToMathMlSync(source));
}

/**
 * Sync conversion — MathLive must already be loaded via {@link prepareLatexToOmml}.
 * Returns null when conversion fails (caller falls back to plain LaTeX text).
 */
export function tryLatexToOmmlSync(latex: string): string | null {
  const source = cleanLatexSource(latex);
  if (!source) return null;
  try {
    return mathMlToOmml(convertLatexToMathMlSync(source));
  } catch {
    return null;
  }
}
