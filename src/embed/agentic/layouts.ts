/**
 * Compositional slide layouts for the agentic bridge.
 *
 * A "layout" is a named, pre-composed slide recipe (title, bullets, two-column,
 * image+text, big stat, quote, chart, comparison, …). The agent picks a layout
 * by id and fills a few content *slots*; the builder here lays out themed,
 * contrast-safe elements using the active style preset's role tokens and a
 * fixed margin grid. This is the preferred way to add slides — it removes the
 * need to hand-place boxes or hand-pick colors/sizes, and it never emits raw
 * authoring HTML the agent has to reason about.
 *
 * Text never overflows: every text box is emitted as a **fixed-height**,
 * vertically-aligned element and is **auto-fit** with `@chenglou/pretext` (the
 * shared measurement engine in `utils/textFit.ts`). At build time the builder
 * measures the content and bakes the largest font size from the style scale that
 * still fits the locked region; at render time that same engine measures the
 * real wrapped lines and scales the type down further if needed, so a box can
 * never spill — even after edits or once webfonts load. The agent fills content;
 * sizing and vertical placement are automatic.
 *
 * Builders are deterministic and pure (no store access): given a viewport, a
 * style preset, and slots, they return a `Partial<Slide>` that the bridge
 * normalizes and inserts. Slot text is wrapped in the small, safe HTML shell
 * Fika stores (`<p>/<ul>/<li>/<span style>` with inline size and color); the
 * inline content of each line is rendered through the shared CommonMark + texmath
 * pipeline (`utils/markdown.ts`), so markdown (`**bold**`, `_italic_`, `` `code` ``,
 * links) and inline math (`$…$`, `$$…$$`) work identically to the `text.setMarkdown`
 * path — any slot accepts mixed prose + formulas (e.g. a bullet `Příklad: $\\frac{3}{8} > \\frac{1}{8}$`).
 */
import { measureTextBlocksHeight } from '@/utils/textFit';
import type { ChartData, ChartType, PPTChartElement, PPTImageElement, PPTMermaidElement, PPTShapeElement, PPTTableElement, PPTTextElement, Slide, SlideBackground, TableCell, TableCellStyle, TextAlignVertical } from '@/types/slides';
import { containsMath, ensureInlineMathReady, normalizeAgentText, renderInlineMarkdown, splitLinesPreservingMath } from '@/utils/markdown';
import { scaleStylePreset, type FikaStyleMotif, type FikaStylePreset } from './styles';
import type { CompositionAnchor } from './composition';

/**
 * Un-normalized element inputs the builder emits. Typed as a discriminated
 * union of per-type partials so the engine's required fields are still checked,
 * while letting the bridge's `normalizeElement` fill ids/defaults on insert.
 */
export type FikaLayoutElementInput = (Partial<PPTTextElement> & {
  type: 'text';
}) | (Partial<PPTShapeElement> & {
  type: 'shape';
}) | (Partial<PPTImageElement> & {
  type: 'image';
}) | (Partial<PPTChartElement> & {
  type: 'chart';
}) | (Partial<PPTTableElement> & {
  type: 'table';
}) | (Partial<PPTMermaidElement> & {
  type: 'mermaid';
});
export type FikaLayoutBackgroundMode = 'auto' | 'feature' | 'plain';
export interface FikaLayoutSlotDef {
  name: string;
  /** Coarse shape of the value the agent should pass for this slot. */
  type: 'text' | 'bullets' | 'image' | 'chart' | 'stats' | 'rows' | 'cards' | 'steps' | 'diagram';
  required: boolean;
  description: string;
}

/**
 * One visual variant of a layout family. Variants of the same family accept
 * the same slots but compose them differently (different anchor, background
 * treatment, and motif placement), so a deck built from one style still varies
 * slide-to-slide. `anchor` declares the variant's spatial center of gravity so
 * the composition sequencer can plan a non-repeating rhythm.
 */
export interface FikaLayoutVariant {
  id: string;
  label: string;
  /** Spatial center of gravity of this variant. */
  anchor: CompositionAnchor;
  /** What it looks like / when to pick it over the family's other variants. */
  summary: string;
}
export interface FikaLayout {
  id: string;
  label: string;
  /** One-line catalog description of the composition (what it looks like). */
  summary: string;
  /** When to reach for it. */
  bestFor: string;
  /** Whether it defaults to a feature (dark) background. */
  feature: boolean;
  slots: FikaLayoutSlotDef[];
  /** The visual variants this family can build. The first is the default. */
  variants: FikaLayoutVariant[];
}


const round = Math.round;

/** True when a slot value (string, or nested array/object) carries inline math. */
function valueContainsMath(value: unknown): boolean {
  if (typeof value === 'string') return containsMath(value);
  if (Array.isArray(value)) return value.some(valueContainsMath);
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).some(valueContainsMath);
  return false;
}

/** True when any layout slot carries inline math (so the parser must preload). */
function slotsContainMath(slots: Slots): boolean {
  return Object.values(slots).some(valueContainsMath);
}
interface SpanStyle {
  size: number;
  color: string;
  font: string;
  bold?: boolean;
}
function spanHtml(value: string, style: SpanStyle): string {
  const inner = style.bold ? `<strong>${renderInlineMarkdown(value)}</strong>` : renderInlineMarkdown(value);
  return `<span style="font-size:${round(style.size)}px;color:${style.color};font-family:${style.font}">${inner}</span>`;
}
interface ParagraphStyle extends SpanStyle {
  align?: 'left' | 'center' | 'right';
}

/** Split a multi-line value into trimmed, non-empty blocks (paragraphs). */
function blocksOf(value: string): string[] {
  return splitLinesPreservingMath(value).map(line => line.trim()).filter(Boolean);
}
function paragraphsHtml(value: string, style: ParagraphStyle): string {
  const lines = blocksOf(value);
  if (!lines.length) return '';
  const align = style.align ?? 'left';
  return lines.map(line => `<p style="text-align:${align}">${spanHtml(line, style)}</p>`).join('');
}
function bulletsHtml(items: string[], style: SpanStyle, ordered = false): string {
  const tag = ordered ? 'ol' : 'ul';
  const lis = items.map(item => `<li>${spanHtml(item, style)}</li>`).join('');
  const pad = round(style.size * 1.2);
  return `<${tag} style="padding-inline-start:${pad}px;color:${style.color};font-size:${round(style.size)}px">${lis}</${tag}>`;
}

/**
 * Leading list markers agents often paste into bullet/numbered slots.
 * Layouts already render `<ul>/<ol>` markers, so leaving these in the item
 * text produces doubled dots ("• • …") / "1. 1. …".
 *
 * Covers ASCII (`-`, `*`, `+`), common unicode bullets, and simple numbering.
 * Applied repeatedly so `• • text` / `1. - text` collapse to bare content.
 */
const LEADING_LIST_MARKER_RE = /^(?:[-*+•●○◦▪▫▸►◆◇■□–—]\s+|\d{1,3}[.)]\s+|[a-zA-Z][.)]\s+|\[\s*[xX ]?\s*\]\s+)/;

/** Strip one or more leading bullet/number markers from a list item. */
export function stripLeadingListMarkers(raw: string): string {
  let text = raw.trim();
  for (let i = 0; i < 8; i++) {
    const next = text.replace(LEADING_LIST_MARKER_RE, '').trim();
    if (next === text) break;
    text = next;
  }
  return text;
}

/** Pull display text from a bullet/list item (string or `{ text|body|heading|… }`). */
function listItemText(item: unknown): string {
  if (item == null) return '';
  if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') return String(item);
  if (typeof item === 'object') {
    const rec = item as Record<string, unknown>;
    const value = rec.text ?? rec.body ?? rec.heading ?? rec.label ?? rec.value ?? rec.content;
    if (value != null && typeof value !== 'object') return String(value);
  }
  return '';
}
function toItems(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(item => stripLeadingListMarkers(normalizeAgentText(listItemText(item)))).filter(Boolean);
  }
  if (value == null) return [];
  return splitLinesPreservingMath(String(value)).map(line => stripLeadingListMarkers(normalizeAgentText(line))).filter(Boolean);
}
type Slots = Record<string, unknown>;
function reqStr(slots: Slots, key: string, layoutId: string): string {
  const value = slots[key];
  if (value == null || String(value).trim() === '') {
    throw new Error(`Layout "${layoutId}" requires a non-empty "${key}" slot.`);
  }
  return normalizeAgentText(String(value));
}
function optStr(slots: Slots, key: string): string | undefined {
  const value = slots[key];
  if (value == null || String(value).trim() === '') return undefined;
  return normalizeAgentText(String(value));
}


/** Default text-element inset (Fika uses [10,10,10,10]); subtracted when fitting. */
const TEXT_PAD = 10;
/** Horizontal space a list marker + indent steals from a bullet's text column. */
const BULLET_INDENT = 28;
/** Vertical gap Fika leaves between paragraphs (paragraphSpace default). */
const PARAGRAPH_SPACE = 6;
/** Vertical gap between list items. */
const BULLET_SPACE = 4;
interface FitInput {
  /** Plain-text blocks (paragraphs / bullet items) measured independently. */
  blocks: string[];
  /** Box width in px (inset + indent are subtracted internally). */
  width: number;
  /** Box height in px (inset is subtracted internally). */
  height: number;
  fontFamily: string;
  bold?: boolean;
  italic?: boolean;
  lineHeight: number;
  /** Largest size to try (the style-scale size for this role). */
  maxSize: number;
  /** Smallest legible size to fall back to. */
  minSize?: number;
  bulletIndent?: number;
  blockSpace?: number;
}
function measureBlocksHeight(blocks: string[], size: number, innerWidth: number, input: FitInput): number {
  return measureTextBlocksHeight(blocks.map(text => ({
    text,
    size,
    bold: input.bold,
    italic: input.italic,
    fontFamily: input.fontFamily
  })), {
    innerWidth,
    lineHeight: input.lineHeight,
    blockSpace: input.blockSpace
  });
}

/** Absolute floor — below this, prefer clipping over illegible type. */
const HARD_LEGIBILITY_FLOOR = 12;

/**
 * Auto-fit results that landed BELOW the size a slot asked for. Collected per
 * `buildLayoutSlide` call and surfaced as one warning so the agent learns the
 * slide is overloaded (the legacy behaviour shrank silently down to 10px, which
 * is how production decks ended up with 12px body copy).
 */
interface ShrinkReport {
  requestedMin: number;
  actual: number;
}
let shrinkReports: ShrinkReport[] | null = null;

/**
 * Pick the largest font size (<= maxSize, >= minSize) at which `blocks` fit the
 * box. Uses pretext to measure real wrapped height per block. Falls back to
 * maxSize if measurement is unavailable (e.g. no canvas in a non-DOM context).
 *
 * When even the requested `minSize` overflows, continues searching down to
 * {@link HARD_LEGIBILITY_FLOOR} so a narrow column shrinks instead of clipping.
 */
