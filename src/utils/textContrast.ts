import tinycolor from 'tinycolor2';
import type { Gradient, PPTElement, PPTShapeElement, PPTTableElement, PPTTextElement, Slide, SlideBackground } from '@/types/slides';
import { getElementRange, getTableThemeColors } from '@/utils/element';
import { toPoints } from '@/utils/svgPathParser';

/**
 * Painter's-algorithm text contrast repair for AI-imported decks.
 *
 * The query engine answers "what is painted under this text?" by sampling
 * points inside the text's bounds and walking the slide's element list from
 * the text downwards (elements render in array order, so the first hit while
 * walking backwards is the topmost layer below the text). A layer only
 * counts when it actually covers the sample: empty / transparent fills and
 * outline-only (border) shapes are see-through; filled shapes are hit-tested
 * against their path (ellipse corners are not a rectangle). Themed table
 * cells sit on zinc paper with an opaque ink header (same as the renderer).
 * Images are `unknown` unless a sampled color cache is supplied (AI import
 * prefetches overlap regions via `fast-average-color`). Patterns and charts stay
 * `unknown`.
 *
 * Texts whose worst-case WCAG contrast falls below {@link CONTRAST_TRIGGER}
 * are recolored with a stark black ↔ white inversion based on the
 * *background* polarity (dark fill → white ink, light fill → black ink).
 * Text that already has the right polarity is left alone — flipping white
 * numbers on a mid-teal chip to black "improves" the WCAG ratio (2.98 → 7)
 * but looks worse. Mid-tone "barely AA" greys of the *wrong* polarity are
 * still snapped to black/white; AI decks need decisive contrast.
 */

/** Fix texts below this ratio (WCAG AA minimum for large text). */
export const CONTRAST_TRIGGER = 3;
/** Stark fixes (black/white) clear this comfortably; kept for callers/tests. */
export const CONTRAST_TARGET = 4.5;
interface ThemeColors {
  backgroundColor: string;
  fontColor: string;
}

/** Canvas-space rectangle with a sampled average hex (from `fast-average-color`). */
export interface ImageRegionPaint {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  hex: string;
}

/**
 * Prefetched image paints for one slide. Without this, photographs stay
 * `unknown` and the fixer leaves overlapping text alone.
 */
export interface ImagePaintCache {
  /** Image element id → sampled text∩image regions. */
  byElementId: Map<string, ImageRegionPaint[]>;
  /** Slide image-background regions (cover-mapped), if any. */
  slideBackground?: ImageRegionPaint[];
}
export interface ContrastContext {
  images?: ImagePaintCache;
}

/** A resolved paint: a color (optionally translucent), unevaluable, or nothing. */
type Paint = {
  kind: 'color';
  color: string;
  alpha?: number;
} | {
  kind: 'unknown';
} | null;
const OPAQUE = 0.95;
const TRANSPARENT = 0.05;
const solidPaint = (value?: string): Paint => {
  if (!value) return null;
  const c = tinycolor(value);
  if (!c.isValid()) return null;
  const alpha = c.getAlpha();
  if (alpha <= TRANSPARENT) return null;
  if (alpha < OPAQUE) return {
    kind: 'color',
    color: c.toRgbString(),
    alpha
  };
  return {
    kind: 'color',
    color: c.toHexString()
  };
};

/** Porter-Duff "source over" of an opaque-ish fg onto an opaque bg. */
const compositeOver = (fg: string, bg: string): string => {
  const f = tinycolor(fg).toRgb();
  const b = tinycolor(bg).toRgb();
  const a = f.a;
  return tinycolor({
    r: Math.round(f.r * a + b.r * (1 - a)),
    g: Math.round(f.g * a + b.g * (1 - a)),
    b: Math.round(f.b * a + b.b * (1 - a))
  }).toHexString();
};

/** Opaque hex, compositing translucent paints over white (the canvas behind a slide). */
const toOpaqueHex = (c: tinycolor.Instance): string => {
  if (c.getAlpha() < OPAQUE) return compositeOver(c.toRgbString(), '#ffffff');
  return c.toHexString();
};

/** Flatten caller surfaces to opaque hex; invalid entries dropped. */
const opaqueSurfaces = (input: string | string[] | null | undefined): string[] => {
  const list = !input ? [] : Array.isArray(input) ? input : [input];
  const out: string[] = [];
  for (const s of list) {
    const c = tinycolor(s);
    if (c.isValid()) out.push(toOpaqueHex(c));
  }
  return out;
};

/** Flatten a gradient to a single representative color (average of stops). */
export const gradientAverageColor = (gradient: Gradient): string => {
  let r = 0,
    g = 0,
    b = 0;
  const stops = gradient.colors.length ? gradient.colors : [{
    pos: 0,
    color: '#ffffff'
  }];
  for (const stop of stops) {
    const rgb = tinycolor(stop.color).toRgb();
    r += rgb.r;
    g += rgb.g;
    b += rgb.b;
  }
  const n = stops.length;
  return tinycolor({
    r: r / n,
    g: g / n,
    b: b / n
  }).toHexString();
};

/**
 * Representative surface color of a slide background. Gradients average their
 * stops; images fall back to `fallback` (usually the theme background) because
 * the pixel paint is unknown without a sample cache. Translucent solids are
 * composited over white so polarity matches what the user actually sees.
 */
