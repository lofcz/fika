import MarkdownItCtor from 'markdown-it';
import type { MarkdownIt } from 'markdown-it';
import { markdownMathSegments, normalizeGeneratedMarkdown } from '../text/index';
import { inlineDollarEnd } from '../text/inlineDollar';
import { ensureMathliveReady, texmathEngine } from './math';
import { defaultTreeAdapter, html, parseFragment, serialize, type DefaultTreeAdapterTypes } from 'parse5';

/**
 * Fika stores text-like content as HTML (`text.content`, shape
 * `text.content`, slide remarks, notes). Markdown inputs use a real CommonMark
 * parser here; callers that already have trusted HTML should pass `content`.
 *
 * Math is typeset with MathLive (`utils/math.ts`): `markdown-it-texmath` parses
 * the `$…$` / `$$…$$` / `\(…\)` / `\[…\]` / `\begin{}` delimiters and delegates
 * rendering to the MathLive engine adapter, which emits the canonical
 * `span.fika-math` wrapper that the editor, tables and export all understand.
 */
const MATH_RE = /(?:\$\$[\s\S]+?\$\$|\$[^$\n]+\$|\\\(|\\\[|\\begin\{[a-zA-Z*]+\})/;
const MATH_DELIMITERS = ['dollars', 'brackets', 'beg_end'] as const;
type TexMathPluginOptions = {
  engine: typeof texmathEngine;
  delimiters: typeof MATH_DELIMITERS[number][];
  katexOptions: {
    strict?: boolean;
    throwOnError?: boolean;
  };
};
type TexMathPlugin = (md: MarkdownIt, options: TexMathPluginOptions) => void;
function createBaseParser() {
  const parser = new MarkdownItCtor({
    breaks: true,
    html: false,
    linkify: true,
    typographer: true
  });
  // Markdown removes the backslash. Retain the literal delimiter across the
  // subsequent rich-text parse and editor save/reload, with no visible style.
  parser.inline.ruler.before('escape', 'literal_dollar', (state, silent) => {
    if (!state.src.startsWith('\\$', state.pos)) return false;
    if (!silent) state.push('literal_dollar', 'span', 0);
    state.pos += 2;
    return true;
  });
  parser.renderer.rules.literal_dollar = () => '<span data-literal-dollar>$</span>';
  const defaultLinkOpen = parser.renderer.rules.link_open;
  parser.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    token.attrSet('target', '_blank');
    token.attrSet('rel', 'noopener noreferrer');
    return defaultLinkOpen?.(tokens, idx, options, env, self) ?? self.renderToken(tokens, idx, options);
  };
  return parser;
}
const markdownParser = createBaseParser();
let mathMarkdownParserPromise: Promise<MarkdownIt> | null = null;
let mathMarkdownParser: MarkdownIt | null = null;

/** True when a string carries math delimiters the math parser should handle. */
export function containsMath(source: string): boolean {
  return MATH_RE.test(source) && markdownMathSegments(source).some(segment => segment.type === 'math');
}

/** A TeX control word (`\frac`, `\sqrt`, `\sum`, …), not a symbol allowlist. */
const TEX_CONTROL_RE = /\\[a-zA-Z]/;

/** Cheap prefilter for HTML. Delimiter boundaries are resolved on individual text nodes. */
export function mayContainTexSource(source: string): boolean {
  return !!source && (MATH_RE.test(source) || TEX_CONTROL_RE.test(source));
}

export function containsTexSource(source: string): boolean {
  return !!source && (TEX_CONTROL_RE.test(source) || containsMath(source));
}

/** The whole string is a TeX formula MathLive can typeset as-is. */
export function isTexFormulaSource(source: string, segments = tokenizeMath(source)): boolean {
  return segments.some(segment => segment.type === 'math')
    ? segments.every(segment => segment.type === 'math' || !segment.value.trim())
    : /^\s*\\[a-zA-Z]/.test(source);
}


/**
 * A run of either plain text or a single math span, in source order. `raw` is
 * the exact source slice (delimiters included for math); `value` is the inner
 * formula for math (delimiters stripped) and equals `raw` for text.
 */
export interface ContentSegment {
  type: 'text' | 'math';
  raw: string;
  value: string;
  /** Math only: display (block) vs inline. */
  display: boolean;
}

/** Parser-backed code/math boundaries shared with the server compiler. */
export const tokenizeMath = markdownMathSegments;
export const normalizeAgentText = normalizeGeneratedMarkdown;

/**
 * Split `value` into lines on newlines, but keep multi-line math blocks intact.
 * `$$…$$`, `\[…\]` and `\begin{env}…\end{env}` may legally span several lines, so
 * a naive `.split(/\n/)` shatters one equation across multiple paragraphs/bullets
 * (each fragment then renders as broken markup). We only break on newlines that
 * fall outside every math span, using the shared {@link tokenizeMath} scanner.
 */
const MULTILINE_MATH_PROBE = /\$\$|\\\[|\\begin\{/;
export function splitLinesPreservingMath(value: string): string[] {
  const text = normalizeAgentText(String(value));
  if (!MULTILINE_MATH_PROBE.test(text)) return text.split(/\r?\n/);
  const lines: string[] = [''];
  for (const segment of tokenizeMath(text)) {
    if (segment.type === 'math') {
      lines[lines.length - 1] += segment.raw;
      continue;
    }
    const parts = segment.value.split(/\r?\n/);
    lines[lines.length - 1] += parts[0];
    for (let i = 1; i < parts.length; i += 1) lines.push(parts[i]);
  }
  return lines;
}
function loadMathMarkdownParser(): Promise<MarkdownIt> {
  if (mathMarkdownParserPromise) return mathMarkdownParserPromise;
  mathMarkdownParserPromise = Promise.all([import('markdown-it-texmath'), ensureMathliveReady()]).then(([texmathModule]) => {
    const parser = createBaseParser();
    const texmath = (texmathModule.default ?? texmathModule) as TexMathPlugin;
    const options = {
      engine: texmathEngine,
      katexOptions: {
        strict: false,
        throwOnError: false
      }
    };
    // Both the dollars and brackets plugins register a rule named math_inline.
    // Replace only the dollar rule, before registering the bracket rule.
    parser.use(texmath, { ...options, delimiters: ['dollars'] });
    parser.inline.ruler.at('math_inline', (state, silent) => {
      if (state.src[state.pos] !== '$') return false;
      const end = inlineDollarEnd(state.src, state.pos);
      if (end < 0 || end > state.posMax) return false;
      if (!silent) {
        const token = state.push('math_inline', 'math', 0);
        token.content = state.src.slice(state.pos + 1, end - 1);
        token.markup = '$';
      }
      state.pos = end;
      return true;
    });
    parser.use(texmath, { ...options, delimiters: ['brackets', 'beg_end'] });
    parser.renderer.rules.math_inline = (tokens, i) => '<eq>' + texmathEngine.renderToString(tokens[i].content) + '</eq>';
    mathMarkdownParser = parser;
    return parser;
  });
  return mathMarkdownParserPromise;
}
export async function markdownToHtml(markdown: string): Promise<string> {
  if (markdown == null) return '';
  const source = normalizeAgentText(String(markdown)).trim();
  if (!source) return '';
  const parser = containsMath(source) ? await loadMathMarkdownParser() : markdownParser;
  return parser.render(source).trim();
}

/**
 * Preload the math-capable markdown parser (lazy MathLive + texmath) so
 * `renderInlineMarkdown` can render `$…$` math synchronously afterwards. No-op
 * once loaded; call before rendering content that may contain math.
 */
export async function ensureInlineMathReady(): Promise<void> {
  await loadMathMarkdownParser();
}

/** Strip a single enclosing `<p>…</p>` (markdown-it emits no attributes on it). */
function stripOuterParagraph(html: string): string {
  const match = /^<p>([\s\S]*)<\/p>$/.exec(html);
  if (!match) return html;
  return match[1].includes('</p>') ? html : match[1];
}

/**
 * Render one line of markdown to inline HTML (no `<p>` wrapper) using the same
 * CommonMark + texmath pipeline as {@link markdownToHtml}.
 *
 * Plain (math-free) lines use markdown-it's inline renderer directly. Lines that
 * carry math are rendered through the full *block* pipeline and then unwrapped
 * from their single `<p>`: this is what makes display math correct. texmath
 * exposes `\[…\]` and `\begin{env}…\end{env}` only as block rules, so the inline
 * renderer would emit them verbatim; routing through the block parser renders
 * every delimiter (`$…$`, `$$…$$`, `\(…\)`, `\[…\]`, environments), and matches
 * the `text.setMarkdown` output byte-for-byte. Math renders only when the parser
 * has been preloaded via {@link ensureInlineMathReady}; otherwise delimiters
 * read as literal text.
 */
export function renderInlineMarkdown(markdown: string): string {
  if (markdown == null) return '';
  const source = normalizeAgentText(String(markdown)).trim();
  if (!source) return '';
  if (containsMath(source) && mathMarkdownParser) {
    return stripOuterParagraph(mathMarkdownParser.render(source).trim());
  }
  return markdownParser.renderInline(source).trim();
}

/** Typographic run style applied on top of Markdown-rendered HTML. */
export interface TextRunStyle {
  /** Font size in px (the deck's canvas px). */
  fontSize?: number;
  /** CSS font-family name, e.g. "Calibri". */
  fontName?: string;
  /** CSS color (hex / rgb). */
  color?: string;
  bold?: boolean;
  align?: 'left' | 'center' | 'right' | 'justify';
  /** Optional list marker color applied to `<ul>`/`<ol>` (defaults to `color`). */
  markerColor?: string;
  /** Optional CSS `padding-left` preserved on `<ul>`/`<ol>` (e.g. `0.4em`). */
  listPaddingLeft?: string;
  /** Optional CSS `list-style-position` preserved on `<ul>`/`<ol>` (e.g. `outside`). */
  listStylePosition?: string;
  /** Optional CSS `margin` preserved on `<ul>`/`<ol>` (e.g. `0`). */
  listMargin?: string;
}

export interface TextElementStyleDefaults {
  defaultFontName?: string;
  defaultColor?: string;
}

/** Blocks whose inline content receives the run span. */
const RUN_BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const LIST_TAGS = new Set(['ul', 'ol']);
/** `<li>` children that are blocks in their own right and must not be pulled into the item's run span. */
const LI_BLOCK_CHILD_TAGS = new Set(['p', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'table', 'blockquote']);
const SKIP_EXTRACT_TAGS = new Set(['style', 'script']);
const MATH_CONTAINER_TAGS = new Set(['eq', 'math']);

type P5Node = DefaultTreeAdapterTypes.ChildNode;
type P5Element = DefaultTreeAdapterTypes.Element;
type P5Parent = DefaultTreeAdapterTypes.ParentNode;

function isElement(node: P5Node): node is P5Element {
  return defaultTreeAdapter.isElementNode(node);
}

function getAttr(el: P5Element, name: string): string | undefined {
  return el.attrs.find(a => a.name === name)?.value;
}

function setAttr(el: P5Element, name: string, value: string): void {
  const attr = el.attrs.find(a => a.name === name);
  if (attr) attr.value = value;
  else el.attrs.push({ name, value });
}

function createElement(tagName: string, style?: string): P5Element {
  return defaultTreeAdapter.createElement(tagName, html.NS.HTML, style ? [{ name: 'style', value: style }] : []);
}

function parseInlineStyle(styleAttr: string | undefined): Map<string, string> {
  const result = new Map<string, string>();
  if (!styleAttr) return result;
  for (const rawDecl of styleAttr.split(';')) {
    const colon = rawDecl.indexOf(':');
    if (colon <= 0) continue;
    const prop = rawDecl.slice(0, colon).trim().toLowerCase();
    const val = rawDecl.slice(colon + 1).trim();
    if (prop && val) result.set(prop, val);
  }
  return result;
}

function parseFontSizePx(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const pxMatch = /(?:calc\(var\(--text-fit-scale,\s*1\)\s*\*\s*)?([0-9]+(?:\.[0-9]+)?)px/i.exec(raw);
  if (pxMatch) {
    const n = Number(pxMatch[1]);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }
  const ptMatch = /^([0-9]+(?:\.[0-9]+)?)pt$/i.exec(raw.trim());
  if (ptMatch) {
    const n = Number(ptMatch[1]) * (4 / 3);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }
  return undefined;
}

function cleanFontName(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const first = raw.split(',')[0]?.trim().replace(/^["']|["']$/g, '').trim();
  if (!first || /^(?:inherit|initial|unset)$/i.test(first)) return undefined;
  return first;
}

function cleanCssColor(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed || /^(?:inherit|initial|unset|transparent|currentcolor)$/i.test(trimmed)) return undefined;
  return trimmed;
}

function parseFontWeightBold(raw: string | undefined): boolean | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === 'bold' || trimmed === 'bolder') return true;
  if (trimmed === 'normal' || trimmed === 'lighter') return false;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) return numeric >= 600;
  return undefined;
}

function parseTextAlign(raw: string | undefined): TextRunStyle['align'] | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === 'left' || trimmed === 'center' || trimmed === 'right' || trimmed === 'justify') return trimmed;
  if (trimmed === 'start') return 'left';
  if (trimmed === 'end') return 'right';
  return undefined;
}