function fitFontSize(input: FitInput): number {
  const max = Math.max(1, round(input.maxSize));
  // A slot may shrink at most ~30% below its designed size before the slide
  // counts as overloaded; the per-slot minSize can only raise that floor.
  const policyMin = round(max * 0.7);
  const requestedMin = Math.max(1, Math.min(max, Math.max(policyMin, round(input.minSize ?? 0), HARD_LEGIBILITY_FLOOR)));
  const min = Math.min(requestedMin, HARD_LEGIBILITY_FLOOR);
  const blocks = input.blocks.map(block => block.trim()).filter(Boolean);
  const innerWidth = input.width - TEXT_PAD * 2 - (input.bulletIndent ?? 0);
  const innerHeight = input.height - TEXT_PAD * 2;
  if (!blocks.length || innerWidth <= 2 || innerHeight <= 2) return max;
  try {
    const fits = (size: number) => measureBlocksHeight(blocks, size, innerWidth, input) <= innerHeight;
    if (fits(max)) return max;
    let lo = min;
    let hi = max - 1;
    let best = min;
    while (lo <= hi) {
      const mid = lo + hi >> 1;
      if (fits(mid)) {
        best = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (best < requestedMin && shrinkReports) {
      shrinkReports.push({ requestedMin, actual: best });
    }
    return best;
  } catch {
    return max;
  }
}
function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** True when lines look like a markdown/plain list the agent stuffed into a body slot. */
function looksLikeMarkdownList(text: string): boolean {
  const lines = splitLinesPreservingMath(text).map(line => line.trim()).filter(Boolean);
  if (!lines.length) return false;
  if (lines.length === 1) return LEADING_LIST_MARKER_RE.test(lines[0]);
  const listish = lines.filter(line => LEADING_LIST_MARKER_RE.test(line)).length;
  if (listish >= Math.ceil(lines.length * 0.6)) return true;
  // Agent dumped a list into a body slot without markers (3+ short lines).
  return lines.length >= 3 && lines.every(line => wordCount(line) > 0 && wordCount(line) <= 16);
}

/** Height needed to comfortably show `lines` lines at `size` (incl. inset). */
function regionHeight(size: number, lines: number, lineHeight: number): number {
  return Math.ceil(size * lineHeight) * lines + TEXT_PAD * 2;
}


interface LayoutCtx {
  W: number;
  H: number;
  m: number;
  cw: number;
  preset: FikaStylePreset;
  feature: boolean;
  /** The active variant's composition anchor — drives asymmetric placement. */
  anchor: CompositionAnchor;
  /** Concrete variant id — rail/offset treatments key off this, not the anchor alone. */
  variantId: string;
}
interface RoleColors {
  title: string;
  body: string;
  muted: string;
  accent: string;
  rule: string;
  surface: string;
  onAccent: string;
}
function roleColors(ctx: LayoutCtx): RoleColors {
  const p = ctx.preset.palette;
  if (ctx.feature) {
    return {
      title: p.featureTitle,
      body: p.featureBody,
      muted: p.featureBody,
      accent: p.featureAccent,
      rule: p.featureAccent,
      surface: p.featureBackground,
      onAccent: p.featureBackground
    };
  }
  return {
    title: p.title,
    body: p.body,
    muted: p.muted,
    accent: p.accent,
    rule: p.rule,
    surface: p.surface,
    onAccent: p.onAccent
  };
}
interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}
interface TextBox extends Box {
  content: string;
  color: string;
  font: string;
  lineHeight?: number;
  vAlign?: TextAlignVertical;
}

/**
 * Every layout text box is emitted as a **fixed-height** element: it owns its
 * region (it never grows to fit) and is vertically aligned within it. Combined
 * with the renderer's pretext auto-fit, the type shrinks from the baked size if
 * a box would ever overflow, so layouts stay pixel-stable and never spill.
 */
function textElement(box: TextBox): Partial<PPTTextElement> & {
  type: 'text';
} {
  return {
    type: 'text',
    left: round(box.left),
    top: round(box.top),
    width: round(box.width),
    height: round(box.height),
    rotate: 0,
    content: box.content,
    defaultColor: box.color,
    defaultFontName: box.font,
    lineHeight: box.lineHeight ?? 1.35,
    fixedHeight: true,
    vAlign: box.vAlign ?? 'top'
  };
}
interface ParagraphFit {
  color: string;
  font: string;
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  vAlign?: TextAlignVertical;
  lineHeight: number;
  maxSize: number;
  minSize?: number;
}

/** Emit a paragraph text element whose font is auto-fit to the box. */
function paragraphsElement(box: Box, text: string, style: ParagraphFit): Partial<PPTTextElement> & {
  type: 'text';
} {
  const size = fitFontSize({
    blocks: blocksOf(text),
    width: box.width,
    height: box.height,
    fontFamily: style.font,
    bold: style.bold,
    italic: style.italic,
    lineHeight: style.lineHeight,
    maxSize: style.maxSize,
    minSize: style.minSize,
    blockSpace: PARAGRAPH_SPACE
  });
  return textElement({
    ...box,
    content: paragraphsHtml(text, {
      size,
      color: style.color,
      font: style.font,
      bold: style.bold,
      align: style.align
    }),
    color: style.color,
    font: style.font,
    lineHeight: style.lineHeight,
    vAlign: style.vAlign
  });
}
interface BulletFit {
  color: string;
  font: string;
  lineHeight: number;
  maxSize: number;
  minSize?: number;
  ordered?: boolean;
  vAlign?: TextAlignVertical;
}

/** Emit a bulleted text element whose font is auto-fit to the box. */
function bulletsElement(box: Box, items: string[], style: BulletFit): Partial<PPTTextElement> & {
  type: 'text';
} {
  const size = fitFontSize({
    blocks: items,
    width: box.width,
    height: box.height,
    fontFamily: style.font,
    lineHeight: style.lineHeight,
    maxSize: style.maxSize,
    minSize: style.minSize,
    bulletIndent: BULLET_INDENT,
    blockSpace: BULLET_SPACE
  });
  return textElement({
    ...box,
    content: bulletsHtml(items, {
      size,
      color: style.color,
      font: style.font
    }, style.ordered),
    color: style.color,
    font: style.font,
    lineHeight: style.lineHeight,
    vAlign: style.vAlign
  });
}
const RECT_VIEWBOX: [number, number] = [200, 200];
const RECT_PATH = 'M 0 0 L 200 0 L 200 200 L 0 200 Z';
function rectElement(opts: {
  left: number;
  top: number;
  width: number;
  height: number;
  fill: string;
}): Partial<PPTShapeElement> & {
  type: 'shape';
} {
  return {
    type: 'shape',
    left: round(opts.left),
    top: round(opts.top),
    width: round(opts.width),
    height: round(opts.height),
    rotate: 0,
    viewBox: RECT_VIEWBOX,
    path: RECT_PATH,
    fixedRatio: false,
    fill: opts.fill
  };
}
function imageElement(opts: {
  left: number;
  top: number;
  width: number;
  height: number;
  src: string;
  sourceUrl?: string;
}): Partial<PPTImageElement> & {
  type: 'image';
} {
  const element: Partial<PPTImageElement> & {
    type: 'image';
  } = {
    type: 'image',
    left: round(opts.left),
    top: round(opts.top),
    width: round(opts.width),
    height: round(opts.height),
    rotate: 0,
    src: opts.src,
    fixedRatio: false
  };
  const sourceUrl = opts.sourceUrl?.trim();
  if (sourceUrl) element.link = {
    type: 'web',
    target: sourceUrl
  };
  return element;
}

/** Resolve an image slot that may be a URL string or `{ src, sourceUrl }`. */
function resolveImageSlot(slots: Slots): {
  src?: string;
  sourceUrl?: string;
} {
  const raw = slots.image ?? slots.imageSrc ?? slots.src;
  const siblingSource = String(slots.sourceUrl ?? slots.href ?? '').trim();
  if (raw == null) {
    return siblingSource ? {
      sourceUrl: siblingSource
    } : {};
  }
  if (typeof raw === 'string') {
    const src = raw.trim();
    if (!src) return siblingSource ? {
      sourceUrl: siblingSource
    } : {};
    return siblingSource ? {
      src,
      sourceUrl: siblingSource
    } : {
      src
    };
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    const src = String(obj.src ?? obj.url ?? obj.image ?? '').trim();
    const sourceUrl = String(obj.sourceUrl ?? obj.href ?? siblingSource ?? '').trim();
    return {
      ...(src ? {
        src
      } : {}),
      ...(sourceUrl ? {
        sourceUrl
      } : {})
    };
  }
  const src = String(raw).trim();
  if (!src) return siblingSource ? {
    sourceUrl: siblingSource
  } : {};
  return siblingSource ? {
    src,
    sourceUrl: siblingSource
  } : {
    src
  };
}

/** A filled square "chip" with a vertically + horizontally centered label (e.g. a step number). */
function badgeElement(opts: {
  left: number;
  top: number;
  size: number;
  fill: string;
  text: string;
  color: string;
  font: string;
}): Partial<PPTShapeElement> & {
  type: 'shape';
} {
  const fontSize = Math.max(11, round(opts.size * 0.44));
  return {
    ...rectElement({
      left: opts.left,
      top: opts.top,
      width: opts.size,
      height: opts.size,
      fill: opts.fill
    }),
    text: {
      content: `<p style="text-align:center"><span style="font-size:${fontSize}px;color:${opts.color};font-family:${opts.font}"><strong>${opts.text}</strong></span></p>`,
      defaultFontName: opts.font,
      defaultColor: opts.color,
      align: 'middle'
    }
  };
}

/** Resolve the motif's draw color from the active palette + feature mode. */
function motifColor(ctx: LayoutCtx): string {
  const p = ctx.preset.palette;
  const role = ctx.preset.motif.colorRole;
  if (ctx.feature) return role === 'accent2' ? p.featureAccent : p.featureAccent;
  return role === 'accent2' ? p.accent2 : p.accent;
}

/**
 * Draw the style's signature motif. Used on **feature/hero** slides only
 * (title / section / closing). Content layouts must NOT call this under the
 * title — cards already have accent tops, numbered has chips, columns/lists
 * read cleaner without a competing underline. Returns elements + vertical space.
 *
 * `align: 'center'` centers the mark under a centered hero title.
 */
function motifElement(ctx: LayoutCtx, left: number, top: number, opts: {
  align?: 'left' | 'center';
} = {}): {
  elements: FikaLayoutElementInput[];
  height: number;
} {
  const motif: FikaStyleMotif = ctx.preset.motif;
  const color = motifColor(ctx);
  const size = motif.size;
  const place = (width: number) => opts.align === 'center' ? left + round((ctx.cw - width) / 2) : left;
  switch (motif.shape) {
    case 'doubleRule':
      {
        const w = round(Math.min(ctx.cw * 0.28, Math.max(size * 1.8, 120)));
        const x = place(w);
        return {
          elements: [rectElement({
            left: x,
            top,
            width: w,
            height: 2,
            fill: color
          }), rectElement({
            left: x,
            top: top + 6,
            width: w,
            height: 2,
            fill: color
          })],
          height: 10
        };
      }
    case 'hairline':
      {
        const w = round(Math.min(ctx.cw * 0.32, Math.max(size * 1.6, 140)));
        return {
          elements: [rectElement({
            left: place(w),
            top,
            width: w,
            height: 2,
            fill: color
          })],
          height: 2
        };
      }
    case 'offsetBlock':
      {
        const s = round(size * 0.5);
        return {
          elements: [rectElement({
            left: place(s),
            top: top - round(s * 0.2),
            width: s,
            height: s,
            fill: color
          })],
          height: round(s * 0.8)
        };
      }
    case 'roundedChip':
      {
        const w = round(size * 1.1);
        const h = round(size * 0.28);
        return {
          elements: [rectElement({
            left: place(w),
            top,
            width: w,
            height: h,
            fill: color
          })],
          height: h
        };
      }
    default:
      return {
        elements: [],
        height: 0
      };
  }
}

/**
 * Fill an intentional empty rail/field with a quiet, oversized motif so the
 * whitespace reads as designed breathing room — not a missing element.
 */
function emptyFieldAccent(ctx: LayoutCtx, fieldLeft: number, fieldWidth: number, contentTop: number, contentBottom: number): FikaLayoutElementInput[] {
  if (fieldWidth < ctx.W * 0.12) return [];
  const color = motifColor(ctx);
  const midY = round((contentTop + contentBottom) / 2);
  const motif = ctx.preset.motif;
  switch (motif.shape) {
    case 'doubleRule':
      {
        const w = round(Math.min(fieldWidth * 0.45, 120));
        const left = fieldLeft + round((fieldWidth - w) / 2);
        return [rectElement({
          left,
          top: midY,
          width: w,
          height: 2,
          fill: color
        })];
      }
    case 'hairline':
      {
        const w = round(Math.min(fieldWidth * 0.6, 180));
        return [rectElement({
          left: fieldLeft + round((fieldWidth - w) / 2),
          top: midY,
          width: w,
          height: 1.5,
          fill: color
        })];
      }
    case 'offsetBlock':
      {
        const s = round(Math.min(fieldWidth * 0.35, motif.size * 0.7, 72));
        return [rectElement({
          left: fieldLeft + round((fieldWidth - s) / 2),
          top: midY - round(s / 2),
          width: s,
          height: s,
          fill: color
        })];
      }
    case 'roundedChip':
      {
        const w = round(Math.min(fieldWidth * 0.45, motif.size * 1.2, 96));
        const h = round(w * 0.28);
        return [rectElement({
          left: fieldLeft + round((fieldWidth - w) / 2),
          top: midY - round(h / 2),
          width: w,
          height: h,
          fill: color
        })];
      }
    default:
      return [];
  }
}

/**
 * Eyebrow + title for **content** layouts. Deliberately draws NO style motif
 * under the title — content chrome (card tops, number chips, columns, charts)
 * already supplies the accent grammar, and a double-rule underline there reads
 * as an orphaned artifact. The signature motif belongs on feature/hero slides.
 */
function buildHeader(ctx: LayoutCtx, slots: Slots, layoutId: string): {
  elements: FikaLayoutElementInput[];
  contentTop: number;
} {
  const c = roleColors(ctx);
  const sc = ctx.preset.scale;
  const fonts = ctx.preset.fonts;
  const elements: FikaLayoutElementInput[] = [];
  let y = ctx.m;
  const eyebrow = optStr(slots, 'eyebrow');
  if (eyebrow) {
    const h = regionHeight(sc.label, 1, 1.3);
    elements.push(paragraphsElement({
      left: ctx.m,
      top: y,
      width: ctx.cw,
      height: h
    }, eyebrow.toUpperCase(), {
      color: c.accent,
      font: fonts.body,
      bold: true,
      lineHeight: 1.3,
      maxSize: sc.label,
      minSize: 11
    }));
    y += h + round(sc.label * 0.4);
  }
  const title = reqStr(slots, 'title', layoutId);
  const titleH = regionHeight(sc.title, 2, 1.18);
  elements.push(paragraphsElement({
    left: ctx.m,
    top: y,
    width: ctx.cw,
    height: titleH
  }, title, {
    color: c.title,
    font: fonts.heading,
    bold: true,
    lineHeight: 1.18,
    maxSize: sc.title,
    minSize: 22
  }));
  y += titleH + round(sc.body * 0.85);
  return {
    elements,
    contentTop: y
  };
}

/** Centered hero composition for feature slides (title/section/closing). */
function buildFeature(ctx: LayoutCtx, slots: Slots, layoutId: string, titleSize: number): FikaLayoutElementInput[] {
  const c = roleColors(ctx);
  const sc = ctx.preset.scale;
  const fonts = ctx.preset.fonts;
  const elements: FikaLayoutElementInput[] = [];
  let y = round(ctx.H * 0.26);
  const eyebrow = optStr(slots, 'eyebrow');
  if (eyebrow) {
    const h = regionHeight(sc.label, 1, 1.4);
    elements.push(paragraphsElement({
      left: ctx.m,
      top: y,
      width: ctx.cw,
      height: h
    }, eyebrow.toUpperCase(), {
      color: c.accent,
      font: fonts.body,
      bold: true,
      align: 'center',
      lineHeight: 1.4,
      maxSize: sc.label,
      minSize: 11
    }));
    y += h + round(sc.label * 0.5);
  }
  const title = reqStr(slots, 'title', layoutId);
  const titleH = regionHeight(titleSize, 2, 1.12);
  elements.push(paragraphsElement({
    left: ctx.m,
    top: y,
    width: ctx.cw,
    height: titleH
  }, title, {
    color: c.title,
    font: fonts.heading,
    bold: true,
    align: 'center',
    lineHeight: 1.12,
    maxSize: titleSize,
    minSize: 28
  }));
  y += titleH;

  const motif = motifElement(ctx, ctx.m, y + 8, {
    align: 'center'
  });
  elements.push(...motif.elements);
  y += motif.height + round(sc.sectionHeader * 0.9);
  const subtitle = optStr(slots, 'subtitle');
  if (subtitle) {
    const h = Math.max(regionHeight(sc.sectionHeader, 2, 1.3), ctx.H - ctx.m - y);
    elements.push(paragraphsElement({
      left: ctx.m,
      top: y,
      width: ctx.cw,
      height: h
    }, subtitle, {
      color: c.body,
      font: fonts.body,
      align: 'center',
      lineHeight: 1.3,
      maxSize: sc.sectionHeader,
      minSize: 16
    }));
  }
  return elements;
}


type LayoutBuilder = (ctx: LayoutCtx, slots: Slots, warnings: string[]) => FikaLayoutElementInput[];
function buildBullets(ctx: LayoutCtx, slots: Slots, warnings: string[]): FikaLayoutElementInput[] {
  const {
    elements,
    contentTop
  } = buildHeader(ctx, slots, 'bullets');
  const c = roleColors(ctx);
  const sc = ctx.preset.scale;
  const items = toItems(slots.bullets);
  if (!items.length) throw new Error('Layout "bullets" requires a non-empty "bullets" slot (array or newline-separated string).');
  if (optStr(slots, 'body')) {
    warnings.push('Both "bullets" and "body" were set — used "bullets" and ignored "body". Put prose in bullets or drop the bullets slot.');
  }
  const orderedRaw = slots.ordered;
  const ordered = orderedRaw === true || orderedRaw === 1 || orderedRaw === '1' || typeof orderedRaw === 'string' && ['true', 'yes', 'ordered', 'ol'].includes(orderedRaw.toLowerCase());
  const wantsRail = ctx.variantId === 'leftRail' || ctx.variantId === 'rightRail';
  const dense = items.length >= 4 || items.some(item => wordCount(item) > 20);
  const narrow = wantsRail && !dense;
  if (wantsRail && dense) {
    warnings.push(`Collapsed "${ctx.variantId}" → full width because the list is dense (${items.length} items / long copy). Prefer ≤3 short bullets for rail variants, or use variant "standard".`);
  }
  const listWidth = narrow ? round(ctx.cw * 0.62) : ctx.cw;
  const listLeft = narrow && ctx.variantId === 'rightRail' ? ctx.m + (ctx.cw - listWidth) : ctx.m;
  const contentBottom = ctx.H - ctx.m;
  if (narrow) {
    const fieldWidth = ctx.cw - listWidth;
    const fieldLeft = ctx.variantId === 'rightRail' ? ctx.m : listLeft + listWidth;
    elements.push(...emptyFieldAccent(ctx, fieldLeft, fieldWidth, contentTop, contentBottom));
  }
  elements.push(bulletsElement({
    left: listLeft,
    top: contentTop,
    width: listWidth,
    height: contentBottom - contentTop
  }, items, {
    color: c.body,
    font: ctx.preset.fonts.body,
    lineHeight: 1.5,
    maxSize: sc.body,
    minSize: 14,
    ordered
  }));
  return elements;
}
function buildColumn(ctx: LayoutCtx, slots: Slots, prefix: 'left' | 'right', left: number, top: number, width: number, height: number): FikaLayoutElementInput[] {
  const c = roleColors(ctx);
  const sc = ctx.preset.scale;
  const fonts = ctx.preset.fonts;
  const elements: FikaLayoutElementInput[] = [];
  let y = top;
  const heading = optStr(slots, `${prefix}Heading`);
  if (heading) {
    const h = regionHeight(sc.sectionHeader, 2, 1.2);
    elements.push(paragraphsElement({
      left,
      top: y,
      width,
      height: h
    }, heading, {
      color: c.title,
      font: fonts.heading,
      bold: true,
      lineHeight: 1.2,
      maxSize: sc.sectionHeader,
      minSize: 18
    }));
    y += h;
  }
  let items = toItems(slots[`${prefix}Bullets`]);
  const body = optStr(slots, `${prefix}Body`);
  if (!items.length && body && looksLikeMarkdownList(body)) {
    items = toItems(body);
  }
  const regionH = top + height - y;
  if (items.length) {
    elements.push(bulletsElement({
      left,
      top: y,
      width,
      height: regionH
    }, items, {
      color: c.body,
      font: fonts.body,
      lineHeight: 1.5,
      maxSize: sc.body,
      minSize: 13
    }));
  } else if (body) {
    elements.push(paragraphsElement({
      left,
      top: y,
      width,
      height: regionH
    }, body, {
      color: c.body,
      font: fonts.body,
      lineHeight: 1.45,
      maxSize: sc.body,
      minSize: 13
    }));
  }
  return elements;
}
function buildTwoColumn(ctx: LayoutCtx, slots: Slots): FikaLayoutElementInput[] {
  const {
    elements,
    contentTop
  } = buildHeader(ctx, slots, 'twoColumn');
  const gutter = round(ctx.W * 0.04);
  const colHeight = ctx.H - ctx.m - contentTop;
  const leftText = [optStr(slots, 'leftHeading') ?? '', optStr(slots, 'leftBody') ?? '', ...toItems(slots.leftBullets)].join(' ');
  const rightText = [optStr(slots, 'rightHeading') ?? '', optStr(slots, 'rightBody') ?? '', ...toItems(slots.rightBullets)].join(' ');
  const bothSided = wordCount(leftText) >= 8 && wordCount(rightText) >= 8;
  let leftShare = 0.5;
  if (ctx.variantId === 'leftWide') leftShare = bothSided ? 0.56 : 0.62;else if (ctx.variantId === 'rightWide') leftShare = bothSided ? 0.44 : 0.38;
  const leftWidth = round((ctx.cw - gutter) * leftShare);
  const rightWidth = ctx.cw - gutter - leftWidth;
  elements.push(...buildColumn(ctx, slots, 'left', ctx.m, contentTop, leftWidth, colHeight));
  elements.push(...buildColumn(ctx, slots, 'right', ctx.m + leftWidth + gutter, contentTop, rightWidth, colHeight));
  return elements;
}
function buildImageText(ctx: LayoutCtx, slots: Slots, warnings: string[]): FikaLayoutElementInput[] {
  const {
    elements,
    contentTop
  } = buildHeader(ctx, slots, 'imageText');
  const c = roleColors(ctx);
  const sc = ctx.preset.scale;
  const fonts = ctx.preset.fonts;
  const gutter = round(ctx.W * 0.04);
  const regionHeightPx = ctx.H - ctx.m - contentTop;
  const image = resolveImageSlot(slots);
  const src = image.src;
  const sideSlot = optStr(slots, 'imageSide');
  const side = sideSlot === 'left' || sideSlot === 'right' ? sideSlot : ctx.variantId === 'imageLeft' ? 'left' : 'right';
  const pushBody = (left: number, width: number, height: number) => {
    let items = toItems(slots.bullets);
    const body = optStr(slots, 'body');
    if (!items.length && body && looksLikeMarkdownList(body)) items = toItems(body);
    if (items.length) {
      if (body && !looksLikeMarkdownList(body)) {
        warnings.push('Both "bullets" and "body" were set — used "bullets" and ignored "body".');
      }
      elements.push(bulletsElement({
        left,
        top: contentTop,
        width,
        height
      }, items, {
        color: c.body,
        font: fonts.body,
        lineHeight: 1.5,
        maxSize: sc.body,
        minSize: 13
      }));
    } else if (body) {
      elements.push(paragraphsElement({
        left,
        top: contentTop,
        width,
        height
      }, body, {
        color: c.body,
        font: fonts.body,
        lineHeight: 1.5,
        maxSize: sc.body,
        minSize: 13
      }));
    }
  };
  if (!src) {
    warnings.push('Layout "imageText" has no "image" src — rendering text full width. Add an image url to use the split layout.');
    pushBody(ctx.m, ctx.cw, regionHeightPx);
    return elements;
  }
  const imageWidth = round(ctx.cw * 0.44);
  const textWidth = ctx.cw - imageWidth - gutter;
  const caption = optStr(slots, 'caption');
  const captionHeight = caption ? round(sc.caption * 2) : 0;
  const imageHeight = regionHeightPx - captionHeight - (caption ? 8 : 0);
  const imageLeft = side === 'left' ? ctx.m : ctx.m + textWidth + gutter;
  const textLeft = side === 'left' ? ctx.m + imageWidth + gutter : ctx.m;
  elements.push(imageElement({
    left: imageLeft,
    top: contentTop,
    width: imageWidth,
    height: imageHeight,
    src,
    sourceUrl: image.sourceUrl
  }));
  if (caption) {
    elements.push(paragraphsElement({
      left: imageLeft,
      top: contentTop + imageHeight + 8,
      width: imageWidth,
      height: captionHeight
    }, caption, {
      color: c.muted,
      font: fonts.body,
      lineHeight: 1.3,
      maxSize: sc.caption,
      minSize: 10
    }));
  }
  pushBody(textLeft, textWidth, regionHeightPx);
  return elements;
}
interface StatEntry {
  value: string;
  label?: string;
}
function readStats(slots: Slots): StatEntry[] {
  if (Array.isArray(slots.stats)) {
    return slots.stats.map(entry => {
      const record = (entry ?? {}) as Record<string, unknown>;
      const value = record.value ?? record.stat ?? record.number;
      return {
        value: value == null ? '' : String(value),
        label: record.label == null ? undefined : String(record.label)
      };
    }).filter(stat => stat.value !== '');
  }
  const single = slots.stat ?? slots.value;
  if (single != null && String(single).trim() !== '') {
    return [{
      value: String(single),
      label: optStr(slots, 'statLabel') ?? optStr(slots, 'label')
    }];
  }
  return [];
}
function buildBigStat(ctx: LayoutCtx, slots: Slots, warnings: string[]): FikaLayoutElementInput[] {
  const stats = readStats(slots);
  if (!stats.length) throw new Error('Layout "bigStat" requires a "stat" string or a "stats" array of { value, label }.');
  const c = roleColors(ctx);
  const sc = ctx.preset.scale;
  const fonts = ctx.preset.fonts;
  const elements: FikaLayoutElementInput[] = [];
  let top = ctx.m;
  const title = optStr(slots, 'title');
  if (title) {
    const header = buildHeader(ctx, slots, 'bigStat');
    elements.push(...header.elements);
    top = header.contentTop + round(sc.body * 0.5);
  }
  const count = Math.min(stats.length, 3);
  if (stats.length > count) {
    warnings.push(`Layout "bigStat" shows at most 3 stats — dropped ${stats.length - count} extra. Split across slides or trim to ≤3.`);
  }
  const visible = stats.slice(0, count);
  const gutter = round(ctx.W * 0.04);
  const cellWidth = round((ctx.cw - gutter * (count - 1)) / count);
  const blockHeight = ctx.H - ctx.m - top;
  const valueSize = count === 1 ? sc.display * 1.3 : count === 2 ? sc.display : sc.title * 1.3;
  const valueTop = title ? top : ctx.anchor === 'edgeAligned' ? top + round(blockHeight * 0.4) : top + round(blockHeight * 0.18);
  const valueHeight = round(valueSize * 1.4);
  visible.forEach((stat, index) => {
    const left = ctx.m + index * (cellWidth + gutter);
    elements.push(paragraphsElement({
      left,
      top: valueTop,
      width: cellWidth,
      height: valueHeight
    }, stat.value, {
      color: c.accent,
      font: fonts.heading,
      bold: true,
      align: 'center',
      lineHeight: 1.05,
      maxSize: valueSize,
      minSize: 28
    }));
    if (stat.label) {
      elements.push(paragraphsElement({
        left,
        top: valueTop + valueHeight,
        width: cellWidth,
        height: round(sc.body * 2.6)
      }, stat.label, {
        color: c.muted,
        font: fonts.body,
        align: 'center',
        lineHeight: 1.3,
        maxSize: sc.body,
        minSize: 12
      }));
    }
  });
  const footnote = optStr(slots, 'body') ?? optStr(slots, 'footnote');
  if (footnote) {
    elements.push(paragraphsElement({
      left: ctx.m,
      top: ctx.H - ctx.m - round(sc.caption * 2.4),
      width: ctx.cw,
      height: round(sc.caption * 2.4)
    }, footnote, {
      color: c.muted,
      font: fonts.body,
      align: 'center',
      lineHeight: 1.3,
      maxSize: sc.caption,
      minSize: 10
    }));
  }
  return elements;
}
function buildQuote(ctx: LayoutCtx, slots: Slots): FikaLayoutElementInput[] {
  const quote = reqStr(slots, 'quote', 'quote');
  const c = roleColors(ctx);
  const sc = ctx.preset.scale;
  const fonts = ctx.preset.fonts;
  const elements: FikaLayoutElementInput[] = [];
  const quoteSize = round(sc.sectionHeader * 1.15);
  const blockWidth = round(ctx.cw * 0.82);
  const blockLeft = ctx.anchor === 'leftHeavy' ? ctx.m : ctx.m + round((ctx.cw - blockWidth) / 2);
  const top = round(ctx.H * 0.26);
  const quoteHeight = round(sc.sectionHeader * 4.5);
  elements.push(rectElement({
    left: blockLeft,
    top,
    width: 6,
    height: round(sc.sectionHeader * 4),
    fill: c.accent
  }));
  elements.push(paragraphsElement({
    left: blockLeft + 28,
    top,
    width: blockWidth - 28,
    height: quoteHeight
  }, quote, {
    color: c.title,
    font: fonts.heading,
    lineHeight: 1.35,
    maxSize: quoteSize,
    minSize: 18
  }));
  const attribution = optStr(slots, 'attribution');
  if (attribution) {
    elements.push(paragraphsElement({
      left: blockLeft + 28,
      top: top + quoteHeight + round(sc.body * 0.4),
      width: blockWidth - 28,
      height: round(sc.body * 2.2)
    }, `— ${attribution}`, {
      color: c.muted,
      font: fonts.body,
      lineHeight: 1.3,
      maxSize: sc.body,
      minSize: 13
    }));
  }
  return elements;
}
const CHART_TYPE_ALIASES: Record<string, ChartType> = {
  bar: 'bar',
  column: 'column',
  line: 'line',
  area: 'area',
  pie: 'pie',
  ring: 'ring',
  donut: 'ring',
  radar: 'radar',
  scatter: 'scatter'
};
function buildChart(ctx: LayoutCtx, slots: Slots, warnings: string[]): FikaLayoutElementInput[] {
  const {
    elements,
    contentTop
  } = buildHeader(ctx, slots, 'chart');
  const c = roleColors(ctx);
  const sc = ctx.preset.scale;
  const fonts = ctx.preset.fonts;
  const labels = Array.isArray(slots.labels) ? slots.labels.map(String) : [];
  if (!labels.length) throw new Error('Layout "chart" requires a non-empty "labels" array.');
  const coerceNumber = (value: unknown, path: string): number => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    warnings.push(`Chart ${path} value ${JSON.stringify(value)} is not numeric — coerced to 0. Pass real numbers.`);
    return 0;
  };
  const rawSeries = slots.series;
  let series: number[][];
  if (Array.isArray(rawSeries) && rawSeries.length && Array.isArray(rawSeries[0])) {
    series = (rawSeries as unknown[][]).map((row, rowIndex) => row.map((value, colIndex) => coerceNumber(value, `series[${rowIndex}][${colIndex}]`)));
  } else if (Array.isArray(rawSeries)) {
    series = [rawSeries.map((value, colIndex) => coerceNumber(value, `series[${colIndex}]`))];
  } else {
    throw new Error('Layout "chart" requires a "series" array of numbers (or array of number arrays for multi-series).');
  }
  for (let rowIndex = 0; rowIndex < series.length; rowIndex++) {
    if (series[rowIndex].length !== labels.length) {
      warnings.push(`Chart series[${rowIndex}] length (${series[rowIndex].length}) does not match labels length (${labels.length}) — bars/points may misalign.`);
    }
  }
  const legends = Array.isArray(slots.legends) && slots.legends.length ? slots.legends.map(String) : series.map((_, index) => `Series ${index + 1}`);
  const chartType = CHART_TYPE_ALIASES[String(slots.chartType ?? 'column').toLowerCase()] ?? 'column';
  const caption = optStr(slots, 'caption');
  const captionHeight = caption ? round(sc.caption * 2.2) : 0;
  const inset = ctx.variantId === 'inset';
  const padX = inset ? round(ctx.cw * 0.08) : 0;
  const padY = inset ? round((ctx.H - ctx.m - contentTop) * 0.06) : 0;
  const chartLeft = ctx.m + padX;
  const chartWidth = ctx.cw - padX * 2;
  const chartTop = contentTop + padY;
  const chartHeight = ctx.H - ctx.m - chartTop - captionHeight - (caption ? 8 : 0);
  const data: ChartData = {
    labels,
    legends,
    series
  };
  elements.push({
    type: 'chart',
    left: round(chartLeft),
    top: round(chartTop),
    width: round(chartWidth),
    height: round(Math.max(40, chartHeight)),
    rotate: 0,
    chartType,
    data,
    themeColors: [...ctx.preset.chartColors],
    textColor: c.body
  } as Partial<PPTChartElement> & {
    type: 'chart';
  });
  if (caption) {
    elements.push(paragraphsElement({
      left: chartLeft,
      top: chartTop + Math.max(40, chartHeight) + 8,
      width: chartWidth,
      height: captionHeight
    }, caption, {
      color: c.muted,
      font: fonts.body,
      lineHeight: 1.3,
      maxSize: sc.caption,
      minSize: 10
    }));
  }
  return elements;
}

