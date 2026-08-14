import MarkdownItCtor from 'markdown-it';
import type { MarkdownIt } from 'markdown-it';
import { decodeHtmlEntities, unescapeAgentNewlines } from './agentText';
import { ensureMathliveReady, texmathEngine } from './math';

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

/**
 * Bracket / dollar math delimiters, in match priority for a given position:
 * `$$` must be tried before `$`. `\begin{env}…\end{env}` is handled separately
 * (its closer is dynamic). Inline forms (`$…$`, `\(…\)`) may not cross a
 * newline; display forms (`$$…$$`, `\[…\]`) may.
 */
const DOLLAR_OPENERS = [{
  open: '$$',
  display: true,
  multiline: true
}, {
  open: '$',
  display: false,
  multiline: false
}] as const;
const BRACKET_OPENERS = [{
  open: '\\[',
  close: '\\]',
  display: true,
  multiline: true
}, {
  open: '\\(',
  close: '\\)',
  display: false,
  multiline: false
}] as const;
const BEGIN_RE = /\\begin\{([a-zA-Z*]+)\}/y;

/** Find a plain (non-dollar) closer from `from`, optionally bounded to one line. */
function findPlainClose(text: string, from: number, close: string, multiline: boolean): number {
  const idx = text.indexOf(close, from);
  if (idx === -1) return -1;
  if (!multiline) {
    const nl = text.indexOf('\n', from);
    if (nl !== -1 && nl < idx) return -1;
  }
  return idx;
}

/** Find a `$`/`$$` closer from `from`, skipping escaped `\$` and bounding `$` to one line. */
function findDollarClose(text: string, from: number, isDouble: boolean): number {
  for (let j = from; j < text.length; j++) {
    const ch = text[j];
    if (ch === '\\') {
      j += 1;
      continue;
    }
    if (!isDouble && ch === '\n') return -1;
    if (ch === '$') {
      if (!isDouble) return j;
      if (text[j + 1] === '$') return j;
    }
  }
  return -1;
}

/**
 * Split `source` into ordered text and math segments. This is the robust core
 * behind both line-splitting and inline rendering: it scans once, picking the
 * earliest opener at each position (longest on ties, so `$$` beats `$`), honors
 * backslash escapes (`\$`, `\\`), skips inline code spans (so `` `$x` `` is not
 * read as math) and keeps unterminated openers as literal text (graceful for
 * partial/streamed content). Inline math may not span newlines; display math
 * (`$$`, `\[`, `\begin{}`) may.
 */
export function tokenizeMath(source: string): ContentSegment[] {
  const text = String(source);
  const n = text.length;
  const out: ContentSegment[] = [];
  let textStart = 0;
  let i = 0;
  const flushText = (end: number) => {
    if (end > textStart) {
      const value = text.slice(textStart, end);
      out.push({
        type: 'text',
        raw: value,
        value,
        display: false
      });
    }
  };
  const pushMath = (start: number, innerStart: number, innerEnd: number, end: number, display: boolean) => {
    flushText(start);
    out.push({
      type: 'math',
      raw: text.slice(start, end),
      value: text.slice(innerStart, innerEnd),
      display
    });
    i = end;
    textStart = end;
  };
  while (i < n) {
    const ch = text[i];

    if (ch === '`') {
      let run = 1;
      while (text[i + run] === '`') run += 1;
      const close = text.indexOf('`'.repeat(run), i + run);
      i = close === -1 ? i + run : close + run;
      continue;
    }
    if (ch === '\\') {
      BEGIN_RE.lastIndex = i;
      const begin = BEGIN_RE.exec(text);
      if (begin && begin.index === i) {
        const closer = `\\end{${begin[1]}}`;
        const innerStart = i + begin[0].length;
        const end = text.indexOf(closer, innerStart);
        if (end !== -1) {
          pushMath(i, innerStart, end, end + closer.length, true);
          continue;
        }
        i += begin[0].length;
        continue;
      }
      const bracket = BRACKET_OPENERS.find(d => text.startsWith(d.open, i));
      if (bracket) {
        const innerStart = i + bracket.open.length;
        const end = findPlainClose(text, innerStart, bracket.close, bracket.multiline);
        if (end !== -1) {
          pushMath(i, innerStart, end, end + bracket.close.length, bracket.display);
          continue;
        }
      }
      i += 2;
      continue;
    }
    if (ch === '$') {
      const isDouble = text[i + 1] === '$';
      if (!isDouble && text[i + 1] >= '0' && text[i + 1] <= '9') {
        i += 1;
        continue;
      }
      const opener = isDouble ? DOLLAR_OPENERS[0] : DOLLAR_OPENERS[1];
      const innerStart = i + opener.open.length;
      const end = findDollarClose(text, innerStart, isDouble);
      if (end !== -1) {
        pushMath(i, innerStart, end, end + opener.open.length, opener.display);
        continue;
      }
      i += opener.open.length;
      continue;
    }
    i += 1;
  }
  flushText(n);
  return out;
}

/**
 * Decode HTML entities and turn literal `\n` / `\r\n` / `\r` into real newlines,
 * leaving TeX intact via {@link tokenizeMath}. Entity decode is global; newline
 * unescaping runs only on non-math text segments (and skips inline code).
 */
const MATH_OPENER_PROBE = /\$\$|\$|\\\(|\\\[|\\begin\{/;
export function normalizeAgentText(text: string): string {
  if (text == null) return '';
  const decoded = decodeHtmlEntities(String(text));
  if (!decoded || !decoded.includes('\\')) return decoded;
  if (!MATH_OPENER_PROBE.test(decoded)) return unescapeAgentNewlines(decoded);
  let out = '';
  for (const segment of tokenizeMath(decoded)) {
    out += segment.type === 'math' ? segment.raw : unescapeAgentNewlines(segment.value);
  }
  return out;
}

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
