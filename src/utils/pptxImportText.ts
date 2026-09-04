/**
 * PPTX import HTML fixes that pptxtojson 2.2.3 does not always emit:
 * inherited master/layout bullets arrive as hanging-indent <p> instead of <ul>,
 * and http(s) runs may be plain text even when PowerPoint treats them as links.
 */

export const PPTX_HYPERLINK_COLOR = '#0563C1';
/** Office theme `folHlink` (PowerPoint followed/visited hyperlink). */
export const PPTX_FOLLOWED_HYPERLINK_COLOR = '#954F72';
const HTTP_URL_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;
const IGNORED_URL_HOSTS = new Set(['www.w3.org', 'w3.org']);
function stripHangingIndentAttrs(attrs: string): string {
  if (!/style="/i.test(attrs)) return attrs;
  return attrs.replace(/style="([^"]*)"/i, (_match, style: string) => {
    const next = style.replace(/margin-left\s*:\s*[^;]+;?/gi, '').replace(/text-indent\s*:\s*[^;]+;?/gi, '').replace(/;\s*;/g, ';').replace(/^\s*;\s*/, '').replace(/;\s*$/, ';').trim();
    return next ? `style="${next}"` : '';
  }).replace(/\s{2,}/g, ' ').replace(/\s+$/, '');
}
function isHangingIndentParagraph(attrs: string): boolean {
  const match = attrs.match(/text-indent\s*:\s*(-?[\d.]+)\s*(pt|px|em)/i);
  return !!match && parseFloat(match[1]) < 0;
}

