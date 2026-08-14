/** PowerPoint body lvl1 hanging indent: marL 18pt / 28pt type. */
export const PPTX_BODY_BULLET_INDENT_EM = 18 / 28;
export type PptxTextInset = {
  t: number;
  r: number;
  b: number;
  l: number;
};
export type ImportedParagraphMetrics = {
  lineHeight: number;
  margin: number | null;
};

/** CSS cascade: the last `prop:` in a style string wins. */
export function lastCssDeclaration(style: string, prop: string): string | null {
  const re = new RegExp(`${prop}\\s*:\\s*([^;]+)`, 'gi');
  let last: string | null = null;
  let match: RegExpExecArray | null;
  while ((match = re.exec(style)) !== null) last = match[1].trim();
  return last;
}
function maxFontSizePt(html: string, fallback = 18): number {
  const fontSizeRegex = /font-size\s*:\s*(\d+(?:\.\d+)?)\s*pt/gi;
  const fontSizes = [fallback];
  let match: RegExpExecArray | null;
  while ((match = fontSizeRegex.exec(html)) !== null) {
    const size = parseFloat(match[1]);
    if (size > 0) fontSizes.push(size);
  }
  return Math.max(...fontSizes);
}

/**
 * Read line-height / paragraph spacing from pptxtojson paragraph HTML.
 * Duplicate `line-height` declarations (default 1.2 then the real value) must
 * use the last one — otherwise imported boxes clip like the Odkazy slide.
 */
export function importedParagraphMetrics(html: string, ratio: number): ImportedParagraphMetrics {
  const tagRegex = /<(div|p)(?![a-z0-9])[^>]*>/gi;
  const lineHeights: number[] = [];
  const margins: number[] = [];
  let paragraphCount = 0;
  let paragraphIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(html)) !== null) {
    const fullTag = match[0];
    paragraphCount++;
    const styleMatch = fullTag.match(/\bstyle\s*=\s*(['"])(.*?)\1/i);
    const styleContent = styleMatch?.[2] || '';
    const marginTop = lastCssDeclaration(styleContent, 'margin-top');
    const marginBottom = lastCssDeclaration(styleContent, 'margin-bottom');
    const lineHeight = lastCssDeclaration(styleContent, 'line-height');
    const tagStartIndex = match.index;
    const tagName = match[1];
    let tagEndIndex = html.indexOf('</' + tagName + '>', tagStartIndex);
    if (tagEndIndex === -1) tagEndIndex = tagStartIndex + fullTag.length;
    const maxFontSize = maxFontSizePt(html.substring(tagStartIndex, tagEndIndex), 18);
    let lineHeightValue = 1;
    if (lineHeight) {
      if (lineHeight.includes('pt')) lineHeightValue = parseFloat(lineHeight) / maxFontSize;else lineHeightValue = parseFloat(lineHeight);
    }
    if (Number.isFinite(lineHeightValue) && lineHeightValue > 0) lineHeights.push(lineHeightValue);else lineHeights.push(1);
    const isFirstParagraph = paragraphIndex === 0;
    const isLastParagraph = match.index + fullTag.length >= html.lastIndexOf('</' + tagName + '>');
    const readMargin = (raw: string | null) => {
      if (!raw) return 0;
      if (raw.includes('pt')) return parseFloat(raw);
      if (raw.includes('em')) return parseFloat(raw) * maxFontSize;
      return 0;
    };
    if (marginTop && !isFirstParagraph) {
      const value = readMargin(marginTop);
      if (value > 0) margins.push(value);
    }
    if (marginBottom && !isLastParagraph) {
      const value = readMargin(marginBottom);
      if (value > 0) margins.push(value);
    }
    paragraphIndex++;
  }
  let lineHeight = 1;
  if (lineHeights.length) {
    lineHeight = +(lineHeights.reduce((sum, height) => sum + height, 0) / paragraphCount).toFixed(2);
  }
  let margin = 0;
  if (margins.length && paragraphCount > 1) {
    margin = margins.reduce((sum, item) => sum + item, 0) / (paragraphCount - 1);
  }
  return {
    lineHeight,
    margin: margin ? +(margin * ratio).toFixed(1) : null
  };
}

/** pptxtojson insets are pt; the editor paints px. */
export function scalePptxTextInset(inset: PptxTextInset | undefined, ratio: number): [number, number, number, number] | undefined {
  if (!inset) return undefined;
  return [inset.t * ratio, inset.r * ratio, inset.b * ratio, inset.l * ratio];
}

/**
 * Overflow-wrap:anywhere line count using a mean glyph width. URLs have no
 * spaces, so PowerPoint / CSS wrap them by character.
 */
export function estimateAnywhereWrapLines(text: string, innerWidth: number, fontSize: number, avgGlyphEm = 0.52): number {
  const charWidth = Math.max(1, fontSize * avgGlyphEm);
  const charsPerLine = Math.max(1, Math.floor(innerWidth / charWidth));
  const length = text.replace(/\s+/g, ' ').trim().length;
  if (!length) return 0;
  return Math.max(1, Math.ceil(length / charsPerLine));
}
export function estimateColumnHeight(linesPerBlock: number[], fontSize: number, lineHeight: number, blockSpace: number): number {
  const lines = linesPerBlock.reduce((sum, count) => sum + count, 0);
  return lines * fontSize * lineHeight + Math.max(0, linesPerBlock.length - 1) * blockSpace;
}
export function textFitsFixedBox(contentHeight: number, boxInnerHeight: number, epsilon = 1): boolean {
  return contentHeight <= boxInnerHeight + epsilon;
}