/** Pull display text from a comparison cell (string, number, or `{ text }`). */
function comparisonCellText(cell: unknown): string {
  if (cell == null) return '';
  if (typeof cell === 'string' || typeof cell === 'number' || typeof cell === 'boolean') return String(cell);
  if (typeof cell === 'object') {
    const rec = cell as Record<string, unknown>;
    if (rec.text != null) return String(rec.text);
    if (rec.value != null) return String(rec.value);
    if (rec.label != null) return String(rec.label);
  }
  return '';
}
function buildComparison(ctx: LayoutCtx, slots: Slots): FikaLayoutElementInput[] {
  const {
    elements,
    contentTop
  } = buildHeader(ctx, slots, 'comparison');
  const c = roleColors(ctx);
  const sc = ctx.preset.scale;
  const fonts = ctx.preset.fonts;
  const headers = Array.isArray(slots.headers) ? slots.headers.map(comparisonCellText) : [];
  const rows = Array.isArray(slots.rows) ? slots.rows.map(row => Array.isArray(row) ? row.map(comparisonCellText) : [comparisonCellText(row)]) : [];
  if (!rows.length) throw new Error('Layout "comparison" requires a non-empty "rows" array of row arrays.');
  const colCount = Math.max(headers.length, ...rows.map(row => row.length), 1);
  const headerStyle: TableCellStyle = {
    bold: true,
    color: c.title,
    fontname: fonts.heading,
    fontsize: `${sc.body}px`,
    align: 'center'
  };
  const bodyStyle: TableCellStyle = {
    color: c.body,
    fontname: fonts.body,
    fontsize: `${round(sc.body * 0.85)}px`
  };
  const labelStyle: TableCellStyle = {
    ...bodyStyle,
    bold: true,
    color: c.title
  };
  const data: TableCell[][] = [];
  if (headers.length) {
    data.push(Array.from({
      length: colCount
    }, (_, col) => ({
      text: headers[col] ?? '',
      style: headerStyle
    })) as unknown as TableCell[]);
  }
  for (const row of rows) {
    data.push(Array.from({
      length: colCount
    }, (_, col) => ({
      text: row[col] ?? '',
      style: col === 0 ? labelStyle : bodyStyle
    })) as unknown as TableCell[]);
  }
  elements.push({
    type: 'table',
    left: round(ctx.m),
    top: round(contentTop),
    width: round(ctx.cw),
    rotate: 0,
    data,
    colWidths: new Array(colCount).fill(1 / colCount)
  } as Partial<PPTTableElement> & {
    type: 'table';
  });
  return elements;
}
interface CardEntry {
  heading?: string;
  body?: string;
}

