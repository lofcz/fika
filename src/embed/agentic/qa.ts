/**
 * Deterministic slide QA.
 *
 * After a slide is built, run cheap, geometry-and-text checks and return
 * structured issues the agent can act on in the same turn (ppt-agent's
 * "quality auto-retry" pattern). Checks cover the common ways generated decks
 * look broken or lazy: elements overlapping outside the safe margin, text
 * shrunk below a legibility floor, empty placeholder boxes, contrast that
 * fails WCAG AA for the palette's role pairs, anchor monotony (same anchor as
 * the previous slide), and density overload (too many bullets / over-long
 * bullets).
 *
 * Everything here is pure: it inspects a built slide plus the active style and
 * returns issues; it never mutates state.
 */

import type { PPTElement, PPTTextElement, Slide } from '@/types/slides';
import type { FikaStylePreset } from './styles';
import type { CompositionAnchor } from './composition';

/** A single QA finding, with enough context for the agent to fix it. */
export interface QaIssue {
  /** Machine-readable check id. */
  code: 'overlap' | 'contrast' | 'tooSmall' | 'emptyPlaceholder' | 'anchorRepeat' | 'density' | 'contentEmpty';
  /** Human-readable explanation. */
  message: string;
  /** Severity — 'error' should block, 'warn' should prompt a fix. */
  severity: 'error' | 'warn';
  /** Element ids involved (when applicable). */
  elementIds?: string[];
}
interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}
function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;
}
function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const h = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Strip HTML tags to count visible words in rich text content. */
function plainText(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}
function wordCount(html: string): number {
  const text = plainText(html);
  return text ? text.split(' ').length : 0;
}