function isMathElement(el: P5Element): boolean {
  if (MATH_CONTAINER_TAGS.has(el.tagName)) return true;
  const cls = getAttr(el, 'class') ?? '';
  if (/\b(?:fika-math|ML__mathlive)\b/.test(cls)) return true;
  return getAttr(el, 'data-latex') !== undefined || getAttr(el, 'data-math-latex') !== undefined || getAttr(el, 'data-fika-math') !== undefined;
}

function bumpWeight<K>(counter: Map<K, number>, key: K | undefined, weight: number): void {
  if (key === undefined || weight <= 0) return;
  counter.set(key, (counter.get(key) ?? 0) + weight);
}

function mostWeightedKey<K>(counter: Map<K, number>): K | undefined {
  let best: K | undefined;
  let bestWeight = 0;
  for (const [key, weight] of counter) {
    if (weight > bestWeight) {
      best = key;
      bestWeight = weight;
    }
  }
  return best;
}

/**
 * Extract the dominant existing typographic run style from an element's HTML
 * content (and optional element defaults), including list container styling
 * (`markerColor`, `listPaddingLeft`, `listStylePosition`, `listMargin`).
 *
 * Used by `text.setMarkdown` so replacing copy on an already-styled element
 * preserves its font size, font family, color, alignment, whole-run boldness,
 * and list marker styling when `payload.style` omits them.
 */