/** Parse a `cards`/`steps` slot: an array of { heading, body } objects or plain strings. */
function readCardEntries(value: unknown): CardEntry[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry): CardEntry | null => {
    if (entry == null) return null;
    if (typeof entry === 'string') {
      const text = stripLeadingListMarkers(normalizeAgentText(entry));
      return text ? {
        heading: text
      } : null;
    }
    const rec = entry as Record<string, unknown>;
    const headingRaw = rec.heading ?? rec.title ?? rec.label ?? rec.term ?? rec.name;
    const bodyRaw = rec.body ?? rec.text ?? rec.description ?? rec.detail ?? rec.definition ?? rec.def;
    const heading = headingRaw == null ? '' : stripLeadingListMarkers(normalizeAgentText(String(headingRaw)));
    const body = bodyRaw == null ? '' : normalizeAgentText(String(bodyRaw)).trim();
    if (!heading && !body) return null;
    return {
      heading: heading || undefined,
      body: body || undefined
    };
  }).filter((entry): entry is CardEntry => entry != null);
}

/** Title + a row/grid of up to 6 surface cards, each an accent-topped panel with a heading + blurb. */
function buildCards(ctx: LayoutCtx, slots: Slots, warnings: string[]): FikaLayoutElementInput[] {
  const {
    elements,
    contentTop
  } = buildHeader(ctx, slots, 'cards');
  const cards = readCardEntries(slots.cards ?? slots.items ?? slots.columns);
  if (!cards.length) {
    throw new Error('Layout "cards" requires a non-empty "cards" array of { heading, body } (or strings).');
  }
  const c = roleColors(ctx);
  const sc = ctx.preset.scale;
  const fonts = ctx.preset.fonts;
  const palette = ctx.preset.palette;
  const count = Math.min(cards.length, 6);
  if (cards.length > count) {
    warnings.push(`Layout "cards" shows at most 6 cards — dropped ${cards.length - count} extra. Split across slides or trim to ≤6.`);
  }
  const visible = cards.slice(0, count);
  const cols = count <= 3 ? count : Math.ceil(count / 2);
  const rows = Math.ceil(count / cols);
  const gutter = round(ctx.W * 0.025);
  const regionH = ctx.H - ctx.m - contentTop;
  const pad = Math.max(10, round(Math.min(round(ctx.cw / cols), round(regionH / rows)) * 0.08));

  const splitPanel = ctx.variantId === 'accentPanel' || ctx.anchor === 'split';
  const wantsOffset = ctx.variantId === 'leftOffset' || ctx.variantId === 'rightOffset';
  const offset = wantsOffset && count <= 3;
  if (wantsOffset && count > 3) {
    warnings.push(`Collapsed "${ctx.variantId}" → full-width grid because ${count} cards need the width. Prefer ≤3 cards for offset variants, or use variant "grid"/"accentPanel".`);
  }
  const gridWidth = offset ? round(ctx.cw * 0.68) : ctx.cw;
  const gridLeft = offset && ctx.variantId === 'rightOffset' ? ctx.m + (ctx.cw - gridWidth) : ctx.m;
  const contentBottom = ctx.H - ctx.m;
  if (offset) {
    const fieldWidth = ctx.cw - gridWidth;
    const fieldLeft = ctx.variantId === 'rightOffset' ? ctx.m : gridLeft + gridWidth;
    elements.push(...emptyFieldAccent(ctx, fieldLeft, fieldWidth, contentTop, contentBottom));
  }
  const cardW = round((gridWidth - gutter * (cols - 1)) / cols);
  const cardH = round((regionH - gutter * (rows - 1)) / rows);
  if (splitPanel) {
    elements.push(rectElement({
      left: ctx.m - round(ctx.m * 0.5),
      top: contentTop - round(sc.body),
      width: ctx.cw + ctx.m,
      height: regionH + round(sc.body * 2),
      fill: palette.accentSoft
    }));
  }
  const cardFill = splitPanel ? palette.background : palette.surface;
  const topFill = c.accent;
  const minBodyH = Math.max(16, round(sc.caption * 1.6));
  let squeezed = 0;
  visible.forEach((card, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const rowStart = row * cols;
    const rowCount = Math.min(cols, count - rowStart);
    const rowOffset = rowCount < cols ? round((cols - rowCount) * (cardW + gutter) / 2) : 0;
    const left = gridLeft + rowOffset + col * (cardW + gutter);
    const top = contentTop + row * (cardH + gutter);
    elements.push(rectElement({
      left,
      top,
      width: cardW,
      height: cardH,
      fill: cardFill
    }));
    elements.push(rectElement({
      left,
      top,
      width: cardW,
      height: 5,
      fill: topFill
    }));
    const innerLeft = left + pad;
    const innerW = cardW - pad * 2;
    const y0 = top + pad + 4;
    const bottom = top + cardH - pad;
    const available = Math.max(0, bottom - y0);
    const hasHeading = Boolean(card.heading);
    const hasBody = Boolean(card.body);
    let headingH = 0;
    let bodyH = 0;
    if (hasHeading && hasBody) {
      const idealHeading = Math.min(regionHeight(sc.sectionHeader, 2, 1.18), round(available * 0.42));
      headingH = Math.max(14, Math.min(idealHeading, available - minBodyH - 2));
      bodyH = Math.max(minBodyH, available - headingH - 2);
      if (available < idealHeading + minBodyH + 2) squeezed += 1;
    } else if (hasHeading) {
      headingH = available;
    } else if (hasBody) {
      bodyH = available;
    }
    let y = y0;
    if (hasHeading && headingH > 0) {
      elements.push(paragraphsElement({
        left: innerLeft,
        top: y,
        width: innerW,
        height: headingH
      }, card.heading as string, {
        color: c.title,
        font: fonts.heading,
        bold: true,
        lineHeight: 1.18,
        maxSize: sc.sectionHeader,
        minSize: 11
      }));
      y += headingH + 2;
    }
    if (hasBody && bodyH > 0) {
      elements.push(paragraphsElement({
        left: innerLeft,
        top: y,
        width: innerW,
        height: bodyH
      }, card.body as string, {
        color: c.body,
        font: fonts.body,
        lineHeight: 1.35,
        maxSize: sc.body,
        minSize: 10
      }));
    }
  });
  if (squeezed > 0) {
    warnings.push(`Cards are tight (${count} cards in ${rows}×${cols}) — body copy was kept but auto-fit shrunk. Prefer ≤3 cards, or shorter headings/bodies.`);
  }
  return elements;
}