export const resolveSlideSurfaceColor = (background: SlideBackground | undefined, fallback = '#ffffff'): string => {
  const fallbackHex = () => {
    const fb = tinycolor(fallback);
    return fb.isValid() ? toOpaqueHex(fb) : '#ffffff';
  };
  if (!background || background.type === 'image') return fallbackHex();
  if (background.type === 'gradient' && background.gradient) {
    return gradientAverageColor(background.gradient);
  }
  const raw = background.color || fallback;
  const c = tinycolor(raw);
  if (!c.isValid()) return fallbackHex();
  return toOpaqueHex(c);
};
type Point = {
  x: number;
  y: number;
};
const cubicAt = (p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point => {
  const u = 1 - t;
  const uu = u * u;
  const tt = t * t;
  return {
    x: uu * u * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + tt * t * p3.x,
    y: uu * u * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + tt * t * p3.y
  };
};
const cmdPoint = (cmd: {
  x?: number;
  y?: number;
}): Point | null => {
  if (typeof cmd.x !== 'number' || typeof cmd.y !== 'number') return null;
  return {
    x: cmd.x,
    y: cmd.y
  };
};

/** Flatten an SVG path into closed rings in path/viewBox coordinates. */
const pathToRings = (d: string): Point[][] => {
  try {
    const cmds = toPoints(d);
    const rings: Point[][] = [];
    let ring: Point[] = [];
    let start: Point | null = null;
    let prev: Point | null = null;
    for (const cmd of cmds) {
      if (cmd.type === 'M') {
        const p = cmdPoint(cmd);
        if (!p) continue;
        if (ring.length > 2) rings.push(ring);
        start = p;
        prev = p;
        ring = [p];
      } else if (cmd.type === 'L') {
        const p = cmdPoint(cmd);
        if (!p || !prev) continue;
        prev = p;
        ring.push(p);
      } else if (cmd.type === 'C' && prev && cmd.curve?.type === 'cubic') {
        const p3 = cmdPoint(cmd);
        const c = cmd.curve;
        if (!p3 || typeof c.x1 !== 'number' || typeof c.y1 !== 'number' || typeof c.x2 !== 'number' || typeof c.y2 !== 'number') continue;
        const p1 = {
          x: c.x1,
          y: c.y1
        };
        const p2 = {
          x: c.x2,
          y: c.y2
        };
        for (let i = 1; i <= 8; i++) ring.push(cubicAt(prev, p1, p2, p3, i / 8));
        prev = p3;
      } else if (cmd.type === 'Z') {
        if (ring.length > 2) rings.push(ring);
        ring = [];
        prev = start;
      }
    }
    if (ring.length > 2) rings.push(ring);
    return rings;
  } catch {
    return [];
  }
};
const pointInRing = (x: number, y: number, ring: Point[]): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i].y;
    const yj = ring[j].y;
    if (yi > y === yj > y) continue;
    const xi = ring[i].x;
    const xj = ring[j].x;
    if (x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/** Even-odd fill: holes (donut, frame) toggle off. */
const pathContainsPoint = (d: string, x: number, y: number): boolean => {
  const rings = pathToRings(d);
  if (!rings.length) return true;
  let inside = false;
  for (const ring of rings) {
    if (pointInRing(x, y, ring)) inside = !inside;
  }
  return inside;
};

/**
 * Map a canvas point into the shape's unrotated, unflipped local box, then
 * into viewBox path coordinates.
 */
const canvasPointToPath = (el: PPTShapeElement, x: number, y: number): Point | null => {
  const w = el.width;
  const h = el.height;
  if (w <= 0 || h <= 0) return null;
  let lx = x - el.left;
  let ly = y - el.top;
  const rot = el.rotate || 0;
  if (rot) {
    const cx = w / 2;
    const cy = h / 2;
    const rad = -rot * Math.PI / 180;
    const dx = lx - cx;
    const dy = ly - cy;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    lx = dx * cos - dy * sin + cx;
    ly = dx * sin + dy * cos + cy;
  }
  if (el.flipH) lx = w - lx;
  if (el.flipV) ly = h - ly;
  if (lx < -0.5 || ly < -0.5 || lx > w + 0.5 || ly > h + 0.5) return null;
  const [vbW, vbH] = el.viewBox;
  if (!vbW || !vbH) return {
    x: lx,
    y: ly
  };
  return {
    x: lx / w * vbW,
    y: ly / h * vbH
  };
};

/** True when the shape's fill (not its outline) covers this canvas point. */
const shapeCoversPoint = (el: PPTShapeElement, x: number, y: number): boolean => {
  const local = canvasPointToPath(el, x, y);
  if (!local) return false;
  if (!el.path) return true;
  return pathContainsPoint(el.path, local.x, local.y);
};

/** The element's own background paint (what its text sits directly on). */
const ownBackgroundPaint = (el: PPTTextElement | PPTShapeElement): Paint => {
  if (el.type === 'shape') {
    if (el.pattern) return {
      kind: 'unknown'
    };
    if (el.gradient) return {
      kind: 'color',
      color: gradientAverageColor(el.gradient)
    };
    const fill = solidPaint(el.fill);
    if (typeof el.opacity === 'number' && el.opacity < OPAQUE) {
      if (!fill || fill.kind !== 'color') return fill;
      const alpha = (fill.alpha ?? 1) * el.opacity;
      if (alpha <= TRANSPARENT) return null;
      if (alpha < OPAQUE) return {
        kind: 'color',
        color: fill.color,
        alpha
      };
      return {
        kind: 'color',
        color: tinycolor(fill.color).setAlpha(1).toHexString()
      };
    }
    return fill;
  }
  return solidPaint(el.fill);
};

/** What this element paints at a canvas point, ignoring its own text. */
const elementPaintAt = (el: PPTElement, x: number, y: number, images?: ImagePaintCache): Paint => {
  if (el.type === 'line' || el.type === 'latex' || el.type === 'audio') return null;
  const {
    minX,
    maxX,
    minY,
    maxY
  } = getElementRange(el);
  if (x < minX || x > maxX || y < minY || y > maxY) return null;
  if (el.type === 'text') return ownBackgroundPaint(el);
  if (el.type === 'shape') {
    const paint = ownBackgroundPaint(el);
    if (!paint) return null;
    return shapeCoversPoint(el, x, y) ? paint : null;
  }
  if (el.type === 'table') {
    const cell = tableCellAtPoint(el, x, y);
    if (!cell) return null;
    const hex = resolveTableCellFill(el, cell.row, cell.col);
    return hex ? {
      kind: 'color',
      color: hex
    } : null;
  }
  if (el.type === 'image') {
    const regions = images?.byElementId.get(el.id);
    if (!regions?.length) return {
      kind: 'unknown'
    };
    const hit = regions.find(r => x >= r.minX && x <= r.maxX && y >= r.minY && y <= r.maxY);
    if (!hit) return {
      kind: 'unknown'
    };
    let hex = hit.hex;
    if (el.colorMask) {
      const mask = solidPaint(el.colorMask);
      if (mask?.kind === 'color') {
        hex = mask.alpha !== undefined && mask.alpha < OPAQUE ? compositeOver(mask.color, hex) : tinycolor(mask.color).toHexString();
      }
    }
    return {
      kind: 'color',
      color: hex
    };
  }
  return {
    kind: 'unknown'
  };
};

/** CSS `.theme` paper base — stripes composite over this, not the slide. */
const THEMED_TABLE_BASE = '#fafafa';
const flattenPaint = (paint: Paint, under: string): string => {
  if (!paint || paint.kind !== 'color') return under;
  if (paint.alpha !== undefined && paint.alpha < OPAQUE) return compositeOver(paint.color, under);
  return tinycolor(paint.color).toHexString();
};

/**
 * Header / footer / column accent is the opaque theme color; body rows use a
 * fixed zinc paper pair, matching StaticTable + export.
 */
const themedStripePaint = (el: PPTTableElement, row: number, col: number): Paint => {
  const t = el.theme;
  if (!t) return null;
  const lastRow = el.data.length - 1;
  const lastCol = (el.data[row]?.length ?? 1) - 1;
  const {
    header,
    stripe,
    stripeAlt
  } = getTableThemeColors(t.color);
  if (t.rowHeader && row === 0 || t.rowFooter && row === lastRow || t.colHeader && col === 0 || t.colFooter && col === lastCol) {
    return solidPaint(header);
  }
  return solidPaint(row % 2 === 0 ? stripeAlt : stripe);
};

/** Effective opaque fill of one cell (explicit backcolor, else theme stripe). */
export const resolveTableCellFill = (el: PPTTableElement, row: number, col: number): string | null => {
  const own = solidPaint(el.data[row]?.[col]?.style?.backcolor);
  if (own?.kind === 'color' && (own.alpha === undefined || own.alpha >= OPAQUE)) {
    return tinycolor(own.color).toHexString();
  }
  const stripe = themedStripePaint(el, row, col);
  if (!stripe && !own) return null;
  let color = THEMED_TABLE_BASE;
  if (stripe) color = flattenPaint(stripe, color);
  if (own) color = flattenPaint(own, color);
  return color;
};
const tableCellAtPoint = (el: PPTTableElement, x: number, y: number): {
  row: number;
  col: number;
} | null => {
  const lx = x - el.left;
  const ly = y - el.top;
  if (lx < 0 || ly < 0 || lx > el.width || ly > el.height) return null;
  const rows = el.data.length;
  if (!rows) return null;
  const row = Math.min(rows - 1, Math.floor(ly / (el.height / rows)));
  const widths = el.colWidths;
  const cols = el.data[row]?.length ?? widths.length;
  if (!cols) return {
    row,
    col: 0
  };
  if (!widths.length) return {
    row,
    col: 0
  };
  let acc = 0;
  for (let col = 0; col < widths.length; col++) {
    acc += widths[col] * el.width;
    if (lx <= acc) return {
      row,
      col: Math.min(col, cols - 1)
    };
  }
  return {
    row,
    col: cols - 1
  };
};
const regionAt = (regions: ImageRegionPaint[] | undefined, x: number, y: number): string | null => {
  if (!regions?.length) return null;
  const hit = regions.find(r => x >= r.minX && x <= r.maxX && y >= r.minY && y <= r.maxY);
  return hit?.hex ?? null;
};
const slideBackgroundPaint = (background: SlideBackground | undefined, theme: ThemeColors, x: number, y: number, images?: ImagePaintCache): Paint => {
  if (!background) return solidPaint(theme.backgroundColor) || {
    kind: 'color',
    color: '#ffffff'
  };
  if (background.type === 'image') {
    const hex = regionAt(images?.slideBackground, x, y);
    return hex ? {
      kind: 'color',
      color: hex
    } : {
      kind: 'unknown'
    };
  }
  if (background.type === 'gradient' && background.gradient) {
    return {
      kind: 'color',
      color: gradientAverageColor(background.gradient)
    };
  }
  return solidPaint(background.color || theme.backgroundColor) || {
    kind: 'color',
    color: '#ffffff'
  };
};
export interface BackgroundQueryResult {
  /** Distinct opaque colors found under the sampled points. */
  colors: string[];
  /** True when any sample hit a layer that can't be evaluated (image, …). */
  unknown: boolean;
}

/**
 * Query engine: resolve what is painted under the element at `index`.
 * Samples the element's bounds and, per sample, returns the topmost paint of
 * the elements below it in painter order, falling back to the slide
 * background.
 */
export const queryBackgroundsUnder = (elements: PPTElement[], index: number, background: SlideBackground | undefined, theme: ThemeColors, ctx?: ContrastContext): BackgroundQueryResult => {
  const target = elements[index];
  const {
    minX,
    maxX,
    minY,
    maxY
  } = getElementRange(target);
  const w = maxX - minX;
  const h = maxY - minY;
  const samples: [number, number][] = [[minX + w * 0.5, minY + h * 0.5], [minX + w * 0.25, minY + h * 0.25], [minX + w * 0.75, minY + h * 0.25], [minX + w * 0.25, minY + h * 0.75], [minX + w * 0.75, minY + h * 0.75]];
  const colors = new Set<string>();
  let unknown = false;
  const images = ctx?.images;

  /**
   * Resolve the effective opaque color under (x,y) by walking painter order
   * downwards. Translucent solids are composited over whatever is beneath
   * them; unknown layers abort the sample.
   */
  const resolveSample = (x: number, y: number, fromIndex: number): NonNullable<Paint> => {
    for (let i = fromIndex; i >= 0; i--) {
      const paint = elementPaintAt(elements[i], x, y, images);
      if (!paint) continue;
      if (paint.kind === 'unknown') return paint;
      if (paint.alpha !== undefined && paint.alpha < OPAQUE) {
        const under = resolveSample(x, y, i - 1);
        if (under.kind !== 'color') return under;
        return {
          kind: 'color',
          color: compositeOver(paint.color, under.color)
        };
      }
      return {
        kind: 'color',
        color: tinycolor(paint.color).toHexString()
      };
    }
    const bg = slideBackgroundPaint(background, theme, x, y, images) ?? {
      kind: 'color' as const,
      color: '#ffffff'
    };
    return bg.kind === 'color' ? {
      kind: 'color',
      color: tinycolor(bg.color).toHexString()
    } : bg;
  };
  for (const [x, y] of samples) {
    const paint = resolveSample(x, y, index - 1);
    if (paint.kind === 'color') colors.add(paint.color);else unknown = true;
  }
  return {
    colors: [...colors],
    unknown
  };
};

/**
 * Return a readable replacement for `color` against every background, or
 * `null` when the original should be kept.
 *
 * Preferred ink follows the *background*: dark fill → white, light fill →
 * black. Text that already has that polarity is never flipped — white on a
 * mid-luminance teal chip is ~2.98:1 (just under {@link CONTRAST_TRIGGER})
 * but inverting it to black is the numbered-chip regression. Wrong-polarity
 * text below the trigger snaps to the preferred ink (no muddy mid-tones).
 */
export const fixColorForBackgrounds = (color: string, backgrounds: string[]): string | null => {
  const original = tinycolor(color);
  if (!original.isValid() || !backgrounds.length) return null;
  const readabilityAgainstAll = (c: tinycolor.Instance) => Math.min(...backgrounds.map(bg => tinycolor.readability(c, bg)));
  const worstBg = backgrounds.reduce((a, b) => tinycolor.readability(original, a) <= tinycolor.readability(original, b) ? a : b);
  const preferred = tinycolor(worstBg).isDark() ? '#ffffff' : '#000000';
  const alreadyPreferred = tinycolor(preferred).isDark() ? original.isDark() : original.isLight();
  if (alreadyPreferred) {
    if (readabilityAgainstAll(original) >= CONTRAST_TRIGGER) return null;
    const next = tinycolor(preferred).toHexString();
    return tinycolor(original).toHexString() === next ? null : preferred;
  }
  if (readabilityAgainstAll(original) >= CONTRAST_TRIGGER) return null;
  if (readabilityAgainstAll(tinycolor(preferred)) >= CONTRAST_TRIGGER) return preferred;
  return tinycolor.mostReadable(worstBg, ['#ffffff', '#000000']).toHexString();
};

/**
 * Theme / ProseMirror "default" inks. Explicit user colors (red, brand blue, …)
 * are not in this set and must not be hijacked by the default-ink resolver.
 */
const DEFAULT_INK_HEX = new Set(['#000000', '#ffffff', '#333333', '#18181b', '#9aa3ad']);
export const isDefaultInk = (color: string): boolean => {
  const c = tinycolor(color);
  if (!c.isValid()) return false;
  if (DEFAULT_INK_HEX.has(c.toHexString())) return true;
  const {
    s,
    v
  } = c.toHsv();
  return s < 0.2 || v < 0.3;
};

/**
 * Saturated magentas sit on tinycolor's isDark() cliff (AERT brightness 128).
 * Theme pink `#e64980` is 126; nearby picker values land at 130–133 and would
 * otherwise flip to black even though the slide still reads as a dark fill.
 */
const perceivedDark = (hex: string): boolean => {
  const t = tinycolor(hex);
  return t.getBrightness() < 140 || t.getLuminance() < 0.25;
};
export type InkPolarity = '#ffffff' | '#000000';

/**
 * Canonical default ink for a set of surfaces (solid fill or every gradient stop).
 *
 * WCAG `mostReadable` prefers black on hot pink (`#e64980` 5.63 vs 3.73) even
 * though white also clears 3:1 and is what a dark slide should use. Rule:
 * 1. If only one of black/white meets {@link CONTRAST_TRIGGER} against every
 *    surface, use that one.
 * 2. Otherwise (both pass, both fail, mixed stops) use perceived darkness of
 *    the darkest surface — not max-contrast, not `isDark()`.
 *
 * Do **not** use {@link fixColorForBackgrounds} for defaults: that helper is
 * conservative AI-import repair and will keep `#333` on magenta because 3.4:1
 * already passes the trigger.
 */
export const preferredInk = (surfaces: string | string[] | null | undefined): InkPolarity => {
  const valid = opaqueSurfaces(surfaces);
  if (!valid.length) return '#000000';
  const minRead = (ink: string) => Math.min(...valid.map(bg => tinycolor.readability(ink, bg)));
  const whiteMin = minRead('#ffffff');
  const blackMin = minRead('#000000');
  if (whiteMin >= CONTRAST_TRIGGER && blackMin < CONTRAST_TRIGGER) return '#ffffff';
  if (blackMin >= CONTRAST_TRIGGER && whiteMin < CONTRAST_TRIGGER) return '#000000';
  const darkest = valid.reduce((a, b) => tinycolor(a).getBrightness() <= tinycolor(b).getBrightness() ? a : b);
  return perceivedDark(darkest) ? '#ffffff' : '#000000';
};

/** Every evaluable paint in a slide fill (gradient stops, else the flat surface). */
export const resolveSlideSurfaceColors = (background: SlideBackground | undefined, fallback = '#ffffff'): string[] => {
  if (background?.type === 'gradient' && background.gradient?.colors.length) {
    const colors = background.gradient.colors.flatMap(stop => {
      const c = tinycolor(stop.color);
      return c.isValid() ? [toOpaqueHex(c)] : [];
    });
    if (colors.length) return colors;
  }
  return [resolveSlideSurfaceColor(background, fallback)];
};

/** Surfaces the element's text actually sits on: opaque own fill, else the slide. */
export const resolveElementSurfaces = (options: {
  fill?: string;
  background?: SlideBackground;
  fallbackSurface?: string;
} = {}): string[] => {
  const fill = options.fill ? tinycolor(options.fill) : null;
  if (fill?.isValid() && fill.getAlpha() > TRANSPARENT) return [toOpaqueHex(fill)];
  return resolveSlideSurfaceColors(options.background, options.fallbackSurface);
};

/**
 * Default body ink for new / unstyled text: strictly black or white from
 * {@link preferredInk}. Explicit saturated colors pass through.
 */
export const resolveDefaultFontColor = (color: string, surface: string | string[] | null | undefined): string => {
  const surfaces = opaqueSurfaces(surface);
  if (!surfaces.length) return color;
  if (color && !isDefaultInk(color)) return color;
  return preferredInk(surfaces);
};

/** Default font color against a slide background (and optional own fill). */
export const resolveElementDefaultFontColor = (preferred: string, options: {
  fill?: string;
  background?: SlideBackground;
  fallbackSurface?: string;
} = {}): string => resolveDefaultFontColor(preferred, resolveElementSurfaces(options));

/**
 * Chart axis / legend / label ink. Same rules as text: default greys / black /
 * white snap to {@link preferredInk} on the chart fill, else the slide.
 * Explicit saturated colors pass through.
 */
export const resolveChartLabelColor = (chart: {
  textColor?: string;
  fill?: string;
}, options: {
  background?: SlideBackground;
  fallbackSurface?: string;
  fontColor?: string;
} = {}): string => resolveElementDefaultFontColor(chart.textColor || options.fontColor || '#333', {
  fill: chart.fill,
  background: options.background,
  fallbackSurface: options.fallbackSurface
});

/** Lift only series that disappear into the slide (Ink #171717 is ~1.1:1). */
export const CHART_SERIES_CONTRAST = 2;

const seriesReadability = (color: string, surfaces: string[]) => (
  Math.min(...surfaces.map(bg => tinycolor.readability(color, bg)))
);

const seriesHueDelta = (a: string, b: string) => {
  const ha = tinycolor(a).toHsv().h;
  const hb = tinycolor(b).toHsv().h;
  return Math.min(Math.abs(ha - hb), 360 - Math.abs(ha - hb));
};

const seriesDistinct = (color: string, used: string[]) => used.every(other => {
  const luma = Math.abs(tinycolor(color).getLuminance() - tinycolor(other).getLuminance());
  return seriesHueDelta(color, other) >= 18 || luma >= 0.16;
});

const liftSeriesColor = (raw: string, surfaces: string[], used: string[], darkSurface: boolean) => {
  let next = tinycolor(raw);
  if (!next.isValid()) next = tinycolor(darkSurface ? '#7dd3fc' : '#2563eb');
  const readable = (hex: string) => !surfaces.length || seriesReadability(hex, surfaces) >= CHART_SERIES_CONTRAST;
  if (readable(next.toHexString())) return next.toHexString();
  if (darkSurface && next.toHsv().s < 0.22) {
    next = tinycolor.mix(next, '#38bdf8', 58);
  }
  for (let step = 0; step < 16; step++) {
    const hex = next.toHexString();
    if (readable(hex) && seriesDistinct(hex, used)) return hex;
    if (readable(hex)) {
      next = next.spin(32);
      continue;
    }
    next = darkSurface ? next.lighten(6).saturate(8) : next.darken(6).saturate(4);
  }
  return tinycolor.mix(next, darkSurface ? '#e2e8f0' : '#1e293b', 72).toHexString();
};

/**
 * Series fills/strokes must clear the slide (or chart fill). Ink's #171717
 * on #0c0d10 is ~1:1 — lift it instead of painting invisible bars/lines.
 */
export const resolveChartSeriesColors = (
  colors: string[] | undefined,
  surfaces: string | string[] | null | undefined,
): string[] => {
  const bgs = opaqueSurfaces(surfaces);
  const source = colors?.length ? colors : ['#3b5bdb', '#1c7ed6'];
  const darkSurface = preferredInk(bgs.length ? bgs : ['#ffffff']) === '#ffffff';
  const out: string[] = [];
  for (const color of source) out.push(liftSeriesColor(color, bgs, out, darkSurface));
  return out;
};

export const resolveChartElementSeriesColors = (
  chart: { themeColors?: string[]; fill?: string },
  options: { background?: SlideBackground; fallbackSurface?: string } = {},
) => resolveChartSeriesColors(
  chart.themeColors,
  resolveElementSurfaces({
    fill: chart.fill,
    background: options.background,
    fallbackSurface: options.fallbackSurface,
  }),
);

/**
 * Placeholder ink is the same binary polarity as body text — never a mixed grey.
 */
export const resolvePlaceholderColor = (options: {
  author?: string;
  body?: string;
  surfaces: string[];
}): InkPolarity => preferredInk(options.surfaces);

const COLOR_DECL_RE = /(^|[^-\w])color\s*:\s*([^;"']+)/gi;

/** Distinct normalized text colors declared in an HTML content string. */
export const collectHtmlTextColors = (html: string): string[] => {
  const out = new Set<string>();
  for (const match of html.matchAll(COLOR_DECL_RE)) {
    const c = tinycolor(match[2].trim());
    if (c.isValid()) out.add(c.toHexString());
  }
  return [...out];
};

/** Rewrite `color:` declarations via `replace` (return null to keep as-is). */
export const rewriteHtmlTextColors = (html: string, replace: (color: string) => string | null): string => {
  return html.replace(COLOR_DECL_RE, (full, prefix: string, value: string) => {
    const c = tinycolor(value.trim());
    if (!c.isValid()) return full;
    const next = replace(c.toHexString());
    return next ? `${prefix}color: ${next}` : full;
  });
};
interface TextTarget {
  backgrounds: string[];
  html?: string;
  defaultColor?: string;
  applyHtml: (html: string) => void;
  applyDefaultColor: (color: string) => void;
}
const resolveTargetBackgrounds = (elements: PPTElement[], index: number, el: PPTTextElement | PPTShapeElement, background: SlideBackground | undefined, theme: ThemeColors, ctx?: ContrastContext): string[] | null => {
  const own = ownBackgroundPaint(el);
  if (own?.kind === 'unknown') return null;

  if (own?.kind === 'color' && (own.alpha === undefined || own.alpha >= OPAQUE)) {
    return [tinycolor(own.color).toHexString()];
  }
  const query = queryBackgroundsUnder(elements, index, background, theme, ctx);
  if (!query.colors.length) return null;

  if (own?.kind === 'color' && own.alpha !== undefined) {
    return query.colors.map(bg => compositeOver(own.color, bg));
  }
  return query.colors;
};
const fixTarget = (target: TextTarget): number => {
  let fixes = 0;
  const cache = new Map<string, string | null>();
  const resolve = (color: string) => {
    if (!cache.has(color)) cache.set(color, fixColorForBackgrounds(color, target.backgrounds));
    return cache.get(color) ?? null;
  };
  if (target.html) {
    let changed = false;
    const nextHtml = rewriteHtmlTextColors(target.html, color => {
      const next = resolve(color);
      if (next) changed = true;
      return next;
    });
    if (changed) {
      target.applyHtml(nextHtml);
      fixes++;
    }
  }
  if (target.defaultColor) {
    const next = resolve(tinycolor(target.defaultColor).toHexString());
    if (next) {
      target.applyDefaultColor(next);
      fixes++;
    }
  }
  return fixes;
};
export type ContrastAction = {
  kind: 'fix';
  slideIndex: number;
  elementIndex: number;
  elementType: 'text' | 'shape' | 'latex' | 'table';
  target: 'html' | 'defaultColor' | 'latex' | 'tableCell';
  from: string;
  to: string;
  backgrounds: string[];
  ratioBefore: number;
  ratioAfter: number;
  snippet?: string;
} | {
  kind: 'skip';
  slideIndex: number;
  elementIndex: number;
  elementType: 'text' | 'shape' | 'latex' | 'table';
  reason: string;
  colors?: string[];
  backgrounds?: string[];
  snippet?: string;
};
const snippetOf = (html?: string) => {
  if (!html) return undefined;
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
};
const worstRatio = (color: string, backgrounds: string[]) => Math.min(...backgrounds.map(bg => tinycolor.readability(color, bg)));

/**
 * Same decisions as {@link fixSlideTextContrast}, but returns a per-target
 * action log (fixes + skips) instead of mutating. Used for verification.
 */
export const diagnoseSlideTextContrast = (slide: Slide, theme: ThemeColors, slideIndex = 0, ctx?: ContrastContext): ContrastAction[] => {
  const elements = slide.elements;
  const actions: ContrastAction[] = [];
  const noteSkip = (elementIndex: number, elementType: ContrastAction['elementType'], reason: string, extra?: {
    colors?: string[];
    backgrounds?: string[];
    snippet?: string;
  }) => {
    actions.push({
      kind: 'skip',
      slideIndex,
      elementIndex,
      elementType,
      reason,
      ...extra
    });
  };
  const noteFixes = (elementIndex: number, elementType: 'text' | 'shape', backgrounds: string[], html: string | undefined, defaultColor: string | undefined) => {
    const htmlColors = html ? collectHtmlTextColors(html) : [];
    if (!htmlColors.length && !defaultColor) {
      noteSkip(elementIndex, elementType, 'no text colors to evaluate', {
        backgrounds,
        snippet: snippetOf(html)
      });
      return;
    }
    for (const from of htmlColors) {
      const to = fixColorForBackgrounds(from, backgrounds);
      if (!to) {
        noteSkip(elementIndex, elementType, 'readable (above trigger)', {
          colors: [from],
          backgrounds,
          snippet: snippetOf(html)
        });
        continue;
      }
      actions.push({
        kind: 'fix',
        slideIndex,
        elementIndex,
        elementType,
        target: 'html',
        from,
        to,
        backgrounds: [...backgrounds],
        ratioBefore: +worstRatio(from, backgrounds).toFixed(2),
        ratioAfter: +worstRatio(to, backgrounds).toFixed(2),
        snippet: snippetOf(html)
      });
    }
    if (defaultColor) {
      const from = tinycolor(defaultColor).toHexString();
      const to = fixColorForBackgrounds(from, backgrounds);
      if (!to) {
        noteSkip(elementIndex, elementType, 'readable (above trigger)', {
          colors: [from],
          backgrounds,
          snippet: snippetOf(html)
        });
      } else {
        actions.push({
          kind: 'fix',
          slideIndex,
          elementIndex,
          elementType,
          target: 'defaultColor',
          from,
          to,
          backgrounds: [...backgrounds],
          ratioBefore: +worstRatio(from, backgrounds).toFixed(2),
          ratioAfter: +worstRatio(to, backgrounds).toFixed(2),
          snippet: snippetOf(html)
        });
      }
    }
  };
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el.type === 'text') {
      const own = ownBackgroundPaint(el);
      if (own?.kind === 'unknown') {
        noteSkip(i, 'text', 'own fill unevaluable (translucent/pattern)', {
          snippet: snippetOf(el.content)
        });
        continue;
      }
      const backgrounds = resolveTargetBackgrounds(elements, i, el, slide.background, theme, ctx);
      if (!backgrounds) {
        const q = queryBackgroundsUnder(elements, i, slide.background, theme, ctx);
        noteSkip(i, 'text', q.unknown ? 'background unknown (image/chart/…)' : 'no background colors resolved', {
          snippet: snippetOf(el.content)
        });
        continue;
      }
      noteFixes(i, 'text', backgrounds, el.content, el.defaultColor);
    } else if (el.type === 'shape' && el.text?.content) {
      const own = ownBackgroundPaint(el);
      if (own?.kind === 'unknown') {
        noteSkip(i, 'shape', 'own fill unevaluable (translucent/pattern)', {
          snippet: snippetOf(el.text.content)
        });
        continue;
      }
      const backgrounds = resolveTargetBackgrounds(elements, i, el, slide.background, theme, ctx);
      if (!backgrounds) {
        const q = queryBackgroundsUnder(elements, i, slide.background, theme, ctx);
        noteSkip(i, 'shape', q.unknown ? 'background unknown (image/chart/…)' : 'no background colors resolved', {
          snippet: snippetOf(el.text.content)
        });
        continue;
      }
      noteFixes(i, 'shape', backgrounds, el.text.content, el.text.defaultColor);
    } else if (el.type === 'latex') {
      const query = queryBackgroundsUnder(elements, i, slide.background, theme, ctx);
      if (!query.colors.length) {
        noteSkip(i, 'latex', query.unknown ? 'background unknown' : 'no background colors resolved');
        continue;
      }
      const from = tinycolor(el.color).toHexString();
      const to = fixColorForBackgrounds(from, query.colors);
      if (!to) {
        noteSkip(i, 'latex', 'readable (above trigger)', {
          colors: [from],
          backgrounds: query.colors
        });
        continue;
      }
      actions.push({
        kind: 'fix',
        slideIndex,
        elementIndex: i,
        elementType: 'latex',
        target: 'latex',
        from,
        to,
        backgrounds: query.colors,
        ratioBefore: +worstRatio(from, query.colors).toFixed(2),
        ratioAfter: +worstRatio(to, query.colors).toFixed(2)
      });
    } else if (el.type === 'table') {
      for (let r = 0; r < el.data.length; r++) {
        for (let c = 0; c < el.data[r].length; c++) {
          const cell = el.data[r][c];
          const back = resolveTableCellFill(el, r, c);
          if (!back) {
            noteSkip(i, 'table', 'cell has no opaque fill', {
              snippet: cell.text?.slice(0, 40)
            });
            continue;
          }
          const from = tinycolor(cell.style?.color || theme.fontColor).toHexString();
          const to = fixColorForBackgrounds(from, [back]);
          if (!to) {
            noteSkip(i, 'table', 'readable (above trigger)', {
              colors: [from],
              backgrounds: [back],
              snippet: cell.text?.slice(0, 40)
            });
            continue;
          }
          actions.push({
            kind: 'fix',
            slideIndex,
            elementIndex: i,
            elementType: 'table',
            target: 'tableCell',
            from,
            to,
            backgrounds: [back],
            ratioBefore: +worstRatio(from, [back]).toFixed(2),
            ratioAfter: +worstRatio(to, [back]).toFixed(2),
            snippet: cell.text?.slice(0, 40)
          });
        }
      }
    }
  }
  return actions;
};

/**
 * Repair unreadable text colors on a slide in place. Returns the number of
 * applied fixes. Used for AI-generated imports only — user background changes
 * go through {@link applySlideBackgroundWithContrast} / {@link preferredInk}.
 */
export const fixSlideTextContrast = (slide: Slide, theme: ThemeColors, ctx?: ContrastContext): number => {
  const elements = slide.elements;
  let fixes = 0;
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el.type === 'text') {
      const backgrounds = resolveTargetBackgrounds(elements, i, el, slide.background, theme, ctx);
      if (!backgrounds) continue;
      fixes += fixTarget({
        backgrounds,
        html: el.content,
        defaultColor: el.defaultColor,
        applyHtml: html => el.content = html,
        applyDefaultColor: color => el.defaultColor = color
      });
      if (el.placeholder) {
        el.placeholderColor = resolvePlaceholderColor({
          author: el.placeholderColor,
          body: el.defaultColor,
          surfaces: backgrounds
        });
      }
    } else if (el.type === 'shape' && el.text?.content) {
      const text = el.text;
      const backgrounds = resolveTargetBackgrounds(elements, i, el, slide.background, theme, ctx);
      if (!backgrounds) continue;
      fixes += fixTarget({
        backgrounds,
        html: text.content,
        defaultColor: text.defaultColor,
        applyHtml: html => text.content = html,
        applyDefaultColor: color => text.defaultColor = color
      });
    } else if (el.type === 'latex') {
      const query = queryBackgroundsUnder(elements, i, slide.background, theme, ctx);
      if (!query.colors.length) continue;
      const next = fixColorForBackgrounds(el.color, query.colors);
      if (next) {
        el.color = next;
        fixes++;
      }
    } else if (el.type === 'table') {
      for (let r = 0; r < el.data.length; r++) {
        for (let c = 0; c < el.data[r].length; c++) {
          const cell = el.data[r][c];
          const back = resolveTableCellFill(el, r, c);
          if (!back) continue;
          const color = cell.style?.color || theme.fontColor;
          const next = fixColorForBackgrounds(color, [back]);
          if (next) {
            cell.style = {
              ...cell.style,
              color: next
            };
            fixes++;
          }
        }
      }
    }
  }
  return fixes;
};

