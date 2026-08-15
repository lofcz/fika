import type { PPTTextElement, Slide, TextAlignVertical, TextInset } from '@/types/slides';
import { isListPlaceholderType, placeholderPromptSizeOf, placeholderTypedSizeOf } from '@/configs/textPresets';
import { isEmptyRichText } from '@/utils/placeholderPaint';
import { textElementLocksSize } from './textBoxLock';
export { elementLocksTextBox, shapeTextLocksSize, textElementLocksSize } from './textBoxLock';
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
 * Empty-slot height: the larger of the quiet prompt and the typed default.
 * Used only while the placeholder is empty. Filled auto-height hugs the text.
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
  /**
   * Definite `height` (not `auto`). True for explicit fixed-height and for an
   * *empty* placeholder slot (dashed box + centered prompt). A filled
   * auto-height title/subtitle unlocks so the box can grow with the text.
   */
  lockPaintHeight: boolean;
}
export const V_ALIGN_JUSTIFY = {
  top: 'flex-start',
  middle: 'center',
  bottom: 'flex-end',
} as const satisfies Record<TextAlignVertical, 'flex-start' | 'center' | 'flex-end'>;
const defaultTextBoxVAlign = (el: PPTTextElement, contentTitle: boolean): TextAlignVertical => {
  if (el.vAlign) return el.vAlign;
  if (contentTitle) return 'middle';
  if (el.placeholder && !isListPlaceholderType(el.textType)) return 'middle';
  return 'top';
};
export const resolveTextBoxLayout = (
  el: PPTTextElement,
  slideType?: Slide['type'],
  contentEmpty?: boolean,
): TextBoxLayout => {
  const contentTitle = isContentSlideTitlePlaceholder(el, slideType);
  const fixedHeight = !!el.fixedHeight;
  const emptyPlaceholder = !!el.placeholder && (
    contentEmpty !== undefined ? contentEmpty : isEmptyRichText(el.content)
  );
  return {
    fixedHeight,
    vAlign: defaultTextBoxVAlign(el, contentTitle),
    flexCenterInLayoutBox: contentTitle && !fixedHeight && !emptyPlaceholder,
    lockPaintHeight: fixedHeight || emptyPlaceholder
  };
};

/**
 * Live paint mode. `fit` shrinks type; `grow` grows the box; `slot` is the
 * empty dashed placeholder (definite height, no shrink-to-fit).
 */
export type TextBoxLiveMode = 'grow' | 'fit' | 'slot';
export const textBoxLiveMode = (
  el: Pick<PPTTextElement, 'fixedHeight' | 'vertical'>,
  layout: TextBoxLayout,
): TextBoxLiveMode => {
  if (textElementLocksSize(el)) return 'fit';
  if (layout.lockPaintHeight) return 'slot';
  return 'grow';
};

/** Painted size for unmarked runs. Placeholder/title slots use the typed size, not 16. */
export const authoredTextFitSize = (
  el: Pick<PPTTextElement, 'placeholder' | 'placeholderFontSize' | 'textType'>,
) => (el.placeholder ? placeholderTypedSizeOf(el) : 16);
export const textBoxPaintSize = (el: PPTTextElement, layout: TextBoxLayout) => ({
  width: el.vertical && !layout.fixedHeight ? 'auto' : `${el.width}px`,
  height: !el.vertical && !layout.lockPaintHeight ? 'auto' : `${el.height}px`
});
export const textBoxFlexColumn = (layout: TextBoxLayout) => (
  layout.lockPaintHeight || layout.flexCenterInLayoutBox
);
export const textBoxJustify = (layout: TextBoxLayout) => {
  if (layout.flexCenterInLayoutBox) return 'center' as const;
  if (layout.lockPaintHeight) return V_ALIGN_JUSTIFY[layout.vAlign];
  return undefined;
};

/**
 * Empty slots keep the dashed frame. Filled auto-height follows the text —
 * including shrinking off the empty-slot floor so Enter can grow the box.
 */
export const shouldBlockPlaceholderHeightShrink = (
  el: PPTTextElement,
  measuredHeight: number,
  contentEmpty: boolean,
): boolean => {
  if (!isPlaceholderElement(el) || !contentEmpty) return false;
  return measuredHeight < getPlaceholderBaselineHeight(el);
};