/** Title + a vertical list of numbered steps, each with an accent number chip, bold lead and optional detail. */
function buildNumbered(ctx: LayoutCtx, slots: Slots, warnings: string[]): FikaLayoutElementInput[] {
  const {
    elements,
    contentTop
  } = buildHeader(ctx, slots, 'numbered');
  const steps = readCardEntries(slots.steps ?? slots.items ?? slots.bullets);
  if (!steps.length) {
    throw new Error('Layout "numbered" requires a non-empty "steps" array of { heading, body } (or strings).');
  }
  const c = roleColors(ctx);
  const sc = ctx.preset.scale;
  const fonts = ctx.preset.fonts;
  const count = Math.min(steps.length, 6);
  if (steps.length > count) {
    warnings.push(`Layout "numbered" shows at most 6 steps — dropped ${steps.length - count} extra. Split across slides or trim to ≤6.`);
  }
  const visible = steps.slice(0, count);
  const regionH = ctx.H - ctx.m - contentTop;
  const gap = round(regionH * 0.035);
  const rowH = round((regionH - gap * (count - 1)) / count);
  const badge = Math.min(rowH, round(sc.title * 1.3));
  const wantsRail = ctx.variantId === 'rightRail';
  const dense = count >= 4 || visible.some(s => wordCount(`${s.heading ?? ''} ${s.body ?? ''}`) > 28);
  const rail = wantsRail && !dense;
  if (wantsRail && dense) {
    warnings.push(`Collapsed "rightRail" → full width because the steps are dense. Prefer ≤3 short steps for the rail, or use variant "standard".`);
  }
  const railWidth = rail ? round(ctx.cw * 0.64) : ctx.cw;
  const railLeft = rail ? ctx.m + (ctx.cw - railWidth) : ctx.m;
  const textLeft = railLeft + badge + round(ctx.W * 0.022);
  const textW = railLeft + railWidth - textLeft;
  const contentBottom = ctx.H - ctx.m;
  if (rail) {
    elements.push(...emptyFieldAccent(ctx, ctx.m, ctx.cw - railWidth, contentTop, contentBottom));
  }
  visible.forEach((step, index) => {
    const top = contentTop + index * (rowH + gap);
    elements.push(badgeElement({
      left: railLeft,
      top,
      size: badge,
      fill: c.accent,
      text: String(index + 1),
      color: c.onAccent,
      font: fonts.heading
    }));
    const lead = step.heading;
    const detail = step.body;
    let y = top;
    if (lead) {
      const leadH = detail ? round(rowH * 0.46) : rowH;
      elements.push(paragraphsElement({
        left: textLeft,
        top: y,
        width: textW,
        height: leadH
      }, lead, {
        color: c.title,
        font: fonts.heading,
        bold: true,
        lineHeight: 1.2,
        maxSize: sc.sectionHeader,
        minSize: 15
      }));
      y += leadH;
    }
    if (detail) {
      const detailH = top + rowH - y;
      if (detailH > sc.caption) {
        elements.push(paragraphsElement({
          left: textLeft,
          top: y,
          width: textW,
          height: detailH
        }, detail, {
          color: c.body,
          font: fonts.body,
          lineHeight: 1.35,
          maxSize: sc.body,
          minSize: 12
        }));
      } else {
        warnings.push(`Dropped body on step ${index + 1} ("${(lead ?? '').slice(0, 40)}") — row too tight. Use fewer/shorter steps, or put detail in the heading.`);
      }
    }
  });
  return elements;
}

/** Full-bleed cover image with an opaque title band along the bottom for legibility. */
function buildImageFull(ctx: LayoutCtx, slots: Slots, warnings: string[]): FikaLayoutElementInput[] {
  const image = resolveImageSlot(slots);
  const src = image.src;
  if (!src) {
    warnings.push('Layout "imageFull" has no "image" src — falling back to a text-only feature slide. Add an image url for the full-bleed cover.');
    return buildFeature(ctx, slots, 'section', round(ctx.preset.scale.display * 0.86));
  }
  const sc = ctx.preset.scale;
  const fonts = ctx.preset.fonts;
  const palette = ctx.preset.palette;
  const elements: FikaLayoutElementInput[] = [];
  elements.push(imageElement({
    left: 0,
    top: 0,
    width: ctx.W,
    height: ctx.H,
    src,
    sourceUrl: image.sourceUrl
  }));
  const title = reqStr(slots, 'title', 'imageFull');
  const subtitle = optStr(slots, 'subtitle') ?? optStr(slots, 'caption');
  const bandH = round(ctx.H * (subtitle ? 0.32 : 0.24));
  const bandTop = ctx.H - bandH;
  elements.push(rectElement({
    left: 0,
    top: bandTop,
    width: ctx.W,
    height: bandH,
    fill: palette.featureBackground
  }));
  elements.push(rectElement({
    left: ctx.m,
    top: bandTop + round(bandH * 0.12),
    width: 120,
    height: 5,
    fill: palette.featureAccent
  }));
  let y = bandTop + round(bandH * 0.22);
  const titleH = Math.min(regionHeight(sc.title, 2, 1.15), bandTop + bandH - round(bandH * 0.14) - y);
  elements.push(paragraphsElement({
    left: ctx.m,
    top: y,
    width: ctx.cw,
    height: titleH
  }, title, {
    color: palette.featureTitle,
    font: fonts.heading,
    bold: true,
    lineHeight: 1.15,
    maxSize: sc.title,
    minSize: 20
  }));
  y += titleH + 4;
  if (subtitle && bandTop + bandH - round(bandH * 0.1) - y > sc.caption) {
    elements.push(paragraphsElement({
      left: ctx.m,
      top: y,
      width: ctx.cw,
      height: bandTop + bandH - round(bandH * 0.1) - y
    }, subtitle, {
      color: palette.featureBody,
      font: fonts.body,
      lineHeight: 1.3,
      maxSize: sc.body,
      minSize: 12
    }));
  }
  return elements;
}

function looksLikePlantUml(code: string): boolean {
  const head = code.trim().slice(0, 80).toLowerCase();
  return /@start(uml|mindmap|wbs|gantt|json|yaml|salt|flow|ditaa|nwdiag|wire|board|ebnf|regex|smetana|activity)/.test(head);
}

