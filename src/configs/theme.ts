import type { Gradient, PPTElementOutline, PPTElementShadow, Slide, SlideBackground, SlideType } from '@/types/slides';
import { preferredInk, resolveSlideSurfaceColors } from '@/utils/textContrast';

/** Default accent swatches: 8 hues so Color + None + neutrals + custom fill a 7×2 grid. */
export const DEFAULT_THEME_COLORS = ['#3b5bdb', '#1c7ed6', '#0ca678', '#f59f00', '#7048e8', '#2f9e44', '#e64980', '#1098ad'];
export interface PresetTheme {
  id?: string;
  name?: string;
  background: string;
  fontColor: string;
  featureFontColor?: string;
  fontname: string;
  colors: string[];
  borderColor?: string;
  outline?: PPTElementOutline;
  shadow?: PPTElementShadow;
  contentBackground?: SlideBackground;
  featureBackground?: SlideBackground;
  altBackground?: SlideBackground;
  /** Matching vibe gradients. Layouts cycle these instead of light variants. */
  backgrounds?: SlideBackground[];
}

/** Unstyled deck: white slide, default accents. Not in the Themes grid. */
export const DEFAULT_PRESET_THEME: PresetTheme = {
  background: '#fff',
  fontColor: '#333',
  fontname: '',
  colors: [...DEFAULT_THEME_COLORS],
  borderColor: '#525252',
};
const stops = (...colors: string[]): Gradient['colors'] => colors.map((color, i) => ({
  pos: colors.length === 1 ? 0 : Math.round(i / (colors.length - 1) * 100),
  color
}));

/** `rotate` is Fika degrees (CSS angle = rotate + 90). 45 → 135deg diagonal. */
const linear = (rotate: number, ...colors: string[]): SlideBackground => ({
  type: 'gradient',
  gradient: {
    type: 'linear',
    rotate,
    colors: stops(...colors)
  }
});
const radial = (...colors: string[]): SlideBackground => ({
  type: 'gradient',
  gradient: {
    type: 'radial',
    rotate: 0,
    colors: stops(...colors)
  }
});
export const gradientToCss = (gradient: Gradient): string => {
  const list = gradient.colors.map(item => `${item.color} ${item.pos}%`).join(', ');
  if (gradient.type === 'radial') return `radial-gradient(circle at 28% 22%, ${list})`;
  return `linear-gradient(${gradient.rotate + 90}deg, ${list})`;
};
export const slideBackgroundToStyle = (background?: SlideBackground, fallback = '#ffffff'): Record<string, string> => {
  if (!background) return {
    backgroundColor: fallback
  };
  if (background.type === 'gradient' && background.gradient) {
    return {
      backgroundImage: gradientToCss(background.gradient)
    };
  }
  return {
    backgroundColor: background.color || fallback
  };
};
export const FEATURE_SLIDE_TYPES: SlideType[] = ['cover', 'transition', 'end'];
export const isFeatureSlide = (type?: SlideType) => !!type && FEATURE_SLIDE_TYPES.includes(type);
const BODY_TEXT_TYPES = new Set(['content', 'item', 'itemTitle']);
const hasBodyText = (slide: Slide) => slide.elements.some(el => el.type === 'text' && el.textType && BODY_TEXT_TYPES.has(el.textType));

/**
 * Duplicating the title slide copies `type: 'cover'` onto every copy, so theme
 * apply cannot trust cover/end after the first. Re-infer from position + layout.
 * Keep explicit `contents` / `transition` types.
 */
export const inferThemeSlideType = (slide: Slide, index: number, count: number): SlideType => {
  if (slide.type === 'contents' || slide.type === 'transition') return slide.type;
  if (index === 0) return 'cover';
  if (hasBodyText(slide)) return 'content';
  if (index === count - 1 && count >= 3) return 'end';
  return 'content';
};
const BACKGROUND_CYCLE_BIAS: Partial<Record<SlideType, number>> = {
  cover: 0,
  end: 0,
  contents: 1,
  transition: 2,
  content: 2,
};

export const themeBackgroundCycle = (theme: PresetTheme): SlideBackground[] => {
  if (theme.backgrounds?.length) return theme.backgrounds;
  return [theme.featureBackground, theme.altBackground, theme.contentBackground].filter(
    (item): item is SlideBackground => !!item,
  );
};

