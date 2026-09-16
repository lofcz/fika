import MarkdownItCtor from 'markdown-it';
import type { MarkdownIt } from 'markdown-it';
import { markdownMathSegments, normalizeGeneratedMarkdown } from '../text/index';
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
  return MATH_RE.test(source);
}

/** A TeX control word (`\frac`, `\sqrt`, `\sum`, …), not a symbol allowlist. */
const TEX_CONTROL_RE = /\\[a-zA-Z]/;

/** Delimited math or any TeX control sequence in the source. */
export function containsTexSource(source: string): boolean {
  return !!source && (containsMath(source) || TEX_CONTROL_RE.test(source));
}

/** The whole string is a TeX formula MathLive can typeset as-is. */
export function isTexFormulaSource(source: string): boolean {
  const text = source.trim();
  if (!text) return false;
  if (containsMath(text)) {
    return tokenizeMath(text).every((segment) => segment.type === 'math' || !segment.value.trim());
  }
  return /^\\[a-zA-Z]/.test(text);
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
    parser.use(texmath, {
      engine: texmathEngine,
      delimiters: [...MATH_DELIMITERS],
      katexOptions: {
        strict: false,
        throwOnError: false
      }
    });
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
}

/** Blocks whose inline content receives the run span. */
const RUN_BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const LIST_TAGS = new Set(['ul', 'ol']);
/** `<li>` children that are blocks in their own right and must not be pulled into the item's run span. */
const LI_BLOCK_CHILD_TAGS = new Set(['p', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'table', 'blockquote']);

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
 * the pptx importer produce) and mirrors size / color onto list containers so
 * bullet markers match.
 */
export function applyTextRunStyle(htmlText: string, style: TextRunStyle | undefined): string {
  if (!style || !htmlText) return htmlText;
  const decl: string[] = [];
  if (typeof style.fontSize === 'number' && Number.isFinite(style.fontSize) && style.fontSize > 0) decl.push(`font-size:${Math.round(style.fontSize)}px`);
  if (style.fontName?.trim()) decl.push(`font-family:${style.fontName.trim()}`);
  if (style.color?.trim()) decl.push(`color:${style.color.trim()}`);
  const declText = decl.join(';');
  if (!declText && !style.bold && !style.align) return htmlText;
  const listDecl = decl.filter(d => !d.startsWith('font-family')).join(';');
  const fragment = parseFragment(htmlText);
  for (const child of fragment.childNodes.slice()) applyRunStyleToTree(child, declText, listDecl, style);
  return serialize(fragment);
}
