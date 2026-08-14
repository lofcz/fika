
import { getLL } from '@/i18n/getLL';
import { useI18nContext } from '@/i18n/useI18nContext';
export const FONT_SIZE_PRESETS = [12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 76, 80, 88, 96, 104, 112, 120] as const;
export const FONT_SIZE_MIN: number = FONT_SIZE_PRESETS[0];
export const FONT_SIZE_MAX: number = FONT_SIZE_PRESETS[FONT_SIZE_PRESETS.length - 1];
export const FONT_SIZE_STEP = 2;
export const FONT_SIZE_PX_OPTIONS = FONT_SIZE_PRESETS.map(size => ({
  label: String(size),
  value: `${size}px`
}));
export const FONT_SIZE_NUMBER_OPTIONS = FONT_SIZE_PRESETS.map(size => ({
  label: String(size),
  value: size
}));
export function parseFontSize(value: string | number | undefined, fallback = FONT_SIZE_MIN): number {
  const size = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  return Number.isFinite(size) ? size : fallback;
}
export function clampFontSize(size: number, min = FONT_SIZE_MIN, max = FONT_SIZE_MAX): number {
  return Math.min(max, Math.max(min, Math.round(size)));
}
export function stepFontSize(size: number, direction: 1 | -1, min = FONT_SIZE_MIN, max = FONT_SIZE_MAX): number {
  return clampFontSize(size + direction * FONT_SIZE_STEP, min, max);
}
export function fontSizeToPx(size: number): string {
  return `${clampFontSize(size)}px`;
}
export const FONT_VALUES = ['', 'SourceSerif4', 'JetBrainsMono', 'Literata', 'Inter', 'Roboto', 'OpenSans', 'Montserrat', 'SourceSansPro', 'Merriweather', 'Lato'] as const;
export interface FontOption {
  label: string;
  value: string;
}
/** CJK faces that used to ship with extras builds; strip them from templates. */
export const EASTERN_EXTRAS_FONT_VALUES = ['SourceHanSans', 'SourceHanSerif', 'WenDingPLKaiTi', 'WenDingPLSongTi', 'ZhuqueFangSong', 'LXGWWenKai', 'LXGWNeoZhiSong', 'LXGWNeoXiHei', 'AlibabaPuHuiTi', 'MiSans', 'DeYiHei'];

/** @deprecated Use FONT_VALUES — kept for loadGoogleFonts preset detection */
export const FONTS: FontOption[] = FONT_VALUES.map(value => ({
  label: value,
  value
}));
export function getFonts(): FontOption[] {
  const f = getLL().configs.fonts;
  return [{
    label: f.defaultFont(),
    value: ''
  }, {
    label: f.sourceSerif4(),
    value: 'SourceSerif4'
  }, {
    label: f.jetBrainsMono(),
    value: 'JetBrainsMono'
  }, {
    label: f.literata(),
    value: 'Literata'
  }, {
    label: f.inter(),
    value: 'Inter'
  }, {
    label: f.roboto(),
    value: 'Roboto'
  }, {
    label: f.openSans(),
    value: 'OpenSans'
  }, {
    label: f.montserrat(),
    value: 'Montserrat'
  }, {
    label: f.sourceSansPro(),
    value: 'SourceSansPro'
  }, {
    label: f.merriweather(),
    value: 'Merriweather'
  }, {
    label: f.lato(),
    value: 'Lato'
  }];
}
export function useFonts() {
  const { locale } = useI18nContext()
  void locale
  return getFonts()
}