function buildDiagram(ctx: LayoutCtx, slots: Slots, warnings: string[]): FikaLayoutElementInput[] {
  const { elements, contentTop } = buildHeader(ctx, slots, 'diagram');
  const code = optStr(slots, 'code') ?? '';
  const image = resolveImageSlot(slots);
  if (!code && !image.src) {
    throw new Error('Layout "diagram" requires a "code" slot (Mermaid or PlantUML source) or a pre-rendered "image".');
  }
  const kind = (optStr(slots, 'kind') ?? (looksLikePlantUml(code) ? 'plantuml' : 'mermaid')).toLowerCase();
  if (kind === 'plantuml' && !image.src) {
    warnings.push('PlantUML cannot render inside the layout builder — the host should pre-render it to an image and pass slots.image. Falling back to an empty diagram region.');
  }
  const top = contentTop;
  const height = ctx.H - ctx.m - top;
  if (image.src) {
    elements.push({
      type: 'image',
      left: ctx.m,
      top,
      width: ctx.cw,
      height,
      rotate: 0,
      src: image.src,
      fixedRatio: false,
      ...(image.sourceUrl ? { link: { type: 'web', target: image.sourceUrl } } : {})
    } as Partial<PPTImageElement> & { type: 'image' });
  } else if (code && kind !== 'plantuml') {
    elements.push({
      type: 'mermaid',
      left: ctx.m,
      top,
      width: ctx.cw,
      height,
      rotate: 0,
      code
    } as Partial<PPTMermaidElement> & { type: 'mermaid' });
  }
  return elements;
}


const LAYOUT_BUILDERS: Record<string, LayoutBuilder> = {
  title: (ctx, slots) => buildFeature(ctx, slots, 'title', ctx.preset.scale.display),
  section: (ctx, slots) => buildFeature(ctx, slots, 'section', round(ctx.preset.scale.display * 0.86)),
  closing: (ctx, slots) => buildFeature(ctx, slots, 'closing', round(ctx.preset.scale.display * 0.9)),
  bullets: buildBullets,
  twoColumn: buildTwoColumn,
  imageText: buildImageText,
  bigStat: buildBigStat,
  quote: buildQuote,
  chart: buildChart,
  comparison: buildComparison,
  cards: buildCards,
  numbered: buildNumbered,
  imageFull: buildImageFull,
  diagram: buildDiagram
};

/** Shorthand for a feature slide's single centered variant. */
function centeredVariant(summary: string): FikaLayoutVariant[] {
  return [{
    id: 'centered',
    label: 'Centered',
    anchor: 'centered',
    summary
  }];
}
export const PPTX_LAYOUTS: FikaLayout[] = [{
  id: 'title',
  label: 'Title',
  summary: 'Cover slide: large centered title with optional eyebrow + subtitle on a dark feature background.',
  bestFor: 'The opening slide of the deck.',
  feature: true,
  slots: [{
    name: 'title',
    type: 'text',
    required: true,
    description: 'Presentation title.'
  }, {
    name: 'subtitle',
    type: 'text',
    required: false,
    description: 'Supporting line (audience, date, author).'
  }, {
    name: 'eyebrow',
    type: 'text',
    required: false,
    description: 'Small kicker above the title (e.g. course name).'
  }],
  variants: centeredVariant('Centered hero composition on the feature background.')
}, {
  id: 'section',
  label: 'Section divider',
  summary: 'Section break: bold heading + optional eyebrow/subtitle on a dark feature background.',
  bestFor: 'Marking the start of a new part of the deck.',
  feature: true,
  slots: [{
    name: 'title',
    type: 'text',
    required: true,
    description: 'Section heading.'
  }, {
    name: 'subtitle',
    type: 'text',
    required: false,
    description: 'One line about the section.'
  }, {
    name: 'eyebrow',
    type: 'text',
    required: false,
    description: 'Kicker such as "Part 2".'
  }],
  variants: centeredVariant('Centered section heading on the feature background.')
}, {
  id: 'closing',
  label: 'Closing',
  summary: 'Closing slide: a large sign-off line + optional subtitle/eyebrow on a dark feature background.',
  bestFor: 'The final slide — thank-you, recap, or a call to action / contact line.',
  feature: true,
  slots: [{
    name: 'title',
    type: 'text',
    required: true,
    description: 'Closing line (e.g. "Thank you" or the key takeaway).'
  }, {
    name: 'subtitle',
    type: 'text',
    required: false,
    description: 'Contact details, next steps, or a closing thought.'
  }, {
    name: 'eyebrow',
    type: 'text',
    required: false,
    description: 'Small kicker above the closing line.'
  }],
  variants: centeredVariant('Centered sign-off on the feature background.')
}, {
  id: 'bullets',
  label: 'Bulleted list',
  summary: 'Title + a single column of bullet points. The everyday content slide.',
  bestFor: 'Explaining a concept as a short list of points.',
  feature: false,
  slots: [{
    name: 'title',
    type: 'text',
    required: true,
    description: 'Slide title.'
  }, {
    name: 'bullets',
    type: 'bullets',
    required: true,
    description: 'Array of bullet strings (or newline-separated).'
  }, {
    name: 'eyebrow',
    type: 'text',
    required: false,
    description: 'Small kicker above the title.'
  }, {
    name: 'ordered',
    type: 'text',
    required: false,
    description: 'Set true for a numbered list.'
  }],
  variants: [{
    id: 'standard',
    label: 'Full width',
    anchor: 'leftHeavy',
    summary: 'Full-width list under the title — the default everyday content slide. Prefer this for 3+ bullets or longer copy.'
  }, {
    id: 'leftRail',
    label: 'Left rail',
    anchor: 'leftHeavy',
    summary: 'List narrowed to the left ~62% with a designed empty field on the right. Only for short/sparse lists (≤3 short bullets); dense copy auto-collapses to full width.'
  }, {
    id: 'rightRail',
    label: 'Right rail',
    anchor: 'rightHeavy',
    summary: 'List narrowed to the right ~62% with a designed empty field on the left. Only for short/sparse lists (≤3 short bullets); dense copy auto-collapses to full width.'
  }]
}, {
  id: 'twoColumn',
  label: 'Two columns',
  summary: 'Title + two side-by-side columns, each with an optional heading and bullets or body text.',
  bestFor: 'Compare/contrast, pros/cons, before/after, or two related groups.',
  feature: false,
  slots: [{
    name: 'title',
    type: 'text',
    required: true,
    description: 'Slide title.'
  }, {
    name: 'leftHeading',
    type: 'text',
    required: false,
    description: 'Heading for the left column.'
  }, {
    name: 'leftBullets',
    type: 'bullets',
    required: false,
    description: 'Left column bullets (array of strings). Prefer this over stuffing a markdown list into leftBody.'
  }, {
    name: 'leftBody',
    type: 'text',
    required: false,
    description: 'Left column paragraph text (if not bullets). A markdown list pasted here is auto-coerced to bullets.'
  }, {
    name: 'rightHeading',
    type: 'text',
    required: false,
    description: 'Heading for the right column.'
  }, {
    name: 'rightBullets',
    type: 'bullets',
    required: false,
    description: 'Right column bullets (array of strings). Prefer this over stuffing a markdown list into rightBody.'
  }, {
    name: 'rightBody',
    type: 'text',
    required: false,
    description: 'Right column paragraph text (if not bullets). A markdown list pasted here is auto-coerced to bullets.'
  }],
  variants: [{
    id: 'even',
    label: 'Even split',
    anchor: 'split',
    summary: 'Two equal columns side by side — safest default when both sides have real copy.'
  }, {
    id: 'leftWide',
    label: 'Left wide',
    anchor: 'leftHeavy',
    summary: 'Left column emphasised (~56–62%); the narrow side never drops below ~44% when both columns have content.'
  }, {
    id: 'rightWide',
    label: 'Right wide',
    anchor: 'rightHeavy',
    summary: 'Right column emphasised (~56–62%); the narrow side never drops below ~44% when both columns have content.'
  }]
}, {
  id: 'imageText',
  label: 'Image + text',
  summary: 'Title + an image on one side and bullets/text on the other (image side configurable).',
  bestFor: 'Pairing a visual with an explanation.',
  feature: false,
  slots: [{
    name: 'title',
    type: 'text',
    required: true,
    description: 'Slide title.'
  }, {
    name: 'image',
    type: 'image',
    required: false,
    description: 'Image url string, or { src, sourceUrl } to also attach a web link to the origin page. Omit to render text full width.'
  }, {
    name: 'imageSide',
    type: 'text',
    required: false,
    description: '"left" or "right" (default right).'
  }, {
    name: 'bullets',
    type: 'bullets',
    required: false,
    description: 'Bullets beside the image.'
  }, {
    name: 'body',
    type: 'text',
    required: false,
    description: 'Paragraph text beside the image (if not bullets).'
  }, {
    name: 'caption',
    type: 'text',
    required: false,
    description: 'Small caption under the image.'
  }],
  variants: [{
    id: 'imageRight',
    label: 'Image right',
    anchor: 'leftHeavy',
    summary: 'Text left, image on the right ~44%.'
  }, {
    id: 'imageLeft',
    label: 'Image left',
    anchor: 'rightHeavy',
    summary: 'Image on the left ~44%, text right.'
  }]
}, {
  id: 'bigStat',
  label: 'Big number(s)',
  summary: 'One to three oversized statistics with labels, optional title and footnote.',
  bestFor: 'Highlighting key metrics or headline figures.',
  feature: false,
  slots: [{
    name: 'stats',
    type: 'stats',
    required: false,
    description: 'Array of { value, label } (1–3). Or use stat/statLabel.'
  }, {
    name: 'stat',
    type: 'text',
    required: false,
    description: 'A single big value (alternative to stats).'
  }, {
    name: 'statLabel',
    type: 'text',
    required: false,
    description: 'Label for the single stat.'
  }, {
    name: 'title',
    type: 'text',
    required: false,
    description: 'Optional slide title above the stats.'
  }, {
    name: 'body',
    type: 'text',
    required: false,
    description: 'Optional footnote under the stats.'
  }],
  variants: [{
    id: 'centered',
    label: 'Centered',
    anchor: 'centered',
    summary: 'Stat(s) centered across the full width.'
  }, {
    id: 'edgeAligned',
    label: 'Edge',
    anchor: 'edgeAligned',
    summary: 'Stat(s) pushed low with a large empty field above — a quieter, editorial stat moment.'
  }]
}, {
  id: 'quote',
  label: 'Quote',
  summary: 'A large pull-quote with an accent bar and optional attribution.',
  bestFor: 'Featuring a quotation or a key takeaway sentence.',
  feature: false,
  slots: [{
    name: 'quote',
    type: 'text',
    required: true,
    description: 'The quotation text.'
  }, {
    name: 'attribution',
    type: 'text',
    required: false,
    description: 'Who said it.'
  }],
  variants: [{
    id: 'centered',
    label: 'Centered',
    anchor: 'centered',
    summary: 'Centered pull-quote block with an accent bar.'
  }, {
    id: 'leftHeavy',
    label: 'Left',
    anchor: 'leftHeavy',
    summary: 'Quote pulled left with breathing room on the right.'
  }]
}, {
  id: 'chart',
  label: 'Chart',
  summary: 'Title + a themed chart (column/bar/line/pie/area) with optional caption.',
  bestFor: 'Showing data trends or comparisons visually.',
  feature: false,
  slots: [{
    name: 'title',
    type: 'text',
    required: true,
    description: 'Slide title.'
  }, {
    name: 'chartType',
    type: 'text',
    required: false,
    description: 'column | bar | line | pie | ring | area (default column).'
  }, {
    name: 'labels',
    type: 'chart',
    required: true,
    description: 'Category labels (array of strings).'
  }, {
    name: 'series',
    type: 'chart',
    required: true,
    description: 'Numbers, or array of number arrays for multiple series.'
  }, {
    name: 'legends',
    type: 'chart',
    required: false,
    description: 'Series names (array of strings).'
  }, {
    name: 'caption',
    type: 'text',
    required: false,
    description: 'Caption / data source under the chart.'
  }],
  variants: [{
    id: 'full',
    label: 'Full width',
    anchor: 'split',
    summary: 'Chart fills the content region edge to edge.'
  }, {
    id: 'inset',
    label: 'Inset',
    anchor: 'centered',
    summary: 'Chart inset with margins on all sides — quieter, more editorial.'
  }]
}, {
  id: 'comparison',
  label: 'Comparison table',
  summary: 'Title + a compact themed table; first row is a header, first column is a row label.',
  bestFor: 'Comparing options across a few attributes.',
  feature: false,
  slots: [{
    name: 'title',
    type: 'text',
    required: true,
    description: 'Slide title.'
  }, {
    name: 'headers',
    type: 'rows',
    required: false,
    description: 'Header row cells (array of strings).'
  }, {
    name: 'rows',
    type: 'rows',
    required: true,
    description: 'Array of row arrays; first cell of each is the row label.'
  }],
  variants: [{
    id: 'full',
    label: 'Full width',
    anchor: 'split',
    summary: 'Table fills the content region.'
  }]
}, {
  id: 'cards',
  label: 'Cards',
  summary: 'Title + a row/grid of 2–6 surface cards, each an accent-topped panel with a heading and a short blurb.',
  bestFor: 'Parallel items: features, pillars, categories, options, key takeaways. A livelier alternative to a single bullet list.',
  feature: false,
  slots: [{
    name: 'title',
    type: 'text',
    required: true,
    description: 'Slide title.'
  }, {
    name: 'cards',
    type: 'cards',
    required: true,
    description: 'Array of { heading, body } (or plain strings). 2–6 items; laid out in a row, or a 2-row grid when there are 4+. A short final row is centered automatically.'
  }, {
    name: 'eyebrow',
    type: 'text',
    required: false,
    description: 'Small kicker above the title.'
  }],
  variants: [{
    id: 'grid',
    label: 'Grid',
    anchor: 'centered',
    summary: 'Balanced full-width card grid on the plain background — prefer for 4+ cards.'
  }, {
    id: 'accentPanel',
    label: 'Accent panel',
    anchor: 'split',
    summary: 'Card grid drawn on a full-height soft-accent panel — a distinct backdrop. Safe for any card count.'
  }, {
    id: 'leftOffset',
    label: 'Left offset',
    anchor: 'leftHeavy',
    summary: 'Card grid offset to the left ~68% with a designed empty field on the right. Only for ≤3 cards; 4+ auto-collapses to full width.'
  }, {
    id: 'rightOffset',
    label: 'Right offset',
    anchor: 'rightHeavy',
    summary: 'Card grid offset to the right ~68% with a designed empty field on the left. Only for ≤3 cards; 4+ auto-collapses to full width.'
  }]
}, {
  id: 'numbered',
  label: 'Numbered steps',
  summary: 'Title + a vertical list of numbered steps; each row has an accent number chip, a bold lead and optional detail.',
  bestFor: 'Ordered sequences: processes, how-to steps, ranked priorities, a roadmap. Use when order matters.',
  feature: false,
  slots: [{
    name: 'title',
    type: 'text',
    required: true,
    description: 'Slide title.'
  }, {
    name: 'steps',
    type: 'steps',
    required: true,
    description: 'Array of { heading, body } (or plain strings). 2–6 ordered steps. Do NOT prefix heading with "1."/"2." — the layout draws numbered chips automatically and strips leading numbers.'
  }, {
    name: 'eyebrow',
    type: 'text',
    required: false,
    description: 'Small kicker above the title.'
  }],
  variants: [{
    id: 'standard',
    label: 'Full width',
    anchor: 'leftHeavy',
    summary: 'Full-width numbered list — prefer for 3+ steps or longer copy.'
  }, {
    id: 'rightRail',
    label: 'Right rail',
    anchor: 'rightHeavy',
    summary: 'Numbered steps pulled to the right with a designed empty field on the left. Only for short/sparse steps; dense copy auto-collapses to full width.'
  }]
}, {
  id: 'imageFull',
  label: 'Full-bleed image',
  summary: 'A full-bleed cover image with an opaque title band along the bottom for legibility.',
  bestFor: 'A high-impact visual moment: a section opener, a hero photo, or a striking single image with a caption.',
  feature: false,
  slots: [{
    name: 'image',
    type: 'image',
    required: true,
    description: 'Image url string, or { src, sourceUrl } (sourceUrl becomes a web link on the image). Without it the slide falls back to a text-only feature layout.'
  }, {
    name: 'title',
    type: 'text',
    required: true,
    description: 'Overlaid title shown on the bottom band.'
  }, {
    name: 'subtitle',
    type: 'text',
    required: false,
    description: 'Supporting line under the title (or use caption).'
  }],
  variants: [{
    id: 'fullBleed',
    label: 'Full bleed',
    anchor: 'fullBleed',
    summary: 'Image fills the slide with a bottom title band — the loud visual moment.'
  }]
}, {
  id: 'diagram',
  label: 'Diagram',
  summary: 'Title + a rendered Mermaid (or pre-rendered PlantUML) diagram filling the body.',
  bestFor: 'Flows, cycles, actors, mindmaps, sequences, org charts — any relationship a box-and-arrow collage would butcher.',
  feature: false,
  slots: [{
    name: 'title',
    type: 'text',
    required: true,
    description: 'Slide title.'
  }, {
    name: 'code',
    type: 'diagram',
    required: false,
    description: 'Mermaid source (flowchart, mindmap, sequence, class, state, …). Required unless image is set.'
  }, {
    name: 'kind',
    type: 'text',
    required: false,
    description: "'mermaid' (default) or 'plantuml'. PlantUML must be pre-rendered by the host into the image slot."
  }, {
    name: 'image',
    type: 'image',
    required: false,
    description: 'Pre-rendered diagram (PlantUML SVG/PNG). Wins over code when both are set.'
  }, {
    name: 'eyebrow',
    type: 'text',
    required: false,
    description: 'Small kicker above the title.'
  }],
  variants: [{
    id: 'standard',
    label: 'Full width',
    anchor: 'centered',
    summary: 'Diagram fills the body under the title.'
  }]
}];
const LAYOUTS_BY_ID = new Map(PPTX_LAYOUTS.map(layout => [layout.id, layout]));
export function listLayouts(): FikaLayout[] {
  return PPTX_LAYOUTS.map(layout => ({
    ...layout,
    slots: layout.slots.map(slot => ({
      ...slot
    })),
    variants: layout.variants.map(variant => ({
      ...variant
    }))
  }));
}

