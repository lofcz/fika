import { DEFAULT_CODE_FONT_SIZE, resolveCodeLanguage, resolveCodeTheme } from '@/configs/code';
import type { PPTCodeElement } from '@/types/slides';

/**
 * A .pptx has no code-block primitive, so a native code element travels as a
 * text box whose shape name (`p:cNvPr@name`) carries this tag:
 *
 *     fika:code:<language>[:<theme>[:<lineNumbers 0|1>]]
 *
 * Fika writes it on export and python-pptx2's `add_code` writes it when a deck
 * is authored server-side; the importer turns any shape carrying it back into a
 * syntax-highlighted code element instead of a plain text box.
 */
export const CODE_SHAPE_NAME_PREFIX = 'fika:code';

export interface CodeShapeTag {
  language: string;
  theme: string;
  showLineNumbers: boolean;
}

export function formatCodeShapeName(el: Pick<PPTCodeElement, 'language' | 'theme' | 'showLineNumbers'>): string {
  return [CODE_SHAPE_NAME_PREFIX, el.language, el.theme, el.showLineNumbers ? '1' : '0'].join(':');
}

export function parseCodeShapeName(name: string | undefined | null): CodeShapeTag | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (trimmed !== CODE_SHAPE_NAME_PREFIX && !trimmed.startsWith(`${CODE_SHAPE_NAME_PREFIX}:`)) return null;
  const [, , language = '', theme = '', ln = ''] = trimmed.split(':');
  return {
    language: resolveCodeLanguage(language),
    theme: resolveCodeTheme(theme),
    showLineNumbers: ln === '1' || ln.toLowerCase() === 'true',
  };
}

/**
 * Source lines from imported paragraph HTML: one `<p>` per line, `<br>` as a
 * hard break inside a paragraph, entities decoded, whitespace kept verbatim.
 */
export function htmlToCodeLines(html: string): string[] {
  if (!html) return [];
  if (typeof DOMParser === 'undefined') {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .replace(/\n$/, '')
      .split('\n');
  }
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html');
  const root = doc.getElementById('root');
  if (!root) return [];
  const lines: string[] = [];
  const paragraphs = Array.from(root.querySelectorAll('p, li, div'));
  const blocks = paragraphs.length ? paragraphs.filter(p => !paragraphs.some(other => other !== p && other.contains(p))) : [root];
  for (const block of blocks) {
    let current = '';
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        current += (node.textContent ?? '').replace(/\u00a0/g, ' ');
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if ((node as HTMLElement).tagName.toLowerCase() === 'br') {
        lines.push(current);
        current = '';
        return;
      }
      for (const child of Array.from(node.childNodes)) walk(child);
    };
    for (const child of Array.from(block.childNodes)) walk(child);
    lines.push(current);
  }
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines.map(line => line.replace(/\s+$/, ''));
}

/**
 * Export paints line numbers as literal text (`" 1  code"`); when the tag says
 * the gutter is on, peel it off so the numbers are not doubled on re-import.
 */
export function stripCodeLineNumberGutter(lines: string[]): string[] {
  if (!lines.length) return lines;
  const gutter = /^\s*\d+ {2}/;
  if (!lines.every(line => !line.trim() || gutter.test(line))) return lines;
  return lines.map(line => line.replace(gutter, ''));
}

/** Imported paragraph HTML → code element source, honouring the tag's gutter flag. */
export function importedCodeSource(html: string, tag: CodeShapeTag): string {
  const lines = htmlToCodeLines(html);
  return (tag.showLineNumbers ? stripCodeLineNumberGutter(lines) : lines).join('\n');
}

/** The first run font size (pt) declared in imported paragraph HTML, scaled to px. */
export function importedCodeFontSize(html: string, ratio: number): number {
  const match = html.match(/font-size:\s*([\d.]+)\s*pt/i);
  if (!match) return DEFAULT_CODE_FONT_SIZE;
  const pt = Number(match[1]);
  if (!Number.isFinite(pt) || pt <= 0) return DEFAULT_CODE_FONT_SIZE;
  return Math.max(8, Math.round(pt * ratio));
}