export const resolvePresetBackground = (theme: PresetTheme, slideType?: SlideType, index = 0): SlideBackground => {
  const cycle = themeBackgroundCycle(theme);
  if (cycle.length) {
    const bias = BACKGROUND_CYCLE_BIAS[slideType ?? 'content'] ?? 2;
    return structuredClone(cycle[(bias + index) % cycle.length]);
  }
  return {
    type: 'solid',
    color: theme.background
  };
};
export const resolvePresetFontColor = (theme: PresetTheme, _slideType?: SlideType) => (
  theme.backgrounds?.length ? theme.featureFontColor || theme.fontColor : (
    isFeatureSlide(_slideType) ? theme.featureFontColor || theme.fontColor : theme.fontColor
  )
);
export const matchPresetTheme = (themeColors: string[]): PresetTheme | undefined => {
  const key = themeColors.map(color => color.toLowerCase()).join(',');
  return PRESET_THEMES.find(item => item.colors.map(color => color.toLowerCase()).join(',') === key);
};

/** Paint a layout preview/insert with the active preset's type-specific background and type. */
export const applyPresetToLayoutSlide = (slide: Slide, theme: PresetTheme, index = 1) => {
  slide.background = resolvePresetBackground(theme, slide.type, index);
  const ink = preferredInk(resolveSlideSurfaceColors(slide.background, theme.background));
  for (const el of slide.elements) {
    if (el.type === 'text') {
      el.defaultColor = ink;
      el.defaultFontName = theme.fontname || el.defaultFontName;
      el.placeholderColor = ink;
    } else if (el.type === 'chart') {
      el.textColor = ink;
    }
  }
};
const vibe = (
  hero: SlideBackground,
  ...rest: SlideBackground[]
): Pick<PresetTheme, 'featureBackground' | 'backgrounds'> => ({
  featureBackground: hero,
  backgrounds: [hero, ...rest],
});

export const sameSlideBackground = (a?: SlideBackground, b?: SlideBackground) => {
  if (!a || !b || a.type !== b.type) return false;
  if (a.type === 'gradient' && b.type === 'gradient') {
    return JSON.stringify(a.gradient) === JSON.stringify(b.gradient);
  }
  return (a.color || '') === (b.color || '');
};

export const matchThemeBackgroundIndex = (theme: PresetTheme, background?: SlideBackground) => (
  themeBackgroundCycle(theme).findIndex(item => sameSlideBackground(item, background))
);