/**
 * Surfaces to retint when the *slide* fill changes. Opaque own fills (numbered
 * chips, colored cards) are skipped — their text polarity is vs the shape, not
 * the slide, and {@link preferredInk} would flip white-on-teal to black.
 * Translucent fills composite over the new slide paint.
 */
const slideRetintSurfaces = (el: PPTTextElement | PPTShapeElement, slideSurfaces: string[]): string[] | null => {
  const own = ownBackgroundPaint(el);
  if (own?.kind === 'unknown') return null;
  if (own?.kind === 'color' && (own.alpha === undefined || own.alpha >= OPAQUE)) return null;
  if (own?.kind === 'color' && own.alpha !== undefined) {
    return slideSurfaces.map(bg => compositeOver(own.color, bg));
  }
  return slideSurfaces;
};
export const rewriteDefaultInksInHtml = (html: string, ink: string): string => {
  const next = tinycolor(ink).toHexString();
  return rewriteHtmlTextColors(html, color => {
    if (!isDefaultInk(color)) return null;
    return tinycolor(color).toHexString() === next ? null : next;
  });
};

/**
 * Clone a slide and snap *default* ink (theme grey / black / white) to
 * {@link preferredInk} for the new slide fill. Explicit colors and text on
 * opaque own fills are left alone. Mutates nothing on the input.
 */
