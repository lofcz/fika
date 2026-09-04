/**
 * Style presets for the agentic bridge.
 *
 * A "style" is a small, curated bundle of design tokens — a color palette with
 * named *roles* (background / title / body / accent / …), a heading+body font
 * pairing, and a typographic size scale. Presets are hand-tuned so every
 * role-pair clears WCAG AA contrast, which lets the agent build good-looking,
 * legible slides without hand-picking colors or font sizes.
 *
 * The agent flow is:
 *   1. `styles.catalog`  → see the available presets.
 *   2. `deck.applyStyle` → pick ONE; it sets the deck theme + records `styleId`.
 *   3. `slides.createFromLayout` → layouts read the active preset's role tokens
 *      to place themed, contrast-safe elements.
 *
 * Only the preset *id* is persisted on the deck theme (`theme.styleId`); the
 * rich token data lives here in code, so it always renders deterministically
 * and survives document serialization without bloating the saved deck.
 */
import type { SlideTheme } from '@/types/slides';

/** Named color roles. Every role pairs with a readable foreground/background. */
export interface FikaStylePalette {
  /** Default slide background (content slides). */
  background: string;
  /** Subtle panel/card fill that sits on `background`. */
  surface: string;
  /** Heading/title text on `background`/`surface`. */
  title: string;
  /** Body/paragraph text on `background`/`surface`. */
  body: string;
  /** De-emphasized text (captions, labels) on `background`/`surface`. */
  muted: string;
  /** Hairline rules, dividers, and thin borders. */
  rule: string;
  /** Primary accent (bars, highlights, key numbers). */
  accent: string;
  /** Secondary accent for variety (second series, alt highlight). */
  accent2: string;
  /** Tinted accent wash for soft panels/bands. */
  accentSoft: string;
  /** Readable foreground when placed on `accent`. */
  onAccent: string;
  /** Feature background for title/section/closing slides (usually dark). */
  featureBackground: string;
  /** Title text on `featureBackground`. */
  featureTitle: string;
  /** Body/subtitle text on `featureBackground`. */
  featureBody: string;
  /** Accent that pops on `featureBackground`. */
  featureAccent: string;
}

/** Typographic size scale in px (canvas units), largest → smallest. */
export interface FikaStyleScale {
  /** Hero/cover title. */
  display: number;
  /** Standard slide title. */
  title: number;
  /** Section header / column heading. */
  sectionHeader: number;
  /** Body copy and bullets. */
  body: number;
  /** Eyebrow labels, kickers, tags. */
  label: number;
  /** Captions, footnotes, source lines. */
  caption: number;
}
export interface FikaStyleFonts {
  /** Heading/display font family. */
  heading: string;
  /** Body/paragraph font family. */
  body: string;
}

/**
 * The style's signature visual motif — ONE distinctive, repeatable element
 * that ties a deck together and replaces the generic "accent rule under the
 * title" slop tell. Layouts render this instead of a bare rectangle. The motif
 * is described declaratively so every layout family can draw it consistently.
 */
export interface FikaStyleMotif {
  /** Which accent slot the motif draws from. */
  colorRole: 'accent' | 'accent2';
  /** The geometric treatment. */
  shape: 'doubleRule' | 'offsetBlock' | 'roundedChip' | 'hairline';
  /** Approximate rendered size, in canvas px, for the primary placement. */
  size: number;
  /** One-line description surfaced in the style catalog so the agent can picture it. */
  description: string;
}
export interface FikaStylePreset {
  id: string;
  /** Human label shown in the catalog. */
  label: string;
  /** One-line description of the look & best use. */
  description: string;
  fonts: FikaStyleFonts;
  palette: FikaStylePalette;
  scale: FikaStyleScale;
  /** Ordered chart series colors derived from the palette. */
  chartColors: string[];
  /** The style's signature motif, drawn by layouts instead of a generic rule. */
  motif: FikaStyleMotif;
}

