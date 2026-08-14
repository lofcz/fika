/**
 * Tiny helpers for agent-authored plain text before it becomes slide HTML.
 *
 * Models often emit:
 *  - literal escape sequences (`\n`, `\r\n`, `\r`) instead of real newlines
 *  - HTML entities (`&amp;`, `&nbsp;`, `&#8222;`, …) instead of characters
 *
 * These helpers are intentionally dumb — no math parsing here. Callers that mix
 * TeX must run newline unescaping only on non-math text via `normalizeAgentText`
 * in `markdown.ts` (which uses the real `tokenizeMath` scanner).
 */

/** Common named entities the agent is likely to emit. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  ndash: '\u2013',
  mdash: '\u2014',
  lsquo: '\u2018',
  rsquo: '\u2019',
  ldquo: '\u201C',
  rdquo: '\u201D',
  hellip: '\u2026',
  times: '\u00d7',
  divide: '\u00f7',
  copy: '\u00a9',
  reg: '\u00ae',
  trade: '\u2122'
};

/**
 * Decode HTML entities in a plain-text / markdown string.
 * Prefer a DOM textarea when available; fall back to a pure regex path for Node tests.
 */
export function decodeHtmlEntities(text: string): string {
  if (!text || !text.includes('&')) return text;
  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
  }
  return text.replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => {
    const code = Number.parseInt(hex, 16);
    return Number.isFinite(code) ? String.fromCodePoint(code) : _;
  }).replace(/&#(\d+);/g, (_, dec: string) => {
    const code = Number.parseInt(dec, 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : _;
  }).replace(/&([a-zA-Z][a-zA-Z0-9]+);/g, (match, name: string) => {
    const mapped = NAMED_ENTITIES[name.toLowerCase()];
    return mapped ?? match;
  });
}
function replaceNewlineEscapes(text: string): string {
  return text.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\\r/g, '\n');
}

/**
 * Turn literal `\r\n` / `\n` / `\r` escape sequences into real newlines.
 * Inline code spans are left untouched so `` `$\\nu$` `` stays intact; this is
 * not a math parser — TeX protection belongs to {@link tokenizeMath}.
 */
export function unescapeAgentNewlines(text: string): string {
  if (!text || !text.includes('\\')) return text;
  if (!text.includes('`')) return replaceNewlineEscapes(text);
  let result = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    if (text[i] === '`') {
      let run = 1;
      while (text[i + run] === '`') run += 1;
      const fence = '`'.repeat(run);
      const close = text.indexOf(fence, i + run);
      const end = close === -1 ? n : close + run;
      result += text.slice(i, end);
      i = end;
      continue;
    }
    let j = i + 1;
    while (j < n && text[j] !== '`') j += 1;
    result += replaceNewlineEscapes(text.slice(i, j));
    i = j;
  }
  return result;
}
const HTML_TAG_RE = /<\/?[a-zA-Z][a-zA-Z0-9]*\b/;

/**
 * Convert real newlines (`\r\n` / `\r` / `\n`) to `<br/>` for HTML `content` paths.
 * Literal escape sequences are unescaped first. Entity decoding runs only when the
 * input does not already look like HTML, so intentional `&amp;` in markup is kept.
 */
export function agentTextToHtmlBreaks(text: string): string {
  const raw = String(text ?? '');
  if (!raw) return '';
  const normalized = HTML_TAG_RE.test(raw) ? unescapeAgentNewlines(raw) : unescapeAgentNewlines(decodeHtmlEntities(raw));
  return normalized.replace(/\r\n|\r|\n/g, '<br/>');
}