export const applySlideBackgroundWithContrast = (slide: Slide, theme: ThemeColors): Slide => {
  const next: Slide = JSON.parse(JSON.stringify(slide));
  const slideSurfaces = resolveSlideSurfaceColors(next.background, theme.backgroundColor);
  const font = theme.fontColor || '#333333';
  for (const el of next.elements) {
    if (el.type === 'text') {
      const surfaces = slideRetintSurfaces(el, slideSurfaces);
      if (!surfaces) continue;
      const ink = resolveDefaultFontColor(el.defaultColor || font, surfaces);
      if (!el.defaultColor || isDefaultInk(el.defaultColor)) el.defaultColor = ink;
      el.content = rewriteDefaultInksInHtml(el.content, ink);
      if (el.placeholder) {
        el.placeholderColor = resolvePlaceholderColor({
          author: el.placeholderColor,
          surfaces
        });
      }
    } else if (el.type === 'shape' && el.text) {
      const surfaces = slideRetintSurfaces(el, slideSurfaces);
      if (!surfaces) continue;
      const ink = resolveDefaultFontColor(el.text.defaultColor || font, surfaces);
      if (!el.text.defaultColor || isDefaultInk(el.text.defaultColor)) el.text.defaultColor = ink;
      el.text.content = rewriteDefaultInksInHtml(el.text.content, ink);
    } else if (el.type === 'latex') {
      if (!isDefaultInk(el.color)) continue;
      el.color = resolveDefaultFontColor(el.color, slideSurfaces);
    } else if (el.type === 'chart') {
      if (el.textColor && !isDefaultInk(el.textColor)) continue;
      el.textColor = resolveChartLabelColor(el, {
        background: next.background,
        fallbackSurface: theme.backgroundColor,
        fontColor: font
      });
    }
  }
  return next;
};
