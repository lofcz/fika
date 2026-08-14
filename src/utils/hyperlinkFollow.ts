export type FollowHyperlinkModifier = 'Ctrl+Click' | '⌘+Click';
export function hyperlinkAnchorFromEvent(event: Event): HTMLAnchorElement | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const anchor = target.closest('a[href]');
  return anchor instanceof HTMLAnchorElement ? anchor : null;
}
export function isSafeHyperlinkHref(href: string): boolean {
  try {
    const url = new URL(href);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
export function isFollowHyperlinkClick(event: Pick<MouseEvent, 'button' | 'ctrlKey' | 'metaKey'>): boolean {
  if (event.button != null && event.button !== 0) return false;
  return !!(event.ctrlKey || event.metaKey);
}
export function followHyperlinkModifier(platform?: string): FollowHyperlinkModifier {
  const value = platform ?? (typeof navigator !== 'undefined' ? navigator.platform : '');
  return /Mac|iPhone|iPad|iPod/i.test(value) ? '⌘+Click' : 'Ctrl+Click';
}
export function openHyperlink(href: string): boolean {
  if (typeof window === 'undefined' || !isSafeHyperlinkHref(href)) return false;
  window.open(href, '_blank', 'noopener,noreferrer');
  return true;
}
export type HyperlinkHoverTooltip = {
  href: string;
  left: number;
  top: number;
};
export function hyperlinkTooltipFromAnchor(anchor: HTMLAnchorElement, offset = 6): HyperlinkHoverTooltip | null {
  if (!isSafeHyperlinkHref(anchor.href)) return null;
  const rect = anchor.getBoundingClientRect();
  return {
    href: anchor.href,
    left: Math.round(rect.left),
    top: Math.round(rect.bottom + offset)
  };
}
