import type { TextAlign, StructuredTextBody, StructuredTextParagraph, StructuredTextRun } from '@/types/slides';
function mapAlign(value: string | null | undefined): TextAlign | undefined {
  if (!value) return undefined;
  const v = value.toLowerCase();
  if (v === 'center' || v === 'right' || v === 'justify' || v === 'left') return v;
  if (v === 'start') return 'left';
  if (v === 'end') return 'right';
  return undefined;
}
function parsePx(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const match = value.match(/([\d.]+)\s*px/i);
  if (!match) return undefined;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Best-effort HTML → structured text foundation.
 * Not a full Mona StructuredTextBody; captures runs/paragraphs from imported HTML.
 */
export function htmlToStructuredText(html: string): StructuredTextBody | undefined {
  if (!html || typeof DOMParser === 'undefined') return undefined;
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html');
  const root = doc.getElementById('root');
  if (!root) return undefined;
  const paragraphs: StructuredTextParagraph[] = [];
  const pushParagraph = (el: HTMLElement) => {
    const runs: StructuredTextRun[] = [];
    const walk = (node: Node, style: Partial<StructuredTextRun>) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        if (!text) return;
        if (!text.replace(/\u00a0/g, ' ').trim() && text !== ' ') return;
        runs.push({
          text: text.replace(/\u00a0/g, ' '),
          ...style
        });
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();
      const next: Partial<StructuredTextRun> = {
        ...style
      };
      if (tag === 'b' || tag === 'strong') next.bold = true;
      if (tag === 'i' || tag === 'em') next.italic = true;
      if (tag === 'u' || tag === 'a') next.underline = true;
      if (tag === 's' || tag === 'strike' || tag === 'del') next.strikethrough = true;
      const color = el.style?.color;
      if (color) next.fontColor = color;
      const fontSize = parsePx(el.style?.fontSize);
      if (fontSize) next.fontSize = fontSize;
      const fontName = el.style?.fontFamily?.replace(/['"]/g, '').split(',')[0]?.trim();
      if (fontName) next.fontName = fontName;
      for (const child of Array.from(el.childNodes)) walk(child, next);
    };
    for (const child of Array.from(el.childNodes)) walk(child, {});
    if (!runs.length) return;
    paragraphs.push({
      align: mapAlign(el.style?.textAlign),
      runs
    });
  };
  const blocks = Array.from(root.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6')).filter(node => !(node.tagName === 'LI' && node.querySelector('p')));
  if (blocks.length) {
    blocks.forEach(node => pushParagraph(node as HTMLElement));
  } else {
    pushParagraph(root);
  }
  if (!paragraphs.length) return undefined;
  return {
    schemaVersion: 1,
    paragraphs
  };
}
