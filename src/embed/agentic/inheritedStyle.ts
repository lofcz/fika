/**
 * Style inheritance for decks that were not built with a preset.
 *
 * Imported `.pptx` files (python-pptx2 builds, teacher uploads) carry no
 * `theme.styleId`, so every layout the agent adds used to fall back to the
 * default preset — Georgia/navy slides landing in a Calibri/green deck. This
 * module reads the deck that is already there (fonts, ink, backgrounds, panel
 * fills, type sizes) and derives a full {@link FikaStylePreset} from it, so a
 * new layout slide looks like it was always part of the deck.
 */
import tinycolor from 'tinycolor2';
import type { PPTElement, PPTTextElement, Slide, SlideTheme } from '@/types/slides';
import { DEFAULT_STYLE_ID, resolveStylePreset, type FikaStylePreset } from './styles';

export const INHERITED_STYLE_ID = 'inherited';

interface Run {
  size: number;
  font?: string;
  color?: string;
  weight: number;
}

const SIZE_RE = /font-size:\s*(?:calc\(var\(--text-fit-scale,\s*1\)\s*\*\s*)?([0-9.]+)px/i;
const FONT_RE = /font-family:\s*([^;"']+)/i;
const COLOR_RE = /(?:^|[^-])color:\s*(#[0-9a-f]{3,8}|rgba?\([^)]*\))/i;
const SPAN_RE = /<span([^>]*)>([\s\S]*?)<\/span>/gi;

function textLength(html: string): number {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim().length;
}

/** Flatten a text element into styled runs weighted by visible character count. */
function runsOf(el: PPTTextElement): Run[] {
  const runs: Run[] = [];
  const html = el.content || '';
  let match: RegExpExecArray | null;
  SPAN_RE.lastIndex = 0;
  while ((match = SPAN_RE.exec(html))) {
    const attrs = match[1];
    const inner = match[2];
    // Nested spans: only count the innermost text so a size on the outer span
    // does not double-weight the same characters.
    if (/<span/i.test(inner)) continue;
    const weight = textLength(inner);
    if (!weight) continue;
    const size = Number(SIZE_RE.exec(attrs)?.[1]);
    // Walk outwards for attributes the innermost span did not set.
    const context = html.slice(0, match.index);
    const font = FONT_RE.exec(attrs)?.[1] ?? lastMatch(FONT_RE, context) ?? el.defaultFontName;
    const color = COLOR_RE.exec(attrs)?.[1] ?? lastMatch(COLOR_RE, context) ?? el.defaultColor;
    runs.push({
      size: Number.isFinite(size) && size > 0 ? size : lastSize(context) ?? 0,
      font: cleanFont(font),
      color: normalizeColor(color),
      weight,
    });
  }
  if (!runs.length) {
    const weight = textLength(html);
    if (weight) runs.push({ size: 0, font: cleanFont(el.defaultFontName), color: normalizeColor(el.defaultColor), weight });
  }
  return runs;
}

function lastMatch(re: RegExp, text: string): string | undefined {
  const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let found: string | undefined;
  let m: RegExpExecArray | null;
  while ((m = global.exec(text))) found = m[1];
  return found;
}

function lastSize(text: string): number | undefined {
  const value = lastMatch(SIZE_RE, text);
  const size = Number(value);
  return Number.isFinite(size) && size > 0 ? size : undefined;
}

function cleanFont(font?: string): string | undefined {
  if (!font) return undefined;
  const first = font.split(',')[0]?.trim().replace(/^["']|["']$/g, '');
  return first || undefined;
}

function normalizeColor(color?: string): string | undefined {
  if (!color) return undefined;
  const c = tinycolor(color);
  if (!c.isValid() || c.getAlpha() < 0.5) return undefined;
  return c.toHexString().toUpperCase();
}

function isNeutralLight(hex: string): boolean {
  const c = tinycolor(hex);
  return c.getLuminance() > 0.8 && c.toHsv().s < 0.15;
}

function mostWeighted(counter: Map<string, number>): string | undefined {
  let best: string | undefined;
  let bestWeight = 0;
  for (const [key, weight] of counter) {
    if (weight > bestWeight) {
      best = key;
      bestWeight = weight;
    }
  }
  return best;
}

function bump(counter: Map<string, number>, key: string | undefined, weight: number) {
  if (!key) return;
  counter.set(key, (counter.get(key) ?? 0) + weight);
}

function weightedMedian(values: Array<{ value: number; weight: number }>): number | undefined {
  const sorted = values.filter(v => v.value > 0).sort((a, b) => a.value - b.value);
  if (!sorted.length) return undefined;
  const total = sorted.reduce((sum, v) => sum + v.weight, 0);
  let acc = 0;
  for (const v of sorted) {
    acc += v.weight;
    if (acc >= total / 2) return v.value;
  }
  return sorted[sorted.length - 1].value;
}

function mix(a: string, b: string, amount: number): string {
  return tinycolor.mix(a, b, Math.round(amount * 100)).toHexString().toUpperCase();
}

function readableOn(background: string, candidates: string[]): string {
  let best = candidates[0];
  let bestRatio = 0;
  for (const candidate of candidates) {
    const ratio = tinycolor.readability(background, candidate);
    if (ratio > bestRatio) {
      best = candidate;
      bestRatio = ratio;
    }
  }
  return best;
}

/** Nudge `color` until it reads on `background` (AA for large text: 3:1). */
function ensureContrast(color: string, background: string, minRatio: number): string {
  let current = tinycolor(color);
  const darkBg = tinycolor(background).isDark();
  for (let i = 0; i < 12 && tinycolor.readability(background, current) < minRatio; i++) {
    current = darkBg ? current.lighten(6) : current.darken(6);
  }
  return current.toHexString().toUpperCase();
}

/** True when the deck has authored content worth inheriting from. */
export function deckHasAuthoredStyle(slides: Slide[]): boolean {
  let textWeight = 0;
  for (const slide of slides) {
    for (const el of slide.elements) {
      if (el.type === 'text' && !el.placeholder) textWeight += textLength(el.content);
      if (el.type === 'shape' && el.text?.content) textWeight += textLength(el.text.content);
    }
  }
  return textWeight >= 40;
}

/**
 * Derive a preset from the slides that already exist. Returns `undefined`
 * when there is too little authored content to read a style from.
 *
 * `canvasWidth` is the deck's viewport width; the returned scale is expressed
 * in the layout engine's 1000px reference so `buildLayoutSlide` can rescale it
 * for the actual canvas together with the built-in presets.
 */
export function inferStylePresetFromDeck(slides: Slide[], theme: Partial<SlideTheme> | undefined, canvasWidth: number): FikaStylePreset | undefined {
  if (!deckHasAuthoredStyle(slides)) return undefined;
  const ref = 1000 / Math.max(1, canvasWidth);
  const base = resolveStylePreset(DEFAULT_STYLE_ID);

  const backgrounds = new Map<string, number>();
  const fills = new Map<string, number>();
  const allRuns: Run[] = [];

  for (const slide of slides) {
    const bg = slide.background;
    if (bg?.type === 'solid' && bg.color) bump(backgrounds, normalizeColor(bg.color), 1);
    else if (bg?.type === 'gradient' && bg.gradient?.colors?.[0]?.color) bump(backgrounds, normalizeColor(bg.gradient.colors[0].color), 1);
    else if (!bg || !bg.type) bump(backgrounds, normalizeColor(theme?.backgroundColor) ?? '#FFFFFF', 1);
    for (const el of slide.elements as PPTElement[]) {
      if (el.type === 'text' && !el.placeholder) {
        allRuns.push(...runsOf(el));
      } else if (el.type === 'shape') {
        const fill = normalizeColor(el.fill);
        if (fill) bump(fills, fill, Math.sqrt(Math.max(1, el.width * el.height)) / 100);
        if (el.text?.content) {
          allRuns.push(...runsOf({ ...el, type: 'text', content: el.text.content, defaultFontName: el.text.defaultFontName, defaultColor: el.text.defaultColor } as PPTTextElement));
        }
      }
    }
  }

  const background = mostWeighted(backgrounds) ?? normalizeColor(theme?.backgroundColor) ?? '#FFFFFF';
  const bgIsDark = tinycolor(background).isDark();
  // A second, darker solid background used on ≥1 slide is the deck's feature
  // (cover/closing) surface; otherwise darken the title ink for it.
  let featureBackground: string | undefined;
  for (const [color] of [...backgrounds.entries()].sort((a, b) => b[1] - a[1])) {
    if (color !== background && tinycolor(color).isDark() !== bgIsDark) {
      featureBackground = color;
      break;
    }
  }

  const sized = allRuns.filter(r => r.size > 0);
  const maxSize = sized.reduce((m, r) => Math.max(m, r.size), 0);
  const titleRuns = sized.filter(r => r.size >= maxSize * 0.62 && r.size >= 24);
  const bodyRuns = sized.filter(r => r.size < maxSize * 0.62 || maxSize < 24);
  const pickFont = (runs: Run[], fallback: string) => {
    const counter = new Map<string, number>();
    for (const r of runs) bump(counter, r.font, r.weight);
    return mostWeighted(counter) ?? fallback;
  };
  const pickColor = (runs: Run[], onBackground: string, fallback: string) => {
    const counter = new Map<string, number>();
    for (const r of runs) {
      if (!r.color) continue;
      // Only inks that actually read on the main background describe its palette.
      if (tinycolor.readability(onBackground, r.color) < 2.5) continue;
      bump(counter, r.color, r.weight);
    }
    return mostWeighted(counter) ?? fallback;
  };

  const bodyFont = pickFont(bodyRuns.length ? bodyRuns : allRuns, base.fonts.body);
  const headingFont = pickFont(titleRuns.length ? titleRuns : allRuns, bodyFont);
  const defaultInk = bgIsDark ? '#FFFFFF' : '#1F2937';
  const body = pickColor(bodyRuns.length ? bodyRuns : allRuns, background, defaultInk);
  const title = pickColor(titleRuns.length ? titleRuns : allRuns, background, body);

  // Accent: the most-used saturated fill (or ink) that is neither the paper
  // nor a neutral panel tint. Surface: the most-used light neutral panel fill.
  let accent: string | undefined;
  let surface: string | undefined;
  for (const [color] of [...fills.entries()].sort((a, b) => b[1] - a[1])) {
    if (color === background) continue;
    const c = tinycolor(color);
    if (!surface && !bgIsDark && isNeutralLight(color)) surface = color;
    else if (!accent && c.toHsv().s >= 0.25 && c.getLuminance() < 0.75) accent = color;
    if (accent && surface) break;
  }
  if (!accent) {
    const inks = new Map<string, number>();
    for (const r of allRuns) {
      if (!r.color || r.color === body || r.color === title) continue;
      if (tinycolor(r.color).toHsv().s >= 0.3) bump(inks, r.color, r.weight);
    }
    accent = mostWeighted(inks);
  }
  if (!accent) {
    const titleColor = tinycolor(title);
    accent = titleColor.toHsv().s >= 0.2 ? title : base.palette.accent;
  }
  accent = ensureContrast(accent, background, 3);
  const accent2 = tinycolor(accent).spin(150).desaturate(10).toHexString().toUpperCase();
  const surfaceFinal = surface ?? mix(background, accent, bgIsDark ? 0.18 : 0.06);
  const accentSoft = mix(background, accent, bgIsDark ? 0.3 : 0.14);
  const onAccent = readableOn(accent, ['#FFFFFF', '#111111']);
  const featureBg = featureBackground ?? (bgIsDark ? background : tinycolor(title).isDark() ? mix(title, '#000000', 0.2) : base.palette.featureBackground);
  const featureTitle = readableOn(featureBg, ['#FFFFFF', '#111111']);
  const featureBody = mix(featureTitle, featureBg, 0.22);
  const featureAccent = ensureContrast(accent, featureBg, 3);
  const muted = mix(body, background, 0.4);
  const rule = mix(body, background, 0.82);

  // Type scale: read the deck's own title/body sizes (normalized to the 1000px
  // reference) and keep the preset's ratios for the roles the deck lacks.
  const titleSize = weightedMedian(titleRuns.map(r => ({ value: r.size * ref, weight: r.weight })));
  const bodySize = weightedMedian(bodyRuns.map(r => ({ value: r.size * ref, weight: r.weight })));
  const bodyPx = clamp(bodySize ?? base.scale.body, 20, 28);
  const titlePx = clamp(titleSize ?? base.scale.title, Math.max(34, bodyPx * 1.5), 48);

  return {
    id: INHERITED_STYLE_ID,
    label: 'Inherited from this deck',
    description: `Matches the slides already in this deck: ${headingFont} headings, ${bodyFont} body, ${accent} accent on ${background}.`,
    fonts: { heading: headingFont, body: bodyFont },
    palette: {
      background,
      surface: surfaceFinal,
      title: ensureContrast(title, background, 4.5),
      body: ensureContrast(body, background, 4.5),
      muted: ensureContrast(muted, background, 3),
      rule,
      accent,
      accent2: ensureContrast(accent2, background, 3),
      accentSoft,
      onAccent,
      featureBackground: featureBg,
      featureTitle,
      featureBody,
      featureAccent,
    },
    scale: {
      display: Math.round(titlePx * 1.5),
      title: Math.round(titlePx),
      sectionHeader: Math.round(bodyPx * 1.3),
      body: Math.round(bodyPx),
      label: Math.round(Math.max(15, bodyPx * 0.72)),
      caption: Math.round(Math.max(13, bodyPx * 0.6)),
    },
    chartColors: [accent, accent2, mix(accent, '#000000', 0.3), mix(accent2, '#000000', 0.3), muted, title],
    motif: {
      colorRole: 'accent',
      shape: 'hairline',
      size: 96,
      description: 'A quiet hairline — the inherited deck already carries its own visual language, so layouts add no new motif.',
    },
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
