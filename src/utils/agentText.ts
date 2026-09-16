import { decodeHTML } from 'entities';
import { normalizeGeneratedNewlines } from '../text/index';
/**
 * Tiny helpers for agent-authored plain text before it becomes slide HTML.
 *
 * Models often emit:
 *  - literal escape sequences (`\n`, `\r\n`, `\r`) instead of real newlines
 *  - HTML entities (`&amp;`, `&nbsp;`, `&#8222;`, …) instead of characters
 *
 * Newline recovery uses the shared CommonMark/math parser to preserve literal
 * code and TeX. Markdown rendering and editable run styling live in markdown.ts.
 */

/** Decode complete HTML entities, including invalid numeric references safely. */
export function decodeHtmlEntities(text: string): string {
  return text.includes('&') ? decodeHTML(text) : text;
}
/** Shared parser-backed recovery; code and math source are never decoded. */
export const unescapeAgentNewlines = normalizeGeneratedNewlines;
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
