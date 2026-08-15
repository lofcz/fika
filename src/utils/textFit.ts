/**
 * Shared text-fitting primitives built on `@chenglou/pretext`.
 *
 * Given a fixed-size text box, find the largest uniform font factor at which
 * the content still fits — by measuring wrapped line count with pretext, then
 * painting that factor as *actual font sizes* (Excel shrink-to-fit). Never a
 * CSS zoom of the authored layout: zoom keeps the original wraps and scales
 * paragraph gaps, which leaves a large empty region under the last line.
 *
 * pretext uses canvas, so this only does real work in a DOM/canvas runtime;
 * callers wrap usage so a non-DOM context falls back gracefully.
 */
import { layout as pretextLayout, prepare as pretextPrepare } from '@chenglou/pretext';

/** ProseMirror's default text size (assets/styles/prosemirror.scss). */
export const DEFAULT_TEXT_FONT_SIZE = 16;
/** Matches `ul, ol { padding-inline-start: 1em }` when the list has no inline pad. */
export const DEFAULT_LIST_PADDING_EM = 1;
/** Matches `li { padding-inline-start: 0.4em }` (marker-to-text gap). */
export const LIST_MARKER_GAP_EM = 0.4;
/**
 * @deprecated Prefer per-block `listIndentPx` from the imported list padding.
 * Kept as a fallback indent (px) when a list item has no padding of its own.
 */
export const BULLET_INDENT = 40;

