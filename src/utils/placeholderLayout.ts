import type { PPTTextElement, Slide, TextAlignVertical, TextInset } from '@/types/slides';
import { placeholderPromptSizeOf, placeholderTypedSizeOf } from '@/configs/textPresets';
const DEFAULT_INSET: TextInset = [10, 10, 10, 10];
const DEFAULT_LINE_HEIGHT = 1.2;
const DEFAULT_PLACEHOLDER_FONT_SIZE = 20;
export interface PlaceholderBoxMetrics {
  placeholderFontSize?: number;
  lineHeight?: number;
  inset?: TextInset;
  /** Lines of placeholder-sized text the box should fit (default 1). */
  lines?: number;
  paragraphSpace?: number;
}

/**
 * Minimum box height from placeholder typography: vertical inset + text lines at
 * placeholderFontSize × lineHeight (+ paragraph gaps between lines).
 */
export const computePlaceholderMinBoxHeight = (metrics: PlaceholderBoxMetrics = {}): number => {
  const fontSize = metrics.placeholderFontSize ?? DEFAULT_PLACEHOLDER_FONT_SIZE;
  const lineHeight = metrics.lineHeight ?? DEFAULT_LINE_HEIGHT;
  const inset = metrics.inset ?? DEFAULT_INSET;
  const lines = Math.max(1, metrics.lines ?? 1);
  const paragraphSpace = metrics.paragraphSpace ?? 0;
  const linePx = fontSize * lineHeight;
  const textBlock = linePx * lines + (lines > 1 ? (lines - 1) * paragraphSpace : 0);
  return Math.ceil(inset[0] + inset[2] + textBlock);
};
const boxHeightForSize = (
  el: Pick<PPTTextElement, 'lineHeight' | 'inset' | 'paragraphSpace'> & { lines?: number },
  fontSize: number,
): number => {
  return computePlaceholderMinBoxHeight({
    placeholderFontSize: fontSize,
    lineHeight: el.lineHeight,
    inset: el.inset,
    lines: el.lines ?? 1,
    paragraphSpace: el.paragraphSpace
  });
};

/**
 * Slot that fits both paints: the quiet empty prompt/caret and the typed default.
 * Switching empty ↔ filled must not resize the frame.
 */
export const computePlaceholderSlotHeight = (
  el: Pick<PPTTextElement, 'placeholderFontSize' | 'lineHeight' | 'inset' | 'paragraphSpace' | 'textType'> & { lines?: number },
): number => {
  return Math.max(boxHeightForSize(el, placeholderTypedSizeOf(el)), boxHeightForSize(el, placeholderPromptSizeOf(el)));
};

/** Fixed slot height: the larger of the two paints, never smaller than a stored layout height. */
export const getPlaceholderBaselineHeight = (el: PPTTextElement): number => {
  return Math.max(computePlaceholderSlotHeight(el), el.placeholderLayoutHeight ?? 0);
};
export const isPlaceholderElement = (el: PPTTextElement): boolean => !!el.placeholder;

/** Title placeholder on content slides (slide 2+): left-aligned, vertically centered in the layout box. */
export const isContentSlideTitlePlaceholder = (el: PPTTextElement, slideType?: Slide['type']): boolean => {
  if (!el.placeholder || el.textType !== 'title') return false;
  if (slideType === 'content') return true;
  if (slideType === 'cover' || slideType === 'transition') return false;
  return el.placeholderAlign === 'left';
};
export interface TextBoxLayout {
  fixedHeight: boolean;
  vAlign: TextAlignVertical;
  /** Flex-column vertical centering without locking box height (content slides title). */
  flexCenterInLayoutBox: boolean;
}
export const resolveTextBoxLayout = (el: PPTTextElement, slideType?: Slide['type']): TextBoxLayout => {
  const contentTitle = isContentSlideTitlePlaceholder(el, slideType);
  return {
    fixedHeight: !!el.fixedHeight,
    vAlign: el.vAlign ?? (contentTitle ? 'middle' : 'top'),
    flexCenterInLayoutBox: contentTitle && !el.fixedHeight
  };
};

/** Placeholder shrink guard: never go below the max of the two paints. */
export const shouldBlockPlaceholderHeightShrink = (el: PPTTextElement, measuredHeight: number, _contentEmpty: boolean): boolean => {
  if (!isPlaceholderElement(el)) return false;
  return measuredHeight < getPlaceholderBaselineHeight(el);
};
