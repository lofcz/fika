import type { TextAlign } from '@/types/slides';
export const TEXT_PRESET_LARGE_TITLE = {
  fontSize: 66,
  bold: true,
  align: 'center' as const
};
export const TEXT_PRESET_SMALL_TITLE = {
  fontSize: 40,
  bold: true,
  align: 'center' as const
};
export const TEXT_PRESET_BODY = {
  fontSize: 20
};
export const TEXT_PRESET_BODY_SMALL = {
  fontSize: 18
};
export const TEXT_PRESET_CAPTION = {
  fontSize: 16,
  italic: true
};

/** Empty cover title prompt (66 × 0.55). Do not derive this from the typed size. */
export const COVER_TITLE_PROMPT_SIZE = 36;
/** First typed cover title: Large title size, without the heavy-bold preset. */
export const COVER_TITLE_TYPED_SIZE = 66;

/** Title placeholder: one step above regular, not extra-bold 600/700. */
export const PLACEHOLDER_TITLE_WEIGHT = 500;
/** Subtitle and body prompts stay regular. */
export const PLACEHOLDER_PROMPT_WEIGHT = 400;
/** Typed body/list when the slot is marked bold. Titles and subtitles skip this. */
export const PLACEHOLDER_FILLED_WEIGHT = 600;

export const placeholderWeightOf = (
  el: { textType?: string; placeholderBold?: boolean },
  empty: boolean,
) => {
  if (el.textType === 'title') return PLACEHOLDER_TITLE_WEIGHT;
  if (el.textType === 'subtitle') return PLACEHOLDER_PROMPT_WEIGHT;
  if (!empty && el.placeholderBold) return PLACEHOLDER_FILLED_WEIGHT;
  return PLACEHOLDER_PROMPT_WEIGHT;
};

/** Empty cover prompts are quieter; content-slide sizes stay at the type ramp. */
const PLACEHOLDER_PROMPT_SCALE = 0.55;
const PLACEHOLDER_PROMPT_MIN_COVER = 40;
export const placeholderPromptFontSize = (contentFontSize: number) => {
  if (contentFontSize < PLACEHOLDER_PROMPT_MIN_COVER) return contentFontSize;
  return Math.round(contentFontSize * PLACEHOLDER_PROMPT_SCALE);
};
export const placeholderContentFontSize = (fontSize?: number) => fontSize ?? 20;
export const isCoverTitlePlaceholder = (el: { textType?: string; placeholderFontSize?: number }) => {
  if (el.textType !== 'title') return false;
  const size = el.placeholderFontSize;
  // A leaked prompt size (36) must not demote the cover slot — typed size stays 66.
  if (size === COVER_TITLE_PROMPT_SIZE) return true;
  return placeholderContentFontSize(size) >= PLACEHOLDER_PROMPT_MIN_COVER;
};
export const placeholderPromptSizeOf = (el: { textType?: string; placeholderFontSize?: number }) => (
  isCoverTitlePlaceholder(el)
    ? COVER_TITLE_PROMPT_SIZE
    : placeholderPromptFontSize(placeholderContentFontSize(el.placeholderFontSize))
);
export const placeholderTypedSizeOf = (el: { textType?: string; placeholderFontSize?: number }) => (
  isCoverTitlePlaceholder(el)
    ? COVER_TITLE_TYPED_SIZE
    : placeholderContentFontSize(el.placeholderFontSize)
);
export const isPlaceholderPromptFontSize = (el: { textType?: string; placeholderFontSize?: number }, size: number) => (
  size === placeholderPromptSizeOf(el)
);

/**
 * Empty ghost keeps the original quiet prompt. Typed cover titles step up to
 * COVER_TITLE_TYPED_SIZE without the heavy title weight. The slot fits both.
 */
export const LIST_PLACEHOLDER_TYPES = new Set(['content', 'item']);
export const isListPlaceholderType = (textType?: string) => LIST_PLACEHOLDER_TYPES.has(textType ?? 'content');
export const placeholderAlignOf = (el: {
  placeholderAlign?: TextAlign;
  textType?: string;
}): TextAlign => el.placeholderAlign ?? (isListPlaceholderType(el.textType) ? 'left' : 'center');
export const placeholderBoxTypography = (el: {
  placeholder?: string;
  placeholderFontSize?: number;
  placeholderBold?: boolean;
  placeholderItalic?: boolean;
  placeholderAlign?: TextAlign;
  textType?: string;
}, empty: boolean) => {
  if (!el.placeholder) return {};
  const textAlign = placeholderAlignOf(el);
  const fontWeight = placeholderWeightOf(el, empty);
  if (empty) {
    const fontSize = `${placeholderPromptSizeOf(el)}px`;
    return {
      fontSize,
      fontWeight,
      fontStyle: 'normal' as const,
      textAlign,
      '--text-fit-base-size': fontSize,
      '--placeholder-weight': fontWeight
    };
  }
  const fontSize = `${placeholderTypedSizeOf(el)}px`;
  return {
    fontSize,
    fontWeight,
    fontStyle: el.placeholderItalic ? 'italic' as const : 'normal' as const,
    textAlign,
    '--text-fit-base-size': fontSize,
    '--placeholder-weight': fontWeight
  };
};
