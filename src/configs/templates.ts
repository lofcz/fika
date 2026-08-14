import type { TranslationFunctions } from '@/i18n/i18n-types';
import type { Slide, SlideTheme } from '@/types/slides';
import { EASTERN_EXTRAS_FONT_VALUES } from '@/configs/font';

export interface TemplatePayload {
  title?: string;
  width?: number;
  height?: number;
  slides: Slide[];
  theme?: Partial<SlideTheme>;
}
export type TemplatePayloadLoader = () => Promise<TemplatePayload | Slide[]>;
type TemplateTextToken = 'presentationTitle' | 'coverTitle' | 'coverSubtitle' | 'coverDescription' | 'presenter' | 'date' | 'time' | 'businessReport' | 'contentsTitle' | 'sectionTitle' | 'sectionBody' | 'contentTitle' | 'itemTitle' | 'itemBody' | 'thankYou' | 'welcome' | 'title1' | 'title2' | 'title3' | 'title4' | 'bodyText' | 'contentsItem';
export interface TemplateNormalizationConfig {
  stripFontFamilies: string[];
}

let customTemplateLoaders: Record<string, TemplatePayloadLoader> = {};

export const setCustomTemplateLoaders = (loaders?: Record<string, TemplatePayloadLoader>) => {
  customTemplateLoaders = loaders ?? {};
};

export const listCustomTemplateIds = () => Object.keys(customTemplateLoaders);

export const isKnownTemplateId = (id: string) => (
  Object.prototype.hasOwnProperty.call(customTemplateLoaders, id)
);

export const loadConfiguredTemplate = async (id: string) => {
  const customLoader = customTemplateLoaders[id];
  if (customLoader) return customLoader();
  return null;
};

export const TEMPLATE_NORMALIZATION_CONFIG: TemplateNormalizationConfig = {
  stripFontFamilies: EASTERN_EXTRAS_FONT_VALUES
};

const TEMPLATE_TOKEN_RE = /\{\{fika:([a-zA-Z0-9]+)(?::(\d+))?\}\}/g;
const TEMPLATE_TEXT_TOKENS = new Set<TemplateTextToken>(['presentationTitle', 'coverTitle', 'coverSubtitle', 'coverDescription', 'presenter', 'date', 'time', 'businessReport', 'contentsTitle', 'sectionTitle', 'sectionBody', 'contentTitle', 'itemTitle', 'itemBody', 'thankYou', 'welcome', 'title1', 'title2', 'title3', 'title4', 'bodyText', 'contentsItem']);

const replacementForToken = (token: TemplateTextToken, LL: TranslationFunctions, index?: string) => {
  const placeholders = LL.editor.templates.placeholderText;
  if (token === 'contentsItem') {
    return placeholders.contentsItem({
      index: Number(index) || 1
    });
  }
  const values: Record<TemplateTextToken, string> = {
    presentationTitle: LL.editor.presentation.untitled(),
    coverTitle: placeholders.coverTitle(),
    coverSubtitle: placeholders.coverSubtitle(),
    coverDescription: placeholders.coverDescription(),
    presenter: placeholders.presenter(),
    date: placeholders.date(),
    time: placeholders.time(),
    businessReport: placeholders.businessReport(),
    contentsTitle: placeholders.contentsTitle(),
    sectionTitle: placeholders.sectionTitle(),
    sectionBody: placeholders.sectionBody(),
    contentTitle: placeholders.contentTitle(),
    itemTitle: placeholders.itemTitle(),
    itemBody: placeholders.itemBody(),
    thankYou: placeholders.thankYou(),
    welcome: placeholders.welcome(),
    title1: placeholders.title1(),
    title2: placeholders.title2(),
    title3: placeholders.title3(),
    title4: placeholders.title4(),
    bodyText: placeholders.bodyText(),
    contentsItem: ''
  };
  return values[token];
};

const stripConfiguredFontFamilies = (value: string, config: TemplateNormalizationConfig) => {
  if (config.stripFontFamilies.some(font => font.toLowerCase() === value.toLowerCase())) return '';
  return config.stripFontFamilies.reduce((text, font) => {
    return text.replace(new RegExp(`font-family:\\s*${font}\\s*;?`, 'gi'), '').replace(new RegExp(`font-family:\\s*['"]?${font}['"]?\\s*;?`, 'gi'), '');
  }, value);
};

const localizeTemplateString = (value: string, LL: TranslationFunctions, config: TemplateNormalizationConfig) => {
  const withoutExtrasFonts = stripConfiguredFontFamilies(value, config);
  return withoutExtrasFonts.replace(TEMPLATE_TOKEN_RE, (match, token: TemplateTextToken, index?: string) => {
    if (!TEMPLATE_TEXT_TOKENS.has(token)) return match;
    return replacementForToken(token, LL, index);
  });
};

export const normalizeTemplatePayload = (payload: TemplatePayload | Slide[], LL: TranslationFunctions, config: TemplateNormalizationConfig = TEMPLATE_NORMALIZATION_CONFIG): TemplatePayload => {
  const data = Array.isArray(payload) ? {
    slides: payload
  } : payload;
  const normalized = JSON.parse(JSON.stringify(data), (_key, value) => {
    return typeof value === 'string' ? localizeTemplateString(value, LL, config) : value;
  }) as TemplatePayload;
  normalized.slides = Array.isArray(normalized.slides) ? normalized.slides : [];
  return normalized;
};
