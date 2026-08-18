import { nanoid } from 'nanoid';
import type { TranslationFunctions } from '@/i18n/i18n-types';
import type { PPTTextElement, Slide, SlideTheme, TextAlign, TextInset } from '@/types/slides';
import { computePlaceholderSlotHeight } from '@/utils/placeholderLayout';
import { isListPlaceholderType, TEXT_PRESET_LARGE_TITLE, TEXT_PRESET_SMALL_TITLE } from '@/configs/textPresets';
import { DEFAULT_THEME_COLORS } from '@/configs/theme';
import { preferredInk } from '@/utils/textContrast';
import { DEFAULT_TURNING_MODE } from '@/configs/animation';
export interface StarterPresentationOptions {
  title?: string;
  titlePlaceholder?: string;
  subtitlePlaceholder?: string;
  bodyPlaceholder?: string;
  /** Title-slide (cover) title size. Matches the Large title preset. */
  titleFontSize?: number;
  /** Title-slide (cover) subtitle size. Matches the Small title preset. */
  subtitleFontSize?: number;
  /** Content-slide title size. PowerPoint default ≈ 28. */
  contentTitleFontSize?: number;
  /** Content-slide body (level 1) size. PowerPoint default ≈ 20. */
  bodyFontSize?: number;
  placeholderColor?: string;
  fontName?: string;
  fontColor?: string;
  backgroundColor?: string;
}
export interface StarterPresentationDocument {
  title: string;
  slides: Slide[];
  theme?: Partial<SlideTheme>;
}
const DEFAULT_PLACEHOLDER_INSET: TextInset = [10, 10, 10, 10];
const DEFAULT_PLACEHOLDER_LINE_HEIGHT = 1.2;
const textPlaceholder = (textType: 'title' | 'subtitle' | 'content' | 'item', placeholder: string, props: {
  left: number;
  top: number;
  width: number;
  height?: number;
  lines?: number;
  fontSize: number;
  color: string;
  fontColor: string;
  fontName: string;
  align?: TextAlign;
  bold?: boolean;
  fixedHeight?: boolean;
  vAlign?: PPTTextElement['vAlign'];
}): PPTTextElement => {
  const inset = DEFAULT_PLACEHOLDER_INSET;
  const lineHeight = DEFAULT_PLACEHOLDER_LINE_HEIGHT;
  const height = props.height ?? computePlaceholderSlotHeight({
    placeholderFontSize: props.fontSize,
    textType,
    lineHeight,
    inset,
    lines: props.lines ?? 1,
  });
  return {
    type: 'text',
    id: nanoid(10),
    left: props.left,
    top: props.top,
    width: props.width,
    height,
    rotate: 0,
    content: '',
    defaultFontName: props.fontName,
    defaultColor: props.fontColor,
    placeholder,
    placeholderFontSize: props.fontSize,
    placeholderColor: props.color,
    placeholderAlign: props.align ?? (textType === 'content' || textType === 'item' ? 'left' : 'center'),
    ...(props.bold ? {
      placeholderBold: true
    } : {}),
    textType,
    lineHeight,
    inset,
    placeholderLayoutHeight: height,
    ...((props.fixedHeight ?? isListPlaceholderType(textType)) ? {
      fixedHeight: true
    } : {}),
    ...(props.vAlign !== undefined ? {
      vAlign: props.vAlign
    } : {})
  };
};
const defaultThemeColors = [...DEFAULT_THEME_COLORS];
const normalizeStarterOptions = (LL: TranslationFunctions, options: StarterPresentationOptions = {}) => {
  const fontName = options.fontName ?? '';
  const backgroundColor = options.backgroundColor ?? '#fff';
  const ink = preferredInk(backgroundColor);
  const placeholderColor = options.placeholderColor ?? ink;
  const fontColor = options.fontColor ?? ink;
  return {
    title: options.title ?? LL.editor.presentation.untitled(),
    titlePlaceholder: options.titlePlaceholder ?? LL.editor.presentation.clickToAddTitle(),
    subtitlePlaceholder: options.subtitlePlaceholder ?? LL.editor.presentation.clickToAddSubtitle(),
    bodyPlaceholder: options.bodyPlaceholder ?? LL.editor.presentation.clickToAddText(),
    titleFontSize: options.titleFontSize ?? TEXT_PRESET_LARGE_TITLE.fontSize,
    subtitleFontSize: options.subtitleFontSize ?? TEXT_PRESET_SMALL_TITLE.fontSize,
    contentTitleFontSize: options.contentTitleFontSize ?? 28,
    bodyFontSize: options.bodyFontSize ?? 20,
    placeholderColor,
    fontColor,
    fontName,
    backgroundColor
  };
};
export const buildTitleSlide = (LL: TranslationFunctions, options: StarterPresentationOptions = {}): Slide => {
  const normalized = normalizeStarterOptions(LL, options);
  const boxLeft = 120;
  const boxWidth = 760;
  const titleTop = 155;
  const stackGap = 8;
  const title = textPlaceholder('title', normalized.titlePlaceholder, {
    left: boxLeft,
    top: titleTop,
    width: boxWidth,
    fontSize: normalized.titleFontSize,
    color: normalized.placeholderColor,
    fontColor: normalized.fontColor,
    fontName: normalized.fontName,
    align: TEXT_PRESET_LARGE_TITLE.align
  });
  const subtitle = textPlaceholder('subtitle', normalized.subtitlePlaceholder, {
    left: boxLeft,
    top: title.top + title.height + stackGap,
    width: boxWidth,
    fontSize: normalized.subtitleFontSize,
    color: normalized.placeholderColor,
    fontColor: normalized.fontColor,
    fontName: normalized.fontName,
    align: TEXT_PRESET_SMALL_TITLE.align
  });
  return {
    id: nanoid(10),
    type: 'cover',
    background: {
      type: 'solid',
      color: normalized.backgroundColor
    },
    elements: [title, subtitle]
  };
};
export const buildContentSlide = (LL: TranslationFunctions, options: StarterPresentationOptions = {}): Slide => {
  const normalized = normalizeStarterOptions(LL, options);
  return {
    id: nanoid(10),
    type: 'content',
    background: {
      type: 'solid',
      color: normalized.backgroundColor
    },
    elements: [textPlaceholder('title', normalized.titlePlaceholder, {
      left: 85,
      top: 55,
      width: 830,
      lines: 2,
      fontSize: normalized.contentTitleFontSize,
      color: normalized.placeholderColor,
      fontColor: normalized.fontColor,
      fontName: normalized.fontName,
      align: 'left',
      vAlign: 'middle'
    }), textPlaceholder('content', normalized.bodyPlaceholder, {
      left: 85,
      top: 165,
      width: 830,
      lines: 11,
      fontSize: normalized.bodyFontSize,
      color: normalized.placeholderColor,
      fontColor: normalized.fontColor,
      fontName: normalized.fontName,
      align: 'left'
    })]
  };
};
export const buildContentsSlide = (LL: TranslationFunctions, options: StarterPresentationOptions = {}): Slide => {
  const normalized = normalizeStarterOptions(LL, options);
  const itemPlaceholder = LL.editor.templates.placeholderText.contentsItem;
  return {
    id: nanoid(10),
    type: 'contents',
    background: {
      type: 'solid',
      color: normalized.backgroundColor
    },
    elements: [textPlaceholder('title', LL.editor.templates.placeholderText.contentsTitle(), {
      left: 85,
      top: 55,
      width: 830,
      fontSize: normalized.contentTitleFontSize,
      color: normalized.placeholderColor,
      fontColor: normalized.fontColor,
      fontName: normalized.fontName,
      align: 'left',
      vAlign: 'middle'
    }), ...[1, 2, 3, 4].map((index, i) => textPlaceholder('item', itemPlaceholder({
      index
    }), {
      left: 85,
      top: 165 + i * 72,
      width: 830,
      fontSize: 24,
      color: normalized.placeholderColor,
      fontColor: normalized.fontColor,
      fontName: normalized.fontName,
      align: 'left',
      vAlign: 'middle'
    }))]
  };
};
export const buildTransitionSlide = (LL: TranslationFunctions, options: StarterPresentationOptions = {}): Slide => {
  const normalized = normalizeStarterOptions(LL, options);
  const copy = LL.editor.templates.placeholderText;
  return {
    id: nanoid(10),
    type: 'transition',
    background: {
      type: 'solid',
      color: normalized.backgroundColor
    },
    elements: [textPlaceholder('title', copy.sectionTitle(), {
      left: 120,
      top: 200,
      width: 760,
      fontSize: normalized.titleFontSize,
      color: normalized.placeholderColor,
      fontColor: normalized.fontColor,
      fontName: normalized.fontName,
      align: TEXT_PRESET_LARGE_TITLE.align
    }), textPlaceholder('subtitle', copy.sectionBody(), {
      left: 120,
      top: 320,
      width: 760,
      fontSize: normalized.subtitleFontSize,
      color: normalized.placeholderColor,
      fontColor: normalized.fontColor,
      fontName: normalized.fontName,
      align: TEXT_PRESET_SMALL_TITLE.align
    })]
  };
};
export const buildEndSlide = (LL: TranslationFunctions, options: StarterPresentationOptions = {}): Slide => {
  const normalized = normalizeStarterOptions(LL, options);
  return {
    id: nanoid(10),
    type: 'end',
    background: {
      type: 'solid',
      color: normalized.backgroundColor
    },
    elements: [textPlaceholder('title', LL.editor.templates.placeholderText.thankYou(), {
      left: 120,
      top: 220,
      width: 760,
      fontSize: normalized.titleFontSize,
      color: normalized.placeholderColor,
      fontColor: normalized.fontColor,
      fontName: normalized.fontName,
      align: TEXT_PRESET_LARGE_TITLE.align
    })]
  };
};
export const buildTwoColumnSlide = (LL: TranslationFunctions, options: StarterPresentationOptions = {}): Slide => {
  const normalized = normalizeStarterOptions(LL, options);
  return {
    id: nanoid(10),
    type: 'content',
    background: {
      type: 'solid',
      color: normalized.backgroundColor
    },
    elements: [textPlaceholder('title', normalized.titlePlaceholder, {
      left: 85,
      top: 55,
      width: 830,
      lines: 2,
      fontSize: normalized.contentTitleFontSize,
      color: normalized.placeholderColor,
      fontColor: normalized.fontColor,
      fontName: normalized.fontName,
      align: 'left',
      vAlign: 'middle'
    }), textPlaceholder('content', normalized.bodyPlaceholder, {
      left: 85,
      top: 165,
      width: 400,
      lines: 11,
      fontSize: normalized.bodyFontSize,
      color: normalized.placeholderColor,
      fontColor: normalized.fontColor,
      fontName: normalized.fontName,
      align: 'left'
    }), textPlaceholder('content', normalized.bodyPlaceholder, {
      left: 515,
      top: 165,
      width: 400,
      lines: 11,
      fontSize: normalized.bodyFontSize,
      color: normalized.placeholderColor,
      fontColor: normalized.fontColor,
      fontName: normalized.fontName,
      align: 'left'
    })]
  };
};
export const buildStarterPresentation = (LL: TranslationFunctions, options: StarterPresentationOptions = {}): StarterPresentationDocument => {
  const normalized = normalizeStarterOptions(LL, options);
  const cover = buildTitleSlide(LL, options);
  cover.turningMode = DEFAULT_TURNING_MODE;
  return {
    title: normalized.title,
    slides: [cover],
    theme: {
      backgroundColor: normalized.backgroundColor,
      themeColors: defaultThemeColors,
      fontColor: normalized.fontColor,
      fontName: normalized.fontName
    }
  };
};