export function extractDominantTextRunStyle(
  htmlText: string | undefined,
  elementDefaults?: TextElementStyleDefaults,
): TextRunStyle {
  const fontSizeCounts = new Map<number, number>();
  const fontNameCounts = new Map<string, number>();
  const colorCounts = new Map<string, number>();
  const alignCounts = new Map<NonNullable<TextRunStyle['align']>, number>();
  let totalTextWeight = 0;
  let boldTextWeight = 0;

  let fallbackFontSize: number | undefined;
  let fallbackFontName: string | undefined;
  let fallbackColor: string | undefined;
  let fallbackAlign: TextRunStyle['align'] | undefined;
  let fallbackBold: boolean | undefined;

  let listMarkerColor: string | undefined;
  let listPaddingLeft: string | undefined;
  let listStylePosition: string | undefined;
  let listMargin: string | undefined;

  interface WalkContext {
    fontSize?: number;
    fontName?: string;
    color?: string;
    bold?: boolean;
    align?: TextRunStyle['align'];
  }

  const recordRun = (ctx: WalkContext, weight: number) => {
    if (weight <= 0) return;
    totalTextWeight += weight;
    if (ctx.bold) boldTextWeight += weight;
    bumpWeight(fontSizeCounts, ctx.fontSize, weight);
    bumpWeight(fontNameCounts, ctx.fontName, weight);
    bumpWeight(colorCounts, ctx.color, weight);
    bumpWeight(alignCounts, ctx.align, weight);
  };

  const walk = (node: P5Node, ctx: WalkContext) => {
    if (defaultTreeAdapter.isTextNode(node)) {
      const weight = node.value.replace(/\s+/g, '').length;
      recordRun(ctx, weight);
      return;
    }
    if (!isElement(node)) return;
    const tag = node.tagName;
    if (SKIP_EXTRACT_TAGS.has(tag)) return;
    if (isMathElement(node)) {
      // Treat rendered math as an atomic inline token inheriting outer run styles
      // so MathLive internal spans (e.g. KaTeX_Main) never pollute dominant style.
      recordRun(ctx, 1);
      return;
    }

    const css = parseInlineStyle(getAttr(node, 'style'));
    const nextCtx: WalkContext = { ...ctx };

    const fontSize = parseFontSizePx(css.get('font-size'));
    if (fontSize !== undefined) {
      nextCtx.fontSize = fontSize;
      if (fallbackFontSize === undefined) fallbackFontSize = fontSize;
    }

    const fontName = cleanFontName(css.get('font-family'));
    if (fontName !== undefined) {
      nextCtx.fontName = fontName;
      if (fallbackFontName === undefined) fallbackFontName = fontName;
    }

    const color = cleanCssColor(css.get('color'));
    if (color !== undefined) {
      nextCtx.color = color;
      if (!LIST_TAGS.has(tag) && fallbackColor === undefined) fallbackColor = color;
    }

    const align = parseTextAlign(css.get('text-align'));
    if (align !== undefined) {
      nextCtx.align = align;
      if (fallbackAlign === undefined) fallbackAlign = align;
    }

    if (tag === 'strong' || tag === 'b') {
      nextCtx.bold = true;
      if (fallbackBold === undefined) fallbackBold = true;
    }
    const weightBold = parseFontWeightBold(css.get('font-weight'));
    if (weightBold !== undefined) {
      nextCtx.bold = weightBold;
      if (fallbackBold === undefined) fallbackBold = weightBold;
    }

    if (LIST_TAGS.has(tag)) {
      if (listMarkerColor === undefined && color !== undefined) listMarkerColor = color;
      if (listPaddingLeft === undefined) {
        const paddingLeft = css.get('padding-left')?.trim();
        if (paddingLeft) listPaddingLeft = paddingLeft;
      }
      if (listStylePosition === undefined) {
        const position = css.get('list-style-position')?.trim();
        if (position) listStylePosition = position;
      }
      if (listMargin === undefined) {
        const margin = css.get('margin')?.trim();
        if (margin) listMargin = margin;
      }
    }

    for (const child of node.childNodes) walk(child, nextCtx);
  };

  if (htmlText?.trim()) {
    const fragment = parseFragment(htmlText);
    for (const child of fragment.childNodes) walk(child, {});
  }

  const fontSize = mostWeightedKey(fontSizeCounts) ?? fallbackFontSize;
  const fontName = mostWeightedKey(fontNameCounts) ?? fallbackFontName ?? cleanFontName(elementDefaults?.defaultFontName);
  const color = mostWeightedKey(colorCounts) ?? fallbackColor ?? listMarkerColor ?? cleanCssColor(elementDefaults?.defaultColor);
  const align = mostWeightedKey(alignCounts) ?? fallbackAlign;
  const bold = totalTextWeight > 0
    ? (boldTextWeight === totalTextWeight ? true : undefined)
    : (fallbackBold ? true : undefined);

  const style: TextRunStyle = {};
  if (fontSize !== undefined) style.fontSize = fontSize;
  if (fontName !== undefined) style.fontName = fontName;
  if (color !== undefined) style.color = color;
  if (bold) style.bold = true;
  if (align !== undefined) style.align = align;
  if (listMarkerColor && (!color || listMarkerColor.toLowerCase() !== color.toLowerCase())) {
    style.markerColor = listMarkerColor;
  }
  if (listPaddingLeft) style.listPaddingLeft = listPaddingLeft;
  if (listStylePosition) style.listStylePosition = listStylePosition;
  if (listMargin) style.listMargin = listMargin;

  return style;
}