/** A single measurable text block (one paragraph or one list item). */
export interface TextFitBlock {
  /** Plain text of the block (markers stripped). */
  text: string;
  /** Authored font size in px (its largest run, to stay safe). */
  size: number;
  bold?: boolean;
  italic?: boolean;
  fontFamily: string;
  /** When true, a list marker indent is subtracted from the text column. */
  listItem?: boolean;
  /** `ul`/`ol` padding-inline-start in px, when authored as px. */
  listIndentPx?: number;
  /** `ul`/`ol` padding-inline-start in em, when authored as em. */
  listIndentEm?: number;
}
export interface MeasureBlocksOptions {
  /** Box content width in px (insets already removed). */
  innerWidth: number;
  /** Line height multiplier (e.g. 1.5). */
  lineHeight: number;
  /**
   * Vertical gap between consecutive blocks, in px. CSS `--paragraphSpace` is
   * a fixed px value on the box — it does **not** shrink with the font (Excel
   * cell padding / our fittedContent paint). Do not scale this with sizeScale.
   */
  blockSpace?: number;
  /** Fallback list gutter in px when a list item has no `listIndentPx`/`Em`. */
  bulletIndent?: number;
  letterSpacing?: number;
  /** Multiply every block's font size by this factor before measuring (default 1). */
  sizeScale?: number;
}
function roundTo(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Extra inner-height reserved so overflow:hidden does not clip glyph ink that
 *  sits outside the CSS line box (PowerPoint lnSpcReduction / line-height < 1).
 *  Sized from the font, not a fixed slab — large pads look like over-shrink. */
export function fitClipPadding(maxFontSize: number, lineHeight: number): number {
  const tight = Math.max(0, 1.2 - lineHeight);
  return Math.max(3, Math.ceil(Math.max(0, maxFontSize) * Math.max(tight, 0.08) * 0.55));
}
export const MIN_FIT_SCALE = 0.2;

/**
 * Excel-style shrink-to-fit from a *real* laid-out height: the largest scale
 * `<= 1` at which `contentHeight * scale <= innerHeight`. Never grows past 100%.
 * When content already fits, returns 1 (empty space in a tall box is authored).
 */
export function fitScaleFromContentHeight(contentHeight: number, innerHeight: number, options?: {
  minScale?: number;
}): number {
  const minScale = options?.minScale ?? MIN_FIT_SCALE;
  if (!(contentHeight > 0) || !(innerHeight > 0)) return 1;
  if (contentHeight <= innerHeight) return 1;
  return Math.round(Math.max(minScale, innerHeight / contentHeight) * 10000) / 10000;
}

/**
 * Natural (unzoomed) scroll height of a text-fit host. Forces zoom to 1 for
 * one synchronous layout read (no clone — cloning a focused ProseMirror can
 * under-measure and snap the scale back to 100% on click). Width is locked to
 * the box inner width because Chrome `zoom` shrinks `clientWidth`.
 */
/**
 * Content-box size of the clipped text frame (padding already removed).
 * Prefers the live DOM box so shrink-to-fit tracks applyLiveSize / resize
 * instead of the last committed store width/height.
 */
export function innerBoxFromContentElement(
  box: HTMLElement | null | undefined,
  fallback: { innerWidth: number; innerHeight: number },
): { innerWidth: number; innerHeight: number } {
  if (!box) return fallback
  const style = getComputedStyle(box)
  const innerWidth = box.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
  const innerHeight = box.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
  if (!(innerWidth > 1) || !(innerHeight > 1)) return fallback
  return { innerWidth, innerHeight }
}

const parseStylePx = (value: string | undefined): number => {
  if (!value) return 0
  const n = parseFloat(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * Inner box from applyLiveSize inline styles + authored inset.
 * No getComputedStyle / clientWidth — safe on the resize hot path.
 */
export function innerBoxFromLiveStyles(
  box: HTMLElement | null | undefined,
  el: { width: number; height: number; inset?: [number, number, number, number] },
): { innerWidth: number; innerHeight: number } {
  const inset = el.inset || [10, 10, 10, 10]
  const width = parseStylePx(box?.style.width) || el.width
  const height = parseStylePx(box?.style.height) || el.height
  return {
    innerWidth: Math.max(1, width - inset[1] - inset[3]),
    innerHeight: Math.max(1, height - inset[0] - inset[2]),
  }
}

export function contentBoxOfHost(host: HTMLElement | null | undefined): HTMLElement | null {
  if (!host) return null
  return (host.closest('[data-live-box]') as HTMLElement | null) ?? host.parentElement
}

export function measureUnzoomedScrollHeight(host: HTMLElement, innerWidth: number): number {
  const content = host.querySelector('.ProseMirror, .ProseMirror-static, .prosemirror-editor') as HTMLElement | null;
  const target = content || host;
  const prevZoom = host.style.zoom;
  const prevWidth = host.style.width;
  host.style.zoom = '1';
  host.style.width = `${Math.max(1, innerWidth)}px`;
  const height = Math.max(target.scrollHeight, target.offsetHeight);
  host.style.zoom = prevZoom;
  host.style.width = prevWidth;
  return height;
}
function quoteFontFamily(family: string): string {
  const trimmed = family.trim();
  if (!trimmed) return 'sans-serif';
  if (trimmed.includes(',')) return trimmed;
  const unquoted = trimmed.replace(/^['"]+|['"]+$/g, '');
  if (/^[a-zA-Z0-9-]+$/.test(unquoted)) return unquoted;
  return `"${unquoted.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
function canvasFont(block: TextFitBlock, size: number): string {
  const style = block.italic ? 'italic' : 'normal';
  const weight = block.bold ? '700' : '400';
  return `${style} ${weight} ${size}px ${quoteFontFamily(block.fontFamily)}`;
}
function listColumnInset(block: TextFitBlock, size: number, fallbackIndent?: number): number {
  if (!block.listItem) return 0;
  const gutter = block.listIndentPx != null ? block.listIndentPx : block.listIndentEm != null ? block.listIndentEm * size : fallbackIndent ?? DEFAULT_LIST_PADDING_EM * size;
  return gutter + LIST_MARKER_GAP_EM * size;
}

/**
 * Total wrapped height (px) of `blocks` laid out in a column of `innerWidth`,
 * with each block's font size multiplied by `sizeScale`. Each block is measured
 * independently with pretext, then summed with the (unscaled, px-fixed)
 * inter-block gap. Returns 0 for an empty input.
 */
export function measureTextBlocksHeight(blocks: TextFitBlock[], options: MeasureBlocksOptions): number {
  if (!blocks.length) return 0;
  const sizeScale = options.sizeScale ?? 1;
  const prepareOptions = options.letterSpacing ? {
    letterSpacing: options.letterSpacing
  } : undefined;
  const preparedByFont = new Map<string, ReturnType<typeof pretextPrepare>>();
  let total = 0;
  for (const block of blocks) {
    const size = block.size * sizeScale;
    if (size <= 0) continue;
    const lineHeightPx = size * options.lineHeight;
    const font = canvasFont(block, size);
    const width = Math.max(1, options.innerWidth - listColumnInset(block, size, options.bulletIndent));
    const cacheKey = `${block.text}\0${font}\0${options.letterSpacing ?? 0}`;
    let prepared = preparedByFont.get(cacheKey);
    if (!prepared) {
      prepared = pretextPrepare(block.text, font, prepareOptions);
      preparedByFont.set(cacheKey, prepared);
    }
    total += pretextLayout(prepared, width, lineHeightPx).height;
  }
  total += Math.max(0, blocks.length - 1) * (options.blockSpace ?? 0);
  return total;
}
export interface FitFontScaleOptions {
  innerWidth: number;
  innerHeight: number;
  lineHeight: number;
  blockSpace?: number;
  bulletIndent?: number;
  letterSpacing?: number;
  /** Smallest font factor to fall back to before clipping takes over (default 0.1). */
  minScale?: number;
}
function measureAt(blocks: TextFitBlock[], options: FitFontScaleOptions, sizeScale: number): number {
  return measureTextBlocksHeight(blocks, {
    innerWidth: options.innerWidth,
    lineHeight: options.lineHeight,
    blockSpace: options.blockSpace,
    bulletIndent: options.bulletIndent,
    letterSpacing: options.letterSpacing,
    sizeScale
  });
}

/**
 * Largest uniform font factor in `[minScale, 1]` at which `blocks` fit
 * `innerHeight`, found by binary search over pretext measurements. The factor
 * multiplies the authored font sizes; because wrapping changes as the type
 * shrinks, this re-measures at each candidate (not a single geometric divide).
 * Returns 1 when content already fits (or measurement isn't possible).
 */
export function fitFontScaleForBlocks(blocks: TextFitBlock[], options: FitFontScaleOptions): number {
  const minScale = options.minScale ?? 0.1;
  if (!blocks.length || options.innerWidth <= 2 || options.innerHeight <= 2) return 1;
  try {
    const fits = (sizeScale: number) => measureAt(blocks, options, sizeScale) <= options.innerHeight;
    if (fits(1)) return 1;
    let lo = minScale;
    let hi = 1;
    let best = minScale;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) {
        best = mid;
        lo = mid;
      } else hi = mid;
    }
    return best;
  } catch {
    return 1;
  }
}

/**
 * Uniform zoom factor `innerHeight / height(authored)` — wrapping stays at the
 * authored size. Only for the live editor (authored HTML + CSS zoom). Fitted
 * static/thumbnail paint must use {@link fitFontScaleForBlocks} instead.
 */
export function fitZoomScaleForBlocks(blocks: TextFitBlock[], options: FitFontScaleOptions): number {
  const minScale = options.minScale ?? 0.1;
  if (!blocks.length || options.innerWidth <= 2 || options.innerHeight <= 2) return 1;
  try {
    const height = measureAt(blocks, options, 1);
    if (height <= options.innerHeight) return 1;
    return Math.max(minScale, Math.min(1, options.innerHeight / height));
  } catch {
    return 1;
  }
}

export type FitMeasureSession = {
  key: string
  lineHeight: number
  maxFont: number
  items: Array<{
    block: TextFitBlock
    size: number
    handle: ReturnType<typeof pretextPrepare>
  }>
}

export function fitSessionKey(
  html: string,
  fontFamily: string,
  lineHeight: number,
  letterSpacing: number,
  locale: string,
  defaultSize = DEFAULT_TEXT_FONT_SIZE,
): string {
  return `${locale}\0${fontFamily}\0${lineHeight}\0${letterSpacing}\0${defaultSize}\0${html}`
}

/**
 * One-time pretext `prepare()` for authored font sizes. Resize then only
 * calls `layout()` with the new width (no canvas, no DOM, no re-prepare).
 */
export function createFitMeasureSession(
  html: string,
  options: {
    key: string
    defaultFontFamily: string
    lineHeight: number
    letterSpacing?: number
    /** Painted size for runs with no inline `font-size` (placeholder body is 20, not 16). */
    defaultSize?: number
  },
): FitMeasureSession | null {
  const defaultSize = options.defaultSize ?? DEFAULT_TEXT_FONT_SIZE
  const { blocks } = extractFitBlocksFromHtml(html, {
    defaultFontFamily: options.defaultFontFamily,
    defaultSize,
  })
  const maxFont = blocks.reduce((max, block) => Math.max(max, block.size), defaultSize)
  if (!blocks.length) {
    return { key: options.key, lineHeight: options.lineHeight, maxFont, items: [] }
  }
  try {
    const prepareOptions = options.letterSpacing ? { letterSpacing: options.letterSpacing } : undefined
    return {
      key: options.key,
      lineHeight: options.lineHeight,
      maxFont,
      items: blocks.map(block => ({
        block,
        size: block.size,
        handle: pretextPrepare(block.text, canvasFont(block, block.size), prepareOptions),
      })),
    }
  }
  catch {
    return null
  }
}

/** Resize hot path: pure `layout()` over cached prepare handles. */
export function measureSessionHeight(
  session: FitMeasureSession,
  innerWidth: number,
  blockSpace = 0,
  bulletIndent?: number,
): number {
  if (!session.items.length) return 0
  let total = 0
  for (const item of session.items) {
    const lineHeightPx = item.size * session.lineHeight
    const width = Math.max(1, innerWidth - listColumnInset(item.block, item.size, bulletIndent))
    total += pretextLayout(item.handle, width, lineHeightPx).height
  }
  total += Math.max(0, session.items.length - 1) * blockSpace
  return total
}

export function fitZoomScaleFromSession(
  session: FitMeasureSession,
  innerWidth: number,
  innerHeight: number,
  blockSpace = 0,
): number {
  const pad = fitClipPadding(session.maxFont, session.lineHeight)
  const height = measureSessionHeight(session, innerWidth, blockSpace)
  return fitScaleFromContentHeight(height, Math.max(1, innerHeight - pad))
}

const DEFAULT_FIT_FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'

/**
 * One-shot locked-box scale for a rich-text HTML string. Editor resize keeps a
 * cached session; preview/export call this so they shrink with the same math.
 */
export function textFitScaleForHtml(
  html: string,
  options: {
    innerWidth: number
    innerHeight: number
    defaultFontFamily?: string
    defaultSize?: number
    lineHeight: number
    letterSpacing?: number
    blockSpace?: number
    locale?: string
  },
): number {
  if (!html || options.innerWidth <= 2 || options.innerHeight <= 2) return 1
  const fontFamily = options.defaultFontFamily || DEFAULT_FIT_FONT_FAMILY
  const defaultSize = options.defaultSize ?? DEFAULT_TEXT_FONT_SIZE
  const letterSpacing = options.letterSpacing || 0
  const key = fitSessionKey(
    html,
    fontFamily,
    options.lineHeight,
    letterSpacing,
    options.locale || 'en',
    defaultSize,
  )
  const session = createFitMeasureSession(html, {
    key,
    defaultFontFamily: fontFamily,
    defaultSize,
    lineHeight: options.lineHeight,
    letterSpacing: letterSpacing || undefined,
  })
  if (!session?.items.length) return 1
  return fitZoomScaleFromSession(
    session,
    options.innerWidth,
    options.innerHeight,
    options.blockSpace ?? 0,
  )
}
const FONT_SIZE_RE = /(\d+(?:\.\d+)?)\s*(px|pt|em)?/i;
function parseFontSizePx(value: string | null | undefined): number {
  if (!value) return 0;
  const match = FONT_SIZE_RE.exec(value);
  if (!match) return 0;
  const n = parseFloat(match[1]);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const unit = (match[2] || 'px').toLowerCase();
  if (unit === 'pt') return n * (96 / 72);
  if (unit === 'em') return n * DEFAULT_TEXT_FONT_SIZE;
  return n;
}

/** Largest inline px font size declared on `block` or any descendant. */
function blockFontSize(block: Element, defaultSize: number): number {
  let max = parseFontSizePx((block as HTMLElement).style?.fontSize);
  block.querySelectorAll<HTMLElement>('[style]').forEach(el => {
    const size = parseFontSizePx(el.style.fontSize);
    if (size > max) max = size;
  });
  return max || defaultSize;
}

function usableFamily(family: string | undefined | null): string | null {
  if (!family) return null;
  const trimmed = family.trim();
  if (!trimmed || trimmed === 'inherit' || trimmed === 'initial' || trimmed === 'unset') return null;
  return trimmed;
}

/** First usable inline font-family declared on `block` or a descendant, else default. */
function blockFontFamily(block: Element, defaultFamily: string): string {
  const own = usableFamily((block as HTMLElement).style?.fontFamily);
  if (own) return own;
  const withFamily = block.querySelector<HTMLElement>('[style*="font-family"]');
  return usableFamily(withFamily?.style.fontFamily) || defaultFamily;
}
function cssLength(value: string | undefined | null): {
  px?: number;
  em?: number;
} {
  if (!value) return {};
  const trimmed = value.trim();
  const px = /^(-?[\d.]+)px$/i.exec(trimmed);
  if (px) return {
    px: parseFloat(px[1])
  };
  const em = /^(-?[\d.]+)em$/i.exec(trimmed);
  if (em) return {
    em: parseFloat(em[1])
  };
  return {};
}
function listIndentFrom(el: Element): Pick<TextFitBlock, 'listIndentPx' | 'listIndentEm'> {
  if (el.tagName !== 'LI') return {};
  const list = el.closest('ul, ol') as HTMLElement | null;
  if (!list) return {};
  const pad = cssLength(list.style.paddingInlineStart || list.style.paddingLeft);
  if (pad.px != null && pad.px > 0) return {
    listIndentPx: pad.px
  };
  if (pad.em != null && pad.em > 0) return {
    listIndentEm: pad.em
  };
  return {};
}
export interface ExtractedContent {
  blocks: TextFitBlock[];
}
export interface ExtractOptions {
  defaultFontFamily: string;
  defaultSize?: number;
}
const BLOCK_SELECTOR = 'li, p, blockquote';

/**
 * Parse a Fika rich-text HTML string into measurable blocks. Each list item
 * and top-level paragraph/quote becomes one block; a block's representative font
 * size is the largest inline size in it (so measurement never under-estimates).
 * Returns no blocks when there's no DOM parser or no text. List items are tagged
 * so the marker indent is accounted for.
 */
export function extractFitBlocksFromHtml(html: string, options: ExtractOptions): ExtractedContent {
  const empty: ExtractedContent = {
    blocks: []
  };
  if (!html || typeof DOMParser === 'undefined') return empty;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.body;
  if (!root) return empty;
  const defaultSize = options.defaultSize ?? DEFAULT_TEXT_FONT_SIZE;
  const blockEls = Array.from(root.querySelectorAll(BLOCK_SELECTOR))
  .filter(el => el.tagName === 'LI' || !el.closest('li'));
  const candidates = blockEls.length ? blockEls : Array.from(root.children);
  const blocks: TextFitBlock[] = [];
  for (const el of candidates) {
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    const isList = el.tagName === 'LI';
    // Empty bullets still occupy a line (Enter on a list placeholder).
    if (!text && !isList) continue;
    blocks.push({
      text: text || ' ',
      size: blockFontSize(el, defaultSize),
      bold: !!el.querySelector('strong, b'),
      italic: !!el.querySelector('em, i'),
      fontFamily: blockFontFamily(el, options.defaultFontFamily),
      listItem: isList,
      ...(isList ? listIndentFrom(el) : {})
    });
  }

  if (!blocks.length) {
    const text = (root.textContent || '').replace(/\s+/g, ' ').trim();
    if (text) {
      blocks.push({
        text,
        size: blockFontSize(root, defaultSize),
        fontFamily: blockFontFamily(root, options.defaultFontFamily)
      });
    }
  }
  return {
    blocks
  };
}

/**
 * Return a copy of `html` with every inline `font-size:Npx` multiplied by
 * `scale` (rounded to 0.1px). Text without an explicit size is untouched here —
 * the renderer scales that through the `--text-fit-base-size` CSS variable. A
 * scale >= 1 (or a non-DOM context) returns the HTML unchanged.
 */
export function scaleHtmlFontSizes(html: string, scale: number): string {
  if (!html || scale >= 1 || typeof DOMParser === 'undefined') return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.body.querySelectorAll<HTMLElement>('[style]').forEach(el => {
    const size = parseFontSizePx(el.style.fontSize);
    if (size > 0) el.style.fontSize = `${roundTo(size * scale)}px`;
  });
  return doc.body.innerHTML;
}
