import { bindStyles } from '@/utils/cssm'
import styles from './BaseTextElement.module.scss'
const cx = bindStyles(styles)
import { useRef, memo, type CSSProperties } from 'react';
import type { CSSPropertiesWithVars } from '@/types/css';

import type { PPTTextElement, Slide, SlideBackground } from '@/types/slides';
import ElementOutline from '@/views/components/element/ElementOutline';
import useElementShadow from '@/views/components/element/hooks/useElementShadow';
import useTextFit from '@/views/components/element/hooks/useTextFit';
import { useOutlineRadiusCss } from '@/views/components/element/hooks/useElementOutline';
import { getPlaceholderBaselineHeight, resolveTextBoxLayout } from '@/utils/placeholderLayout';
import { emptyPlaceholderHtml, placeholderBoxVars } from '@/utils/placeholderPaint';
import { resolveElementDefaultFontColor, resolveElementSurfaces, resolvePlaceholderColor, rewriteDefaultInksInHtml } from '@/utils/textContrast';
import { serializeRichTextHtml } from '@/utils/prosemirror';
export type IBaseTextElementProps = {
  elementInfo: PPTTextElement;
  target?: string;
  slideType?: Slide['type'];
  showPlaceholders?: boolean;
  background?: SlideBackground;
  themeBackgroundColor?: string;
  className?: string;
  style?: CSSProperties;
};
const BaseTextElement = memo((vrProps: IBaseTextElementProps) => {
  const {
    elementInfo,
    target,
    slideType,
    showPlaceholders = false,
    background,
    themeBackgroundColor,
    className,
    style
  } = vrProps;
  const isEmptyContent = !elementInfo.content.replace(/<br\s*\/?>/gi, '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
  const showPlaceholderPreview = showPlaceholders && isEmptyContent && !!elementInfo.placeholder;
  const defaultInkColor = resolveElementDefaultFontColor(elementInfo.defaultColor || '#333', {
    fill: elementInfo.fill,
    background,
    fallbackSurface: themeBackgroundColor
  });
  const placeholderColor = resolvePlaceholderColor({
    author: elementInfo.placeholderColor,
    surfaces: resolveElementSurfaces({
      fill: elementInfo.fill,
      background,
      fallbackSurface: themeBackgroundColor
    })
  });
  const placeholderTypography = (() => {
    if (!elementInfo.placeholder) return {};
    if (isEmptyContent && !showPlaceholders) return {};
    return placeholderBoxVars(elementInfo, isEmptyContent, placeholderColor);
  })();
  const paintedHtml = showPlaceholderPreview
    ? emptyPlaceholderHtml(elementInfo)
    : serializeRichTextHtml(rewriteDefaultInksInHtml(elementInfo.content, defaultInkColor));
  const placeholderMinHeight = (!elementInfo.placeholder || !isEmptyContent)
    ? undefined
    : `${getPlaceholderBaselineHeight(elementInfo)}px`;
  const { shadowStyle } = useElementShadow(elementInfo.shadow);
  const inset = elementInfo.inset || [10, 10, 10, 10];
  const textFitHostRef = useRef<HTMLDivElement | null>(null);
  const { textFitPaintStyle } = useTextFit(elementInfo, undefined, textFitHostRef, {
    observeResize: target !== 'thumbnail'
  });
  const outlineBorderRadius = useOutlineRadiusCss(elementInfo.outline, elementInfo.width, elementInfo.height);
  const textBoxLayout = resolveTextBoxLayout(elementInfo, slideType);
  const fixedContentJustify = (() => {
    if (!textBoxLayout.fixedHeight) return undefined;
    const vAlignMap: Record<NonNullable<PPTTextElement['vAlign']>, CSSProperties['justifyContent']> = {
      top: 'flex-start',
      middle: 'center',
      bottom: 'flex-end'
    };
    return vAlignMap[textBoxLayout.vAlign];
  })();
  const contentBoxJustify = textBoxLayout.flexCenterInLayoutBox ? 'center' : fixedContentJustify;
  const contentTitleLayoutMinHeight = textBoxLayout.flexCenterInLayoutBox ? `${elementInfo.height}px` : undefined;
  return <div className={cx('base-element-text', className)} style={{
    top: elementInfo.top + 'px',
    left: elementInfo.left + 'px',
    width: elementInfo.width + 'px',
    height: elementInfo.height + 'px',
    ...style
  }}><div className={cx('rotate-wrapper')} style={{
      transform: `rotate(${elementInfo.rotate}deg)`
    }}><div className={cx('element-content', {
        'placeholder-element': !!elementInfo.placeholder,
        'show-placeholder': showPlaceholderPreview,
        'content-title-placeholder': textBoxLayout.flexCenterInLayoutBox
      })} style={{
        width: elementInfo.vertical && !textBoxLayout.fixedHeight ? 'auto' : elementInfo.width + 'px',
        height: !elementInfo.vertical && !textBoxLayout.fixedHeight && !showPlaceholderPreview ? 'auto' : elementInfo.height + 'px',
        backgroundColor: elementInfo.fill,
        opacity: elementInfo.opacity,
        textShadow: shadowStyle,
        lineHeight: elementInfo.lineHeight,
        letterSpacing: (elementInfo.wordSpace || 0) + 'px',
        color: defaultInkColor,
        fontFamily: elementInfo.defaultFontName,
        ...placeholderTypography,
        writingMode: elementInfo.vertical ? 'vertical-rl' : 'horizontal-tb',
        padding: `${inset[0]}px ${inset[1]}px ${inset[2]}px ${inset[3]}px`,
        minHeight: contentTitleLayoutMinHeight ?? placeholderMinHeight,
        display: textBoxLayout.fixedHeight || textBoxLayout.flexCenterInLayoutBox ? 'flex' : undefined,
        flexDirection: textBoxLayout.fixedHeight || textBoxLayout.flexCenterInLayoutBox ? 'column' : undefined,
        justifyContent: contentBoxJustify,
        overflow: textBoxLayout.fixedHeight || outlineBorderRadius ? 'hidden' : undefined,
        borderRadius: outlineBorderRadius,
        '--paragraphSpace': `${elementInfo.paragraphSpace === undefined ? 5 : elementInfo.paragraphSpace}px`
      } as CSSPropertiesWithVars}><ElementOutline width={elementInfo.width} height={elementInfo.height} outline={elementInfo.outline} /><div className={cx('text-fit-host')} ref={textFitHostRef} data-text-fit-host style={textFitPaintStyle}><div className={cx('text', { 'thumbnail': target === 'thumbnail' })}><div className={cx('prosemirror-editor')}><div className={cx('ProseMirror', 'ProseMirror-static')} dangerouslySetInnerHTML={{
              __html: paintedHtml
            }} /></div></div></div></div></div></div>;
});
export default BaseTextElement;