/** Merge an inherited run style with explicit caller overrides (explicit wins). */
export function mergeTextRunStyles(
  base: TextRunStyle | undefined,
  override: TextRunStyle | undefined,
): TextRunStyle | undefined {
  const merged: TextRunStyle = {};
  for (const source of [base, override]) {
    if (!source) continue;
    if (source.fontSize !== undefined) merged.fontSize = source.fontSize;
    if (source.fontName !== undefined) merged.fontName = source.fontName;
    if (source.color !== undefined) merged.color = source.color;
    if (source.bold !== undefined) merged.bold = source.bold;
    if (source.align !== undefined) merged.align = source.align;
    if (source.markerColor !== undefined) merged.markerColor = source.markerColor;
    if (source.listPaddingLeft !== undefined) merged.listPaddingLeft = source.listPaddingLeft;
    if (source.listStylePosition !== undefined) merged.listStylePosition = source.listStylePosition;
    if (source.listMargin !== undefined) merged.listMargin = source.listMargin;
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

/**
 * Move `nodes` (all children of `parent`) into a fresh run span (and an inner
 * `<strong>` when bold) inserted where the first of them stood.
 */
function isBlankText(node: P5Node): boolean {
  return defaultTreeAdapter.isTextNode(node) && !node.value.trim();
}

function wrapRun(parent: P5Parent, run: P5Node[], declText: string, bold: boolean): void {
  // Leave leading / trailing whitespace-only text (markdown-it's newlines
  // before a nested list) outside the span so serialisation stays tidy.
  let from = 0;
  let to = run.length;
  while (from < to && isBlankText(run[from])) from++;
  while (to > from && isBlankText(run[to - 1])) to--;
  const nodes = run.slice(from, to);
  if (nodes.length === 0) return;
  // Trailing whitespace inside the last text node ("Parent\n" before a nested
  // list) is split off and re-inserted after the span for the same reason.
  const last = nodes[nodes.length - 1];
  let tail = '';
  if (defaultTreeAdapter.isTextNode(last)) {
    const trailing = /\s+$/.exec(last.value)?.[0] ?? '';
    if (trailing && trailing.length < last.value.length) {
      tail = trailing;
      last.value = last.value.slice(0, -trailing.length);
    }
  }
  const outer = declText ? createElement('span', declText) : createElement('strong');
  const inner = declText && bold ? createElement('strong') : outer;
  if (inner !== outer) defaultTreeAdapter.appendChild(outer, inner);
  defaultTreeAdapter.insertBefore(parent, outer, nodes[0]);
  for (const node of nodes) {
    defaultTreeAdapter.detachNode(node);
    defaultTreeAdapter.appendChild(inner, node);
  }
  if (tail) {
    const next = parent.childNodes[parent.childNodes.indexOf(outer) + 1];
    if (next) defaultTreeAdapter.insertTextBefore(parent, tail, next);
    else defaultTreeAdapter.insertText(parent, tail);
  }
}

function applyRunStyleToTree(node: P5Node, declText: string, listDecl: string, style: TextRunStyle): void {
  if (!isElement(node)) return;
  const tag = node.tagName;
  const children = node.childNodes.slice();
  if (RUN_BLOCK_TAGS.has(tag)) {
    if (style.align) {
      const existing = getAttr(node, 'style') ?? '';
      if (!/text-align\s*:/i.test(existing)) {
        setAttr(node, 'style', existing ? `text-align:${style.align};${existing}` : `text-align:${style.align}`);
      }
    }
    if (declText || style.bold) wrapRun(node, children, declText, !!style.bold);
    return;
  }
  if (tag === 'li') {
    if (style.align && style.align !== 'left') {
      const hasParagraphChild = children.some(child => isElement(child) && RUN_BLOCK_TAGS.has(child.tagName));
      if (!hasParagraphChild) {
        const existing = getAttr(node, 'style') ?? '';
        if (!/text-align\s*:/i.test(existing)) {
          setAttr(node, 'style', existing ? `text-align:${style.align};${existing}` : `text-align:${style.align}`);
        }
      }
    }
    // Wrap the item's own inline runs; nested lists / paragraphs are handled
    // by their own visit below.
    let run: P5Node[] = [];
    const flushRun = () => {
      if (declText || style.bold) wrapRun(node, run, declText, !!style.bold);
      run = [];
    };
    for (const child of children) {
      if (isElement(child) && LI_BLOCK_CHILD_TAGS.has(child.tagName)) {
        flushRun();
        applyRunStyleToTree(child, declText, listDecl, style);
      } else {
        run.push(child);
      }
    }
    flushRun();
    return;
  }
  if (LIST_TAGS.has(tag) && listDecl && getAttr(node, 'style') === undefined) {
    setAttr(node, 'style', listDecl);
  }
  for (const child of children) applyRunStyleToTree(child, declText, listDecl, style);
}

/**
 * Apply one run style (size / font / color / bold / align) to Markdown output
 * so agents get styled copy from `text.create({ markdown, style })` without
 * hand-writing `<span style>` HTML. Parses the HTML with parse5, wraps each
 * block's inline content in a single styled span (the shape the editor and
 * the pptx importer produce) and mirrors size / color / list styles onto list
 * containers so bullet markers match.
 */
export function applyTextRunStyle(htmlText: string, style: TextRunStyle | undefined): string {
  if (!style || !htmlText) return htmlText;
  const decl: string[] = [];
  if (typeof style.fontSize === 'number' && Number.isFinite(style.fontSize) && style.fontSize > 0) decl.push(`font-size:${Math.round(style.fontSize)}px`);
  if (style.fontName?.trim()) decl.push(`font-family:${style.fontName.trim()}`);
  if (style.color?.trim()) decl.push(`color:${style.color.trim()}`);
  const declText = decl.join(';');
  const listDeclParts: string[] = [];
  if (typeof style.fontSize === 'number' && Number.isFinite(style.fontSize) && style.fontSize > 0) listDeclParts.push(`font-size:${Math.round(style.fontSize)}px`);
  const listColor = style.markerColor?.trim() || style.color?.trim();
  if (listColor) listDeclParts.push(`color:${listColor}`);
  if (style.listStylePosition?.trim()) listDeclParts.push(`list-style-position:${style.listStylePosition.trim()}`);
  if (style.listPaddingLeft?.trim()) listDeclParts.push(`padding-left:${style.listPaddingLeft.trim()}`);
  if (style.listMargin?.trim()) listDeclParts.push(`margin:${style.listMargin.trim()}`);
  const listDecl = listDeclParts.join(';');
  if (!declText && !listDecl && !style.bold && !style.align) return htmlText;
  const fragment = parseFragment(htmlText);
  for (const child of fragment.childNodes.slice()) applyRunStyleToTree(child, declText, listDecl, style);
  return serialize(fragment);
}