/** Compact catalog entry (what `styles.catalog` returns to the agent). */
export interface FikaStyleSummary {
  id: string;
  label: string;
  description: string;
  fonts: FikaStyleFonts;
  /** A few representative colors so the agent can picture the look. */
  preview: {
    background: string;
    title: string;
    body: string;
    accent: string;
    featureBackground: string;
  };
  /** The style's signature motif description, so the agent knows the deck's throughline. */
  motif: FikaStyleMotif;
}
export const DEFAULT_STYLE_ID = 'academic';
export const PPTX_STYLE_PRESETS: FikaStylePreset[] = [{
  id: 'academic',
  label: 'Academic',
  description: 'Calm navy-on-white with a serif heading. Authoritative and readable — ideal for reports, research, and formal decks.',
  fonts: {
    heading: 'Georgia',
    body: 'Arial'
  },
  palette: {
    background: '#FFFFFF',
    surface: '#F3F6FB',
    title: '#1F3A5F',
    body: '#283544',
    muted: '#5B6B7C',
    rule: '#D3DDEA',
    accent: '#2E6FB0',
    accent2: '#4Fae9F',
    accentSoft: '#E5EEF8',
    onAccent: '#FFFFFF',
    featureBackground: '#1F3A5F',
    featureTitle: '#FFFFFF',
    featureBody: '#CBD9EA',
    featureAccent: '#7FB2E0'
  },
  scale: {
    display: 60,
    title: 38,
    sectionHeader: 28,
    body: 22,
    label: 16,
    caption: 13
  },
  chartColors: ['#2E6FB0', '#4FAE9F', '#E0A458', '#9B6FB0', '#C95B5B', '#6C7A89'],
  motif: {
    colorRole: 'accent',
    shape: 'doubleRule',
    size: 84,
    description: 'A centered equal-length double rule on feature/hero slides only — never under content titles (cards/columns already have their own accent).'
  }
}, {
  id: 'minimal',
  label: 'Minimal',
  description: 'Near-black on white, generous whitespace, one restrained blue accent. Crisp and modern for clean, focused decks.',
  fonts: {
    heading: 'Arial',
    body: 'Arial'
  },
  palette: {
    background: '#FFFFFF',
    surface: '#F6F6F6',
    title: '#141414',
    body: '#2B2B2B',
    muted: '#8A8A8A',
    rule: '#E5E5E5',
    accent: '#2563EB',
    accent2: '#111111',
    accentSoft: '#EAF0FE',
    onAccent: '#FFFFFF',
    featureBackground: '#111111',
    featureTitle: '#FFFFFF',
    featureBody: '#BFBFBF',
    featureAccent: '#5B8DEF'
  },
  scale: {
    display: 64,
    title: 40,
    sectionHeader: 28,
    body: 22,
    label: 16,
    caption: 13
  },
  chartColors: ['#2563EB', '#141414', '#8A8A8A', '#5B8DEF', '#B9C4D6', '#3D3D3D'],
  motif: {
    colorRole: 'accent',
    shape: 'hairline',
    size: 96,
    description: 'A single ultra-thin hairline — barely-there structure that lets whitespace lead.'
  }
}, {
  id: 'bold',
  label: 'Bold',
  description: 'High-contrast with a vivid warm accent and large type; dark feature slides. Confident and energetic for keynotes.',
  fonts: {
    heading: 'Trebuchet MS',
    body: 'Arial'
  },
  palette: {
    background: '#FFFFFF',
    surface: '#FFF3EC',
    title: '#15171A',
    body: '#2A2D33',
    muted: '#6A6F78',
    rule: '#EAD3C4',
    accent: '#F2542D',
    accent2: '#1E2A38',
    accentSoft: '#FDE6DD',
    onAccent: '#FFFFFF',
    featureBackground: '#15171A',
    featureTitle: '#FFFFFF',
    featureBody: '#C9CDD4',
    featureAccent: '#F2542D'
  },
  scale: {
    display: 72,
    title: 44,
    sectionHeader: 32,
    body: 24,
    label: 17,
    caption: 13
  },
  chartColors: ['#F2542D', '#1E2A38', '#F2A65A', '#3B7A57', '#5B7DB1', '#8C5E58'],
  motif: {
    colorRole: 'accent',
    shape: 'offsetBlock',
    size: 72,
    description: 'A bold offset block — a thick solid square shifted off the content edge for punch.'
  }
}, {
  id: 'playful',
  label: 'Playful',
  description: 'Warm tinted background with a friendly coral/teal pair and rounded feel. Approachable for younger audiences and workshops.',
  fonts: {
    heading: 'Trebuchet MS',
    body: 'Verdana'
  },
  palette: {
    background: '#FFFDF7',
    surface: '#FFF1D9',
    title: '#3A2E2A',
    body: '#4A3F39',
    muted: '#8A7C73',
    rule: '#F0DBBC',
    accent: '#F4845F',
    accent2: '#2BB3A3',
    accentSoft: '#FCE5D9',
    onAccent: '#FFFFFF',
    featureBackground: '#3A2E2A',
    featureTitle: '#FFFFFF',
    featureBody: '#E9D9CF',
    featureAccent: '#F4845F'
  },
  scale: {
    display: 62,
    title: 40,
    sectionHeader: 30,
    body: 23,
    label: 16,
    caption: 13
  },
  chartColors: ['#F4845F', '#2BB3A3', '#F2C14E', '#5BA3D0', '#B07BAC', '#7FB069'],
  motif: {
    colorRole: 'accent2',
    shape: 'roundedChip',
    size: 64,
    description: 'A friendly rounded chip in the secondary accent — soft, approachable punctuation.'
  }
}];
const PRESETS_BY_ID = new Map(PPTX_STYLE_PRESETS.map(preset => [preset.id, preset]));
export function getStylePreset(id?: string | null): FikaStylePreset | undefined {
  if (!id) return undefined;
  return PRESETS_BY_ID.get(id);
}