export const PRESET_THEMES: PresetTheme[] = [{
  id: 'aurora',
  name: 'Aurora',
  background: '#0b1c33',
  fontColor: '#f4f8ff',
  featureFontColor: '#f4f8ff',
  fontname: '',
  colors: ['#2a9d8f', '#5b8fd4', '#e07a5f', '#f2cc8f', '#1d3557', '#9b7ebd'],
  borderColor: '#5b8fd4',
  ...vibe(
    linear(45, '#0b1c33', '#1a5f6e', '#5b8fd4'),
    linear(135, '#102a38', '#1d3557', '#2a9d8f'),
    radial('#0a1628', '#1f6b72', '#5b8fd4'),
    linear(0, '#12182e', '#1d3557', '#9b7ebd'),
    linear(90, '#0e2438', '#2a9d8f', '#5b8fd4'),
  )
}, {
  id: 'dusk',
  name: 'Dusk',
  background: '#3a1424',
  fontColor: '#fff6ee',
  featureFontColor: '#fff6ee',
  fontname: '',
  colors: ['#c45c3e', '#ee9b60', '#7a3b4a', '#d4a373', '#2c1810', '#e8c39e'],
  borderColor: '#c45c3e',
  ...vibe(
    linear(45, '#3a1424', '#c45c3e', '#ee9b60'),
    linear(135, '#2c1810', '#7a3b4a', '#d4a373'),
    radial('#4a1d2f', '#c45c3e', '#ee9b60'),
    linear(0, '#2c1810', '#c45c3e'),
    linear(90, '#1a0e12', '#7a3b4a', '#e8c39e'),
  )
}, {
  id: 'ink',
  name: 'Ink',
  background: '#0c0d10',
  fontColor: '#f5f5f4',
  featureFontColor: '#f5f5f4',
  fontname: '',
  colors: ['#2563eb', '#171717', '#64748b', '#60a5fa', '#e5e7eb', '#f59e0b'],
  borderColor: '#2563eb',
  ...vibe(
    radial('#0c0d10', '#1a2744'),
    linear(45, '#0e0e10', '#1e3a6e', '#2563eb'),
    linear(135, '#121214', '#1a1c22', '#334155'),
    radial('#0a0a0c', '#2563eb'),
    linear(90, '#0e0e10', '#171717', '#60a5fa'),
  )
}, {
  id: 'meadow',
  name: 'Meadow',
  background: '#14261c',
  fontColor: '#f3faf4',
  featureFontColor: '#f3faf4',
  fontname: '',
  colors: ['#3d7a5a', '#c4a35a', '#d47b4e', '#6b9080', '#1c3d32', '#a7c4a0'],
  borderColor: '#3d7a5a',
  ...vibe(
    linear(45, '#14261c', '#3d7a5a', '#8fbc8f'),
    linear(135, '#0f1c16', '#1c3d32', '#3d7a5a'),
    radial('#12261e', '#3d7a5a', '#a7c4a0'),
    linear(0, '#1c3d32', '#6b9080', '#c4a35a'),
    linear(90, '#163028', '#3d7a5a', '#d47b4e'),
  )
}, {
  id: 'ocean',
  name: 'Ocean',
  background: '#061830',
  fontColor: '#eef7fb',
  featureFontColor: '#eef7fb',
  fontname: '',
  colors: ['#1565a8', '#2eb7c9', '#0a2342', '#f4a261', '#e9c46a', '#7eb8da'],
  borderColor: '#1565a8',
  ...vibe(
    linear(45, '#061830', '#1565a8', '#2eb7c9'),
    linear(135, '#041018', '#0a2342', '#1565a8'),
    radial('#061a30', '#1565a8', '#2eb7c9'),
    linear(0, '#0a2342', '#1565a8', '#7eb8da'),
    linear(90, '#0a2342', '#1565a8', '#f4a261'),
  )
}, {
  id: 'orchid',
  name: 'Orchid',
  background: '#1c0a32',
  fontColor: '#faf5ff',
  featureFontColor: '#faf5ff',
  fontname: '',
  colors: ['#7c3aed', '#db2777', '#c4b5fd', '#f9a8d4', '#2b1248', '#f59e0b'],
  borderColor: '#7c3aed',
  ...vibe(
    linear(45, '#1c0a32', '#7c3aed', '#db2777'),
    linear(135, '#140820', '#2b1248', '#7c3aed'),
    radial('#1a0828', '#7c3aed', '#db2777'),
    linear(0, '#2b1248', '#7c3aed', '#c4b5fd'),
    linear(90, '#2b1248', '#db2777', '#f9a8d4'),
  )
}, {
  id: 'paper',
  name: 'Paper',
  background: '#3d2a1c',
  fontColor: '#faf6f0',
  featureFontColor: '#faf6f0',
  fontname: '',
  colors: ['#c2410c', '#2a2118', '#78716c', '#d6b48a', '#57534e', '#a8a29e'],
  borderColor: '#c2410c',
  ...vibe(
    linear(45, '#3d2a1c', '#8b5e3c', '#d6b48a'),
    linear(135, '#2a2118', '#6b5344', '#c2410c'),
    radial('#2a2118', '#8b5e3c', '#d6b48a'),
    linear(0, '#2a2118', '#57534e', '#78716c'),
    linear(90, '#3a2c20', '#6b5344', '#d6b48a'),
  )
}, {
  id: 'noir',
  name: 'Noir',
  background: '#09090b',
  fontColor: '#fafafa',
  featureFontColor: '#fafafa',
  fontname: '',
  colors: ['#eab308', '#a78bfa', '#f43f5e', '#27203a', '#a1a1aa', '#fafafa'],
  borderColor: '#eab308',
  ...vibe(
    radial('#09090b', '#27203a'),
    linear(45, '#09090b', '#1a1624', '#3d3420'),
    linear(135, '#09090b', '#27203a', '#a78bfa'),
    radial('#09090b', '#3b2f5c'),
    linear(90, '#09090b', '#27203a', '#f43f5e'),
  )
}];
