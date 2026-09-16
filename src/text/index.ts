import { fromMarkdown } from 'mdast-util-from-markdown';
import { mathFromMarkdown } from 'mdast-util-math';
import { math } from 'micromark-extension-llm-math';
import { decodeHTML } from 'entities';
import MarkdownIt from 'markdown-it';
import texmath from 'markdown-it-texmath';
import type { Root, RootContent } from 'mdast';

const parseOptions = { extensions: [math()], mdastExtensions: [mathFromMarkdown()] };
// Preserve the existing Fika support for bare TeX environments. This parser is
// only used for that uncommon syntax; CommonMark code fences still take priority.
const environmentParser = new MarkdownIt({ html: false }).use(texmath, {
  delimiters: ['beg_end'], engine: { renderToString: (value: string) => value },
});

/** micromark math follows code-span dollar rules. TeX permits escaped dollars;
 * mask only those lexical escapes in the parser input, keeping every offset.
 * All returned content is sliced from the original source, never this mask.
 */
function parserInput(source: string): string {
  if (!source.includes('\\$')) return source;
  // Work in UTF-16 offsets, like micromark and source.position.offset.
  const out = source.split('');
  for (let i = 0; i < source.length; i++) {
    if (source[i] !== '\\') continue;
    if (source[i + 1] === '$') out[i + 1] = '\uE000';
    i++;
  }
  return out.join('');
}
const parseGeneratedMarkdown = (source: string): Root => fromMarkdown(parserInput(source), parseOptions);

interface Span { start: number; end: number; value: string; display: boolean }
function environmentSpans(source: string): Span[] {
  if (!source.includes('\\begin{')) return [];
  const lines = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') lines.push(i + 1);
  const spans: Span[] = [];
  for (const token of environmentParser.parse(source, {})) {
    if (token.type !== 'math_block' || !token.map) continue;
    const start = source.indexOf(token.content, lines[token.map[0]]);
    if (start >= 0) spans.push({ start, end: start + token.content.length, value: token.content, display: true });
  }
  return spans;
}

function walk(node: Root | RootContent, visit: (node: RootContent) => boolean | void) {
  if (node.type !== 'root' && visit(node) === false) return;
  if ('children' in node) for (const child of node.children) walk(child as RootContent, visit);
}

/** Real EOL conversion is independent of JSON-style escape recovery. */
function normalizeEols(source: string): string {
  if (!source.includes('\r')) return source;
  const out: string[] = [];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\r') {
      out.push('\n');
      if (source[i + 1] === '\n') i++;
    } else out.push(source[i]);
  }
  return out.join('');
}

/** A linear escape decoder. It never decides what is code or math. */
function decodeProseNewlines(source: string): string {
  if (!source.includes('\\') && !source.includes('\r')) return source;
  const out: string[] = [];
  for (let i = 0; i < source.length;) {
    if (source[i] === '\r') {
      out.push('\n'); i += source[i + 1] === '\n' ? 2 : 1; continue;
    }
    if (source[i] !== '\\') { out.push(source[i++]); continue; }
    const start = i;
    while (source[i] === '\\') i++;
    const escape = source[i];
    if (escape !== 'n' && escape !== 'r') { out.push(source.slice(start, i)); continue; }
    i++;
    if (escape === 'r' && source[i] === '\\') {
      let next = i;
      while (source[next] === '\\') next++;
      if (source[next] === 'n') i = next + 1;
    }
    out.push('\n');
  }
  return out.join('');
}

const opaqueNodes = new Set(['code', 'inlineCode', 'math', 'inlineMath', 'html']);
/** Transform only source spans classified as prose by the CommonMark/math parser.
 * Code (including unmatched fences), formulas, link destinations and HTML remain
 * byte-for-byte source. No Markdown serialization or delimiter guessing is used.
 */
export function mapMarkdownProse(source: string, transform: (text: string) => string): string {
  if (!source) return source;
  const env = environmentSpans(source);
  const spans: Array<{ start: number; end: number; prose: boolean }> = env.map(span => ({ ...span, prose: false }));
  walk(parseGeneratedMarkdown(source), node => {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start === undefined || end === undefined) return;
    if (opaqueNodes.has(node.type)) { spans.push({ start, end, prose: false }); return false; }
    if (node.type === 'text') {
      // An environment may sit inside a CommonMark text node. Split at the
      // library's source boundaries, preserving text around it as prose.
      let cursor = start;
      for (const block of env) {
        if (block.end <= cursor || block.start >= end) continue;
        if (cursor < block.start) spans.push({ start: cursor, end: block.start, prose: true });
        cursor = Math.min(end, block.end);
      }
      if (cursor < end) spans.push({ start: cursor, end, prose: true });
    }
  });
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const out: string[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start < cursor) continue;
    out.push(normalizeEols(source.slice(cursor, span.start)));
    const raw = source.slice(span.start, span.end);
    out.push(span.prose ? transform(raw) : raw);
    cursor = span.end;
  }
  out.push(normalizeEols(source.slice(cursor)));
  return out.join('');
}

export function normalizeGeneratedMarkdown(source: string): string {
  if (!source || (!source.includes('\\') && !source.includes('\r') && !source.includes('&'))) return source;
  return mapMarkdownProse(source, text => decodeProseNewlines(decodeHTML(text)));
}

export function normalizeGeneratedNewlines(source: string): string {
  if (!source || (!source.includes('\\') && !source.includes('\r'))) return source;
  return mapMarkdownProse(source, decodeProseNewlines);
}

export interface MarkdownMathSegment { type: 'text' | 'math'; raw: string; value: string; display: boolean }
/** Source-preserving math segments derived from the same syntax tree. */
export function markdownMathSegments(source: string): MarkdownMathSegment[] {
  const spans = environmentSpans(source);
  walk(parseGeneratedMarkdown(source), node => {
    if (node.type !== 'math' && node.type !== 'inlineMath') return;
    const start = node.position?.start.offset; const end = node.position?.end.offset;
    if (start !== undefined && end !== undefined) {
      const raw = source.slice(start, end);
      const display = node.type === 'math' || raw.startsWith('$$') || raw.startsWith('\\[');
      if (!display && (raw.includes('\n') || raw.includes('\r'))) return false;
      // Inline token values fold whitespace; TeX needs its original source.
      let delimiter = raw.startsWith('\\') ? 2 : 0;
      if (!delimiter) while (raw[delimiter] === '$') delimiter++;
      const value = raw.slice(delimiter, -delimiter);
      spans.push({ start, end, value, display });
    }
    return false;
  });
  spans.sort((a, b) => a.start - b.start);
  const out: MarkdownMathSegment[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start < cursor) continue;
    if (span.start > cursor) { const raw = source.slice(cursor, span.start); out.push({ type: 'text', raw, value: raw, display: false }); }
    out.push({ type: 'math', raw: source.slice(span.start, span.end), value: span.value, display: span.display }); cursor = span.end;
  }
  if (cursor < source.length) { const raw = source.slice(cursor); out.push({ type: 'text', raw, value: raw, display: false }); }
  return out;
}