/**
 * Whether a layout's job is to carry body content (bullets/columns/rows/cards/
 * steps/stats/chart) beyond a title. Title/section/closing/quote/imageFull are
 * legitimately sparse; content layouts are not. Drives the QA `contentEmpty`
 * check that blocks a title-only slide (the "empty slide 3" bug).
 */
export function layoutExpectsBody(layoutId: string): boolean {
  const layout = LAYOUTS_BY_ID.get(layoutId);
  if (!layout) return false;
  if (layoutId === 'bigStat') return false;
  const BODY_SLOT_TYPES = new Set(['bullets', 'rows', 'cards', 'steps', 'chart', 'diagram']);
  return layout.slots.some(slot => BODY_SLOT_TYPES.has(slot.type));
}

/** Resolve a variant for a layout, warning (via return) on an unknown id. */
export function resolveLayoutVariant(layout: FikaLayout, variantId?: string): {
  variant: FikaLayoutVariant;
  unknownRequested: boolean;
} {
  if (!layout.variants.length) {
    return {
      variant: {
        id: 'default',
        label: 'Default',
        anchor: 'centered',
        summary: ''
      },
      unknownRequested: false
    };
  }
  if (!variantId) return {
    variant: layout.variants[0],
    unknownRequested: false
  };
  const found = layout.variants.find(variant => variant.id === variantId);
  if (found) return {
    variant: found,
    unknownRequested: false
  };
  return {
    variant: layout.variants[0],
    unknownRequested: true
  };
}
export interface FikaLayoutBuildResult {
  slide: Partial<Slide>;
  warnings: string[];
  /** The variant actually built (id + anchor), so the caller can record it. */
  variantId: string;
  anchor: CompositionAnchor;
}


/**
 * Friendly aliases mapping the slot names agents actually guess onto the
 * canonical names each layout consumes. Resolved BEFORE building so a natural
 * name ("leftColumn", "columns") fills the real slot instead of being silently
 * dropped. Each resolution emits an info warning naming the canonical key, so
 * the agent learns the right name for next time without burning a turn.
 */
const SLOT_ALIASES: Record<string, string> = {
  leftColumn: 'leftBody',
  rightColumn: 'rightBody',
  // NOTE: `columns` is layout-aware in resolveSlotAlias (rows vs cards).
  columnHeaders: 'headers',
  content: 'body',
  text: 'body',
  left: 'leftBody',
  right: 'rightBody',
  // NOTE: `items`/`points`/`lines` are resolved layout-aware in resolveSlotAlias —
  entries: 'cards',
  items2: 'cards',
  steps2: 'steps',
  heading: 'title',
  subheading: 'subtitle',
  kicker: 'eyebrow',
  src: 'image',
  imageUrl: 'image',
  imageSrc: 'image',
  url: 'image',
  photo: 'image',
  picture: 'image',
  mermaid: 'code',
  plantuml: 'code',
  diagram: 'code',
  sourceCode: 'code',
  attribution: 'attribution',
  author: 'attribution',
  source: 'attribution',
  caption2: 'caption'
};

/** Layout-aware alias: `items` means cards/steps/bullets depending on the family. */
function resolveSlotAlias(rawKey: string, validNames: Set<string>): string | undefined {
  const listish = rawKey === 'items' || rawKey === 'points' || rawKey === 'lines';
  if (listish) {
    if (validNames.has('cards')) return 'cards';
    if (validNames.has('steps')) return 'steps';
    if (validNames.has('bullets')) return 'bullets';
    if (validNames.has('stats')) return 'stats';
    if (validNames.has('leftBullets') || validNames.has('leftBody')) return undefined;
  }
  if (rawKey === 'columns') {
    if (validNames.has('rows')) return 'rows';
    if (validNames.has('cards')) return 'cards';
    if (validNames.has('leftBody') || validNames.has('leftBullets')) return undefined;
  }
  const alias = SLOT_ALIASES[rawKey];
  return alias && validNames.has(alias) ? alias : undefined;
}

/** Expand `{ columns|items: [{heading,body|bullets}, …] }` into left/right twoColumn slots. */
function applyTwoColumnBundle(slots: Slots, rawValue: unknown, rawKey: string, warnings: string[]): boolean {
  if (!Array.isArray(rawValue) || rawValue.length < 1) return false;
  const sides = ['left', 'right'] as const;
  let applied = 0;
  for (let i = 0; i < Math.min(2, rawValue.length); i++) {
    const entry = rawValue[i];
    const side = sides[i];
    if (typeof entry === 'string' || typeof entry === 'number') {
      const key = `${side}Body`;
      if (slots[key] === undefined) {
        slots[key] = String(entry);
        applied++;
      }
      continue;
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const rec = entry as Record<string, unknown>;
    const headingKey = `${side}Heading`;
    const bulletsKey = `${side}Bullets`;
    const bodyKey = `${side}Body`;
    if (rec.heading != null && slots[headingKey] === undefined) {
      slots[headingKey] = String(rec.heading);
      applied++;
    }
    if (Array.isArray(rec.bullets) && slots[bulletsKey] === undefined) {
      slots[bulletsKey] = rec.bullets;
      applied++;
    } else if (rec.body != null && slots[bodyKey] === undefined) {
      slots[bodyKey] = String(rec.body);
      applied++;
    } else if (rec.text != null && slots[bodyKey] === undefined) {
      slots[bodyKey] = String(rec.text);
      applied++;
    }
  }
  if (applied > 0) {
    warnings.push(`Coerced "${rawKey}" into left/right twoColumn slots (${applied} field(s)). Prefer leftHeading/leftBody/rightHeading/rightBody (or *Bullets) next time.`);
    return true;
  }
  return false;
}

/**
 * Levenshtein distance (small, dependency-free) for "did you mean" suggestions.
 * Only ever runs over a handful of slot names per call, so O(n·m) is fine.
 */
function editDistance(a: string, b: string): number {
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  const prev = new Array<number>(bl + 1);
  const curr = new Array<number>(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= bl; j++) prev[j] = curr[j];
  }
  return prev[bl];
}