/** Relative luminance (WCAG) of a #rrggbb color. */
function luminance(hex: string): number {
  const c = hex.replace('#', '');
  if (c.length !== 6) return 0.5;
  const channel = (i: number) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** WCAG contrast ratio between two #rrggbb colors (1–21). */
function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
const AA_NORMAL = 4.5;
const AA_LARGE = 3.0;
/** Smallest acceptable rendered font size, in px, before we flag legibility. */
const LEGIBILITY_FLOOR_PX = 14;
/** Max bullets per list before the slide reads as a wall of text. */
const MAX_BULLETS = 6;
/** Max words per bullet before it stops being a bullet. */
const MAX_BULLET_WORDS = 22;

/**
 * Validate a built slide. `previousAnchor` enables the monotony check; pass
 * undefined for the first slide. Returns an array of issues (possibly empty).
 */
export function validateSlide(slide: Partial<Slide>, preset: FikaStylePreset, options: {
  anchor?: CompositionAnchor;
  previousAnchor?: CompositionAnchor;
  feature?: boolean;
  /**
   * When true, the slide was built from a layout whose job is to carry body
   * content (bullets/columns/rows/cards/steps/stats), so a slide that renders
   * only a title is a defect. Title/section/closing/quote/imageFull layouts
   * legitimately render little body text and pass `false`.
   */
  expectsBody?: boolean;
  /** Layout id, for a more actionable message. */
  layoutId?: string;
} = {}): QaIssue[] {
  const issues: QaIssue[] = [];
  const elements = (slide.elements ?? []) as PPTElement[];
  const textElements = elements.filter((el): el is PPTTextElement => el.type === 'text');

  if (options.expectsBody) {
    const totalWords = textElements.reduce((sum, el) => sum + wordCount(el.content), 0);
    const nonTitleCount = Math.max(0, textElements.length - 1);
    const hasVisualBody = elements.some(el => el.type === 'chart' || el.type === 'table' || el.type === 'image');
    const hasList = textElements.some(el => /<li[\s>]/i.test(el.content));
    const hasProseBody = textElements.some(el => {
      const paragraphs = (el.content.match(/<p[\s>]/gi) ?? []).length;
      return paragraphs > 1 || wordCount(el.content) > 12;
    });
    const twoColumnHeadingsOnly = options.layoutId === 'twoColumn' && !hasList && !hasProseBody && !hasVisualBody;
    const hasBodyContent = !twoColumnHeadingsOnly && (hasVisualBody || nonTitleCount >= 2 || totalWords > 18 || hasList || hasProseBody);
    if (!hasBodyContent) {
      issues.push({
        code: 'contentEmpty',
        severity: 'error',
        message: `Layout "${options.layoutId ?? 'content'}" rendered a title but NO body content — the slide was rejected (not inserted). Re-issue createFromLayout with the exact slot names from layouts.catalog; for cards/numbered use ≤3 items with short heading+body. Do NOT slides.delete — nothing was added.`
      });
    }
  }

  for (const el of textElements) {
    const items = (el.content.match(/<li[\s>]/g) ?? []).length;
    if (items > MAX_BULLETS) {
      issues.push({
        code: 'density',
        severity: 'warn',
        elementIds: [el.id],
        message: `Bullet list has ${items} items (> ${MAX_BULLETS}); split the slide or trim to the essential points.`
      });
    }
    const parts = el.content.split(/<\/li>/i);
    for (const part of parts) {
      const words = wordCount(part);
      if (words > MAX_BULLET_WORDS) {
        issues.push({
          code: 'density',
          severity: 'warn',
          elementIds: [el.id],
          message: `A bullet runs ${words} words (> ${MAX_BULLET_WORDS}); tighten it to a short phrase.`
        });
        break;
      }
    }
    const sizeMatch = el.content.match(/font-size:\s*([\d.]+)px/i);
    const size = sizeMatch ? parseFloat(sizeMatch[1]) : null;
    if (size !== null && size > 0 && size < LEGIBILITY_FLOOR_PX) {
      issues.push({
        code: 'tooSmall',
        severity: 'warn',
        elementIds: [el.id],
        message: `Text auto-fit to ${Math.round(size)}px (< ${LEGIBILITY_FLOOR_PX}px); shorten the copy or enlarge the region.`
      });
    }
    if (el.placeholder && !plainText(el.content)) {
      issues.push({
        code: 'emptyPlaceholder',
        severity: 'warn',
        elementIds: [el.id],
        message: 'A placeholder text box was left empty; fill it or delete the element.'
      });
    }
  }

  const rects = textElements.map(el => ({
    id: el.id,
    rect: {
      left: el.left,
      top: el.top,
      width: el.width,
      height: el.height
    }
  }));
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      if (!rectsOverlap(a.rect, b.rect)) continue;
      const area = overlapArea(a.rect, b.rect);
      const smaller = Math.min(a.rect.width * a.rect.height, b.rect.width * b.rect.height);
      if (smaller > 0 && area / smaller > 0.04) {
        issues.push({
          code: 'overlap',
          severity: 'error',
          elementIds: [a.id, b.id],
          message: 'Two text boxes overlap; reposition one so they do not collide.'
        });
      }
    }
  }

  const p = preset.palette;
  const bg = options.feature ? p.featureBackground : p.background;
  const bodyColor = options.feature ? p.featureBody : p.body;
  const titleColor = options.feature ? p.featureTitle : p.title;
  const fills: Array<{
    name: string;
    color: string;
  }> = [{
    name: 'background',
    color: bg
  }];
  if (!options.feature && p.surface && p.surface.toLowerCase() !== bg.toLowerCase()) {
    fills.push({
      name: 'surface',
      color: p.surface
    });
  }
  for (const fill of fills) {
    const bodyRatio = contrastRatio(bodyColor, fill.color);
    const titleRatio = contrastRatio(titleColor, fill.color);
    if (bodyRatio < AA_NORMAL) {
      issues.push({
        code: 'contrast',
        severity: 'error',
        message: `Body text contrast ${bodyRatio.toFixed(2)}:1 is below WCAG AA (${AA_NORMAL}:1) on the ${fill.name}.`
      });
    }
    if (titleRatio < AA_LARGE) {
      issues.push({
        code: 'contrast',
        severity: 'warn',
        message: `Title contrast ${titleRatio.toFixed(2)}:1 is below the large-text AA floor (${AA_LARGE}:1) on the ${fill.name}.`
      });
    }
  }

  if (options.anchor && options.previousAnchor && options.anchor === options.previousAnchor) {
    issues.push({
      code: 'anchorRepeat',
      severity: 'warn',
      message: `This slide repeats the "${options.anchor}" composition of the previous slide; pick a contrasting variant/anchor.`
    });
  }
  return issues;
}