/** Resolve a usable preset, falling back to the default when id is missing/unknown. */
export function resolveStylePreset(id?: string | null): FikaStylePreset {
  return getStylePreset(id) ?? PRESETS_BY_ID.get(DEFAULT_STYLE_ID)!;
}
export function listStylePresets(): FikaStyleSummary[] {
  return PPTX_STYLE_PRESETS.map(preset => ({
    id: preset.id,
    label: preset.label,
    description: preset.description,
    fonts: {
      ...preset.fonts
    },
    preview: {
      background: preset.palette.background,
      title: preset.palette.title,
      body: preset.palette.body,
      accent: preset.palette.accent,
      featureBackground: preset.palette.featureBackground
    },
    motif: {
      ...preset.motif
    }
  }));
}

/** Canvas width the preset type scales and motif sizes are authored for. */
export const STYLE_REFERENCE_WIDTH = 1000;

/**
 * Rescale a preset's px-based type scale and motif for a canvas of `width`
 * px. Presets are authored for the 1000px default viewport; an imported
 * 1280px deck would otherwise get 22px body copy that reads 22% smaller than
 * designed. Returns the same object when no scaling is needed.
 */
export function scaleStylePreset(preset: FikaStylePreset, width: number): FikaStylePreset {
  const factor = width / STYLE_REFERENCE_WIDTH;
  if (!Number.isFinite(factor) || factor <= 0 || Math.abs(factor - 1) < 0.01) return preset;
  const scale = (value: number) => Math.round(value * factor);
  return {
    ...preset,
    scale: {
      display: scale(preset.scale.display),
      title: scale(preset.scale.title),
      sectionHeader: scale(preset.scale.sectionHeader),
      body: scale(preset.scale.body),
      label: scale(preset.scale.label),
      caption: scale(preset.scale.caption)
    },
    motif: {
      ...preset.motif,
      size: scale(preset.motif.size)
    }
  };
}

/**
 * Build the deck-theme patch for a preset. Sets the inheritable defaults that
 * manually-created elements pick up (`fontColor`, `fontName`, `backgroundColor`,
 * `themeColors`) and records `styleId` so layouts can resolve the full preset.
 */
export function styleThemePatch(preset: FikaStylePreset): Partial<SlideTheme> {
  return {
    backgroundColor: preset.palette.background,
    themeColors: [...preset.chartColors],
    fontColor: preset.palette.body,
    fontName: preset.fonts.body,
    styleId: preset.id
  };
}