/** Best fuzzy match for `key` among `candidates`, or undefined when nothing is close. */
function suggestSlotName(key: string, candidates: string[]): string | undefined {
  let best: string | undefined;
  let bestScore = Infinity;
  const lowered = key.toLowerCase();
  for (const candidate of candidates) {
    const c = candidate.toLowerCase();
    let score = editDistance(lowered, c);
    if (lowered.length >= 4 && (lowered.includes(c) || c.includes(lowered))) {
      score = Math.min(score, 1);
    }
    if (score < bestScore || score === bestScore && best && Math.abs(c.length - lowered.length) < Math.abs(best.length - lowered.length)) {
      bestScore = score;
      best = candidate;
    }
  }
  return bestScore <= Math.max(2, Math.floor(key.length * 0.4)) ? best : undefined;
}

/**
 * Coerce a slot value into the shape the canonical slot expects. Returns the
 * (possibly transformed) value, or `undefined` to drop it. `warnings` collects
 * human-readable notes about each coercion so the agent sees what happened.
 */
function coerceSlotValue(canonical: string, value: unknown, warnings: string[]): unknown {
  if (canonical === 'rows' && Array.isArray(value)) {
    const isCell = (v: unknown) => v && typeof v === 'object' && 'text' in (v as Record<string, unknown>);
    const isObjArray = value.every(v => v && typeof v === 'object' && !Array.isArray(v) && !isCell(v));
    if (isObjArray && value.length && value.every(v => 'heading' in (v as Record<string, unknown>) || 'body' in (v as Record<string, unknown>))) {
      warnings.push(`Coerced "rows" from an array of { heading, body } objects into a two-column table (one row per object).`);
      return value.map(v => {
        const rec = v as Record<string, unknown>;
        return [{
          text: String(rec.heading ?? '')
        }, {
          text: String(rec.body ?? '')
        }];
      });
    }
    return value.map(row => {
      if (Array.isArray(row)) return row.map(cell => isCell(cell) ? cell : {
        text: String(cell ?? '')
      });
      return isCell(row) ? [row] : [{
        text: String(row ?? '')
      }];
    });
  }
  if (canonical === 'bullets' || canonical === 'leftBullets' || canonical === 'rightBullets') {
    if (Array.isArray(value)) {
      return value.map(listItemText).filter(Boolean);
    }
  }
  if (canonical === 'cards' && Array.isArray(value)) {
    return value.map(item => typeof item === 'string' ? {
      heading: item
    } : item);
  }
  if (canonical === 'steps' && Array.isArray(value)) {
    return value.map(item => typeof item === 'string' ? {
      heading: item
    } : item);
  }
  return value;
}
export interface SlotNormalization {
  slots: Slots;
  warnings: string[];
}

/** Sibling keys agents often put next to `image` instead of nesting into `{ src, sourceUrl }`. */
const IMAGE_SIBLING_SOURCE_KEYS = new Set(['sourceUrl', 'href', 'attributionUrl', 'originUrl']);

/**
 * Validate + normalize the slots handed to a layout. Layers of defense against
 * the "silent content drop" bug class:
 *  1. ALIASES — map natural guessed names (leftColumn, columns, …) to canonical.
 *  2. COERCION — reshape near-miss values (rows from objects, bullets from array).
 *  3. IMAGE NEST — top-level sourceUrl/href next to an image slot becomes
 *     `image: { src, sourceUrl }` (self-heal; soft advisory).
 *  4. VALIDATION — any key that still isn't a real slot becomes a loud warning
 *     with a fuzzy "did you mean X?" suggestion instead of being ignored.
 * The slot definition list (`layout.slots`) is the single source of truth for
 * what a layout consumes.
 */
export function normalizeLayoutSlots(layout: FikaLayout, rawSlots: Slots): SlotNormalization {
  const validNames = new Set(layout.slots.map(s => s.name));
  const warnings: string[] = [];
  const slots: Slots = {};
  let pendingImageSource: string | undefined;
  const isTwoColumnLayout = validNames.has('leftBody') && validNames.has('rightBody');
  for (const [rawKey, rawValue] of Object.entries(rawSlots ?? {})) {
    if (rawValue == null) continue;
    let key = rawKey;
    if (!validNames.has(key) && validNames.has('image') && IMAGE_SIBLING_SOURCE_KEYS.has(key) && (typeof rawValue === 'string' || typeof rawValue === 'number')) {
      const text = String(rawValue).trim();
      if (text) pendingImageSource = text;
      continue;
    }
    if (isTwoColumnLayout && (rawKey === 'columns' || rawKey === 'items' || rawKey === 'points' || rawKey === 'lines') && Array.isArray(rawValue)) {
      const looksLikeColumns = rawValue.some(entry => entry && typeof entry === 'object' && !Array.isArray(entry) && ('heading' in (entry as Record<string, unknown>) || 'body' in (entry as Record<string, unknown>) || 'bullets' in (entry as Record<string, unknown>) || 'text' in (entry as Record<string, unknown>)));
      if (looksLikeColumns || rawKey === 'columns') {
        if (applyTwoColumnBundle(slots, rawValue, rawKey, warnings)) continue;
      }
      if (validNames.has('leftBullets') && slots.leftBullets === undefined && rawValue.every(v => typeof v === 'string' || typeof v === 'number' || v && typeof v === 'object')) {
        slots.leftBullets = coerceSlotValue('leftBullets', rawValue, warnings);
        warnings.push(`Slot "${rawKey}" is not a "${layout.id}" slot — treated it as "leftBullets". Prefer leftBullets/rightBullets next time.`);
        continue;
      }
    }
    if (!validNames.has(key)) {
      const alias = resolveSlotAlias(key, validNames);
      if (alias) {
        key = alias;
        warnings.push(`Slot "${rawKey}" is not a "${layout.id}" slot — treated it as "${alias}". Use "${alias}" next time.`);
      } else {
        const suggestion = suggestSlotName(rawKey, [...validNames]);
        if (suggestion) {
          key = suggestion;
          warnings.push(`Unknown slot "${rawKey}" for layout "${layout.id}" — did you mean "${suggestion}"? Filled it anyway so no content was lost.`);
        } else {
          warnings.push(`Unknown slot "${rawKey}" for layout "${layout.id}" — ignored. Valid slots: ${[...validNames].join(', ')}.`);
          continue;
        }
      }
    }
    if (slots[key] === undefined) {
      slots[key] = coerceSlotValue(key, rawValue, warnings);
    }
  }
  if (pendingImageSource && validNames.has('image')) {
    const existing = slots.image;
    if (typeof existing === 'string' && existing.trim()) {
      slots.image = {
        src: existing.trim(),
        sourceUrl: pendingImageSource
      };
      warnings.push(`Nested top-level sourceUrl into image as { src, sourceUrl } for layout "${layout.id}". Pass image: { src, sourceUrl } next time.`);
    } else if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
      const obj = existing as Record<string, unknown>;
      if (!obj.sourceUrl && !obj.href) {
        slots.image = {
          ...obj,
          sourceUrl: pendingImageSource
        };
        warnings.push(`Nested top-level sourceUrl into the image object for layout "${layout.id}". Pass image: { src, sourceUrl } next time.`);
      }
    } else if (existing == null) {
      slots.sourceUrl = pendingImageSource;
    }
  }
  return {
    slots,
    warnings
  };
}

/**
 * Build a themed slide from a layout id + content slots. Pure and deterministic:
 * returns a `Partial<Slide>` (background + un-normalized elements) plus any
 * non-fatal warnings (e.g. a missing optional image). Text is auto-fit to each
 * box via pretext, so content never overflows. Throws on missing required slots
 * or an unknown layout.
 *
 * `variantId` selects the visual variant (from the layout's `variants` in the
 * catalog); an unknown id falls back to the default variant with a warning.
 *
 * Async because slots may carry inline math; KaTeX is lazy-loaded up front (only
 * when math is present) so the otherwise-synchronous builders can render it.
 */
export async function buildLayoutSlide(layoutId: string, slots: Slots, preset: FikaStylePreset, viewport: {
  width: number;
  height: number;
}, backgroundMode: FikaLayoutBackgroundMode = 'auto', variantId?: string): Promise<FikaLayoutBuildResult> {
  const layout = LAYOUTS_BY_ID.get(layoutId);
  if (!layout) {
    throw new Error(`Unknown layout "${layoutId}". Call layouts.catalog to list available layouts.`);
  }
  const warnings: string[] = [];

  let effectiveVariantId = variantId;
  const ANCHOR_NAMES: CompositionAnchor[] = ['centered', 'leftHeavy', 'rightHeavy', 'edgeAligned', 'split', 'fullBleed'];
  if (variantId && (ANCHOR_NAMES as string[]).includes(variantId)) {
    const EMPTY_FIELD_VARIANTS = new Set(['leftRail', 'rightRail', 'leftOffset', 'rightOffset']);
    const filledForAnchor = layout.variants.find(v => v.anchor === variantId && !EMPTY_FIELD_VARIANTS.has(v.id));
    const filledDefault = layout.variants.find(v => !EMPTY_FIELD_VARIANTS.has(v.id));
    const emptyForAnchor = layout.variants.find(v => v.anchor === variantId);
    const matching = filledForAnchor ?? filledDefault ?? emptyForAnchor;
    effectiveVariantId = matching?.id;
    const honoredAnchor = matching && matching.anchor === variantId && !EMPTY_FIELD_VARIANTS.has(matching.id);
    warnings.push(matching ? honoredAnchor ? `"${variantId}" is a composition ANCHOR, not a variant id — mapped it to variant "${matching.id}" (the "${layout.id}" variant with that anchor). Pass variant ids (e.g. ${layout.variants.map(v => v.id).join('/')}), not anchor names.` : `"${variantId}" is a composition ANCHOR, not a variant id — "${layout.id}" has no filled variant for that anchor, used "${matching.id}" instead of an empty-rail/offset. Pass a real variant id next time.` : `"${variantId}" is a composition ANCHOR, not a variant id, and no "${layout.id}" variant has that anchor — using the default variant. Pass one of: ${layout.variants.map(v => v.id).join(', ')}.`);
  }
  const {
    variant,
    unknownRequested
  } = resolveLayoutVariant(layout, effectiveVariantId);

  const normalized = normalizeLayoutSlots(layout, slots);
  warnings.push(...normalized.warnings);
  const safeSlots = normalized.slots;
  if (slotsContainMath(safeSlots)) await ensureInlineMathReady();
  const builder = LAYOUT_BUILDERS[layoutId];
  const W = viewport.width;
  const H = viewport.height;
  const margin = round(W * 0.06);
  let feature = backgroundMode === 'feature' ? true : backgroundMode === 'plain' ? false : layout.feature;
  // Type scales are authored for a 1000px canvas; keep text the same physical
  // size on wider imported decks instead of shrinking with the viewport.
  const scaledPreset = scaleStylePreset(preset, W);
  const ctx: LayoutCtx = {
    W,
    H,
    m: margin,
    cw: W - margin * 2,
    preset: scaledPreset,
    feature,
    anchor: variant.anchor,
    variantId: variant.id
  };
  if (unknownRequested) {
    warnings.push(`Unknown variant "${effectiveVariantId}" for layout "${layoutId}" — using the default variant "${variant.id}". Valid variant ids: ${layout.variants.map(v => v.id).join(', ')}.`);
  }
  shrinkReports = [];
  let elements: FikaLayoutElementInput[];
  try {
    elements = builder(ctx, safeSlots, warnings);
  } finally {
    const reports = shrinkReports;
    shrinkReports = null;
    if (reports && reports.length) {
      const smallest = Math.min(...reports.map(r => r.actual));
      const floor = Math.max(...reports.map(r => r.requestedMin));
      warnings.push(`[textShrunk] ${reports.length} text block${reports.length === 1 ? '' : 's'} auto-fit BELOW the legibility floor (smallest ${smallest}px, floor ${floor}px). The slide is overloaded — split it into two slides or cut the copy (fewer bullets, shorter cards) and re-issue createFromLayout with index to replace it. Do not leave text this small.`);
    }
  }
  if (layoutId === 'imageFull' && !elements.some(el => el.type === 'image')) {
    feature = true;
  }
  const background: SlideBackground = {
    type: 'solid',
    color: feature ? preset.palette.featureBackground : preset.palette.background
  };
  return {
    slide: {
      background,
      elements: elements as unknown as Slide['elements']
    },
    warnings,
    variantId: variant.id,
    anchor: variant.anchor
  };
}