/** PowerPoint keeps empty body paragraphs as vertical gaps, not bullets. */
export function isEmptyListParagraph(inner: string): boolean {
  const text = inner.replace(/<br\s*\/?>/gi, '').replace(/<[^>]+>/g, '').replace(/&nbsp;|&#160;|&ensp;|&emsp;|&thinsp;/gi, ' ').replace(/\s+/g, ' ').trim();
  return !text;
}
function spacerParagraph(attrs: string, inner: string): string {
  return `<p${stripHangingIndentAttrs(attrs)}>${inner}</p>`;
}

/**
 * Consecutive body paragraphs with hanging indent (master bullet indent) become
 * a real <ul> so ProseMirror creates bullet_list and the toolbar list chip activates.
 * Empty hanging paragraphs stay spacers (PowerPoint does not draw a bullet for them).
 */
export function wrapHangingIndentParagraphsAsLists(html: string, ratio = 1): string {
  if (!html) return html;
  const paragraphRe = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
  let out = '';
  let last = 0;
  const pending: Array<{
    attrs: string;
    inner: string;
  }> = [];
  let spacers: Array<{
    attrs: string;
    inner: string;
  }> = [];
  const hangingPaddingPx = (attrs: string) => {
    const match = attrs.match(/margin-left\s*:\s*([\d.]+)\s*pt/i);
    if (!match) return undefined;
    return Math.round(parseFloat(match[1]) * ratio);
  };
  const flush = () => {
    if (!pending.length) return;
    const padding = hangingPaddingPx(pending[0].attrs);
    const fontSizeDecl = pending[0].inner.match(/font-size:\s*[\d.]+(?:pt|px)/i)?.[0];
    const styles = [padding ? `padding-inline-start: ${padding}px` : '', fontSizeDecl?.replace(/\s+/g, ' ').trim() || ''].filter(Boolean);
    const ulAttrs = styles.length ? ` style="${styles.join(';')}"` : '';
    out += `<ul${ulAttrs}>${pending.map(({
      attrs,
      inner
    }) => `<li><p${stripHangingIndentAttrs(attrs)}>${inner}</p></li>`).join('')}</ul>`;
    pending.length = 0;
  };
  const emitSpacers = () => {
    for (const spacer of spacers) out += spacerParagraph(spacer.attrs, spacer.inner);
    spacers = [];
  };
  for (const match of html.matchAll(paragraphRe)) {
    const offset = match.index ?? 0;
    const between = html.slice(last, offset);
    const attrs = match[1];
    const inner = match[2];
    if (isHangingIndentParagraph(attrs)) {
      if (!pending.length) out += between;else if (between.trim()) {
        flush();
        emitSpacers();
        out += between;
      }
      if (isEmptyListParagraph(inner)) {
        if (pending.length) spacers.push({
          attrs,
          inner
        });
      } else {
        if (spacers.length && pending.length) {
          flush();
          emitSpacers();
        } else {
          spacers = [];
        }
        pending.push({
          attrs,
          inner
        });
      }
    } else {
      flush();
      emitSpacers();
      out += between + match[0];
    }
    last = offset + match[0].length;
  }
  flush();
  out += html.slice(last);
  return out;
}

const DEFAULT_LIST_GUTTER = '1.2em';

/**
 * Lists without a gutter have their outside markers clipped by overflow:hidden
 * on fixed-height text boxes. Stamp a padding-inline-start when the importer
 * (or pptxtojson) emitted a bare <ul>/<ol>.
 */
export function ensureListMarkerGutter(html: string): string {
  if (!html || !/<[uo]l\b/i.test(html)) return html;
  return html.replace(/<(ul|ol)\b([^>]*)>/gi, (full, tag: string, attrs: string) => {
    const styleMatch = attrs.match(/style="([^"]*)"/i);
    if (styleMatch && /padding-inline-start\s*:|padding-left\s*:/i.test(styleMatch[1])) {
      return full;
    }
    if (styleMatch) {
      const style = styleMatch[1].replace(/;?\s*$/, '');
      const next = `${style}${style ? ';' : ''}padding-inline-start:${DEFAULT_LIST_GUTTER}`;
      return `<${tag}${attrs.replace(/style="[^"]*"/i, `style="${next}"`)}>`;
    }
    const trimmed = attrs.trimEnd();
    return `<${tag}${trimmed ? `${trimmed} ` : ' '}style="padding-inline-start:${DEFAULT_LIST_GUTTER}">`;
  });
}
function trimUrlMatch(raw: string): string {
  return raw.replace(/[),.;:!?]+$/g, '');
}
function isImportableHttpUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  if (IGNORED_URL_HOSTS.has(host)) return false;
  if (!host.includes('.')) return false;
  const parts = host.split('.').filter(Boolean);
  return parts.length >= 2 && parts[parts.length - 1].length >= 2;
}
function escapeHref(url: string): string {
  return url.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * Wrap leftover http(s) URLs that are not already inside <a>. OOXML hyperlinks
 * (a:hlinkClick) are preferred; this only catches display-time / unlinked URL text.
 */
export function linkifyPlainUrls(html: string): string {
  if (!html || !/https?:\/\//i.test(html)) return html;
  return html.replace(/(<a\b[^>]*>[\s\S]*?<\/a>)|([^<]+)/gi, (chunk, anchor: string | undefined, text: string | undefined) => {
    if (anchor || !text) return chunk;
    return text.replace(HTTP_URL_PATTERN, raw => {
      const url = trimUrlMatch(raw);
      if (!isImportableHttpUrl(url)) return raw;
      const trailing = raw.slice(url.length);
      return `<a href="${escapeHref(url)}" target="_blank">${url}</a>${trailing}`;
    });
  });
}
function stripInlineColor(style: string): string {
  return style.replace(/color\s*:\s*[^;]+;?/gi, '').replace(/;\s*;/g, ';').replace(/^\s*;\s*/, '').replace(/;\s*$/, ';').trim();
}
function replaceStyleAttr(attrs: string, style: string): string {
  const next = stripInlineColor(style);
  if (!next) return attrs.replace(/\s*style="[^"]*"/i, '');
  return attrs.replace(/style="[^"]*"/i, `style="${next}"`);
}

/**
 * Drop baked-in run colors on links so CSS `a` / `a:visited` can paint them
 * (PowerPoint hlink blue vs folHlink purple). Keep font-size and other run props.
 */
export function styleImportedHyperlinks(html: string): string {
  if (!html || !/<a\b/i.test(html)) return html;
  const withSpanColor = html.replace(/<span([^>]*)>(\s*<a\b)/gi, (full, attrs: string, rest: string) => {
    const styleMatch = attrs.match(/style="([^"]*)"/i);
    if (!styleMatch) return full;
    return `<span${replaceStyleAttr(attrs, styleMatch[1])}>${rest}`;
  });
  return withSpanColor.replace(/<a\b([^>]*)>/gi, (full, attrs: string) => {
    if (!/\bhref\s*=/i.test(attrs)) return full;
    const styleMatch = attrs.match(/style="([^"]*)"/i);
    if (!styleMatch) return full;
    return `<a${replaceStyleAttr(attrs, styleMatch[1])}>`;
  });
}
