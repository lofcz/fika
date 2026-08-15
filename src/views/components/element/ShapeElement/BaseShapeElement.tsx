import { bindStyles } from '@/utils/cssm'
import styles from './BaseShapeElement.module.scss'
const cx = bindStyles(styles)
import { memo, type CSSProperties } from 'react';

import type { PPTShapeElement, ShapeText } from '@/types/slides';
import { useSlidesStore, selectCurrentSlide } from '@/store';
import useElementOutline from '@/views/components/element/hooks/useElementOutline';
import useElementShadow from '@/views/components/element/hooks/useElementShadow';
import useElementFlip from '@/views/components/element/hooks/useElementFlip';
import useElementFill from '@/views/components/element/hooks/useElementFill';
import { resolveLiveTextPaint } from '@/utils/textContrast';
import { shapePathTransform } from '@/utils/shapePaint';
import { serializeRichTextHtml } from '@/utils/prosemirror';
import GradientDefs from './GradientDefs';
import PatternDefs from './PatternDefs';
import { areBaseShapePropsEqual } from './shapePaintEqual';
export type IBaseShapeElementProps = {
  elementInfo: PPTShapeElement;
};
const BaseShapeElement = memo((props: IBaseShapeElementProps) => {
  const { elementInfo } = props;
  const theme = useSlidesStore(s => s.theme);
  const { fill } = useElementFill(elementInfo, 'base');
  const { outlineWidth, outlineColor, strokeDashArray } = useElementOutline(elementInfo.outline);
  const { shadowStyle } = useElementShadow(elementInfo.shadow);
  const { flipStyle } = useElementFlip(elementInfo.flipH, elementInfo.flipV);
  const slide = selectCurrentSlide(useSlidesStore.getState());
  const painted = resolveLiveTextPaint(elementInfo.text?.defaultColor || theme.fontColor, elementInfo.text?.content || '', {
    element: elementInfo,
    elements: slide?.elements,
    fill: elementInfo.fill,
    background: slide?.background,
    fallbackSurface: theme.backgroundColor,
    themeFontColor: theme.fontColor,
  });
  const text: ShapeText = {
    content: painted.html,
    align: elementInfo.text?.align || 'middle',
    defaultFontName: elementInfo.text?.defaultFontName || theme.fontName,
    defaultColor: painted.ink,
    inset: elementInfo.text?.inset,
    lineHeight: elementInfo.text?.lineHeight,
    wordSpace: elementInfo.text?.wordSpace,
    paragraphSpace: elementInfo.text?.paragraphSpace,
  };
  const staticContent = serializeRichTextHtml(text.content);
  const inset = text.inset || [10, 10, 10, 10];
  return <div className={cx('base-element-shape')} style={{
    top: elementInfo.top + 'px',
    left: elementInfo.left + 'px',
    width: elementInfo.width + 'px',
    height: elementInfo.height + 'px'
  }}><div className={cx('rotate-wrapper')} style={{
      transform: `rotate(${elementInfo.rotate}deg)`
    }}><div className={cx('element-content')} style={{
        opacity: elementInfo.opacity,
        filter: shadowStyle ? `drop-shadow(${shadowStyle})` : '',
        transform: flipStyle,
        color: text.defaultColor,
        fontFamily: text.defaultFontName
      }}><svg overflow='visible' width={elementInfo.width} height={elementInfo.height}><defs>{elementInfo.pattern ? <PatternDefs id={`base-pattern-${elementInfo.id}`} src={elementInfo.pattern} /> : elementInfo.gradient ? <GradientDefs id={`base-gradient-${elementInfo.id}`} type={elementInfo.gradient.type} colors={elementInfo.gradient.colors} rotate={elementInfo.gradient.rotate} /> : null}</defs><g transform={`${shapePathTransform(elementInfo)} translate(0,0) matrix(1,0,0,1,0,0)`}><path vectorEffect='non-scaling-stroke' strokeLinecap='butt' strokeMiterlimit='8' d={elementInfo.path} fill={fill} stroke={outlineColor} strokeWidth={outlineWidth} strokeDasharray={strokeDashArray} /></g></svg><div className={cx('shape-text', text.align)} style={{
          lineHeight: text.lineHeight,
          letterSpacing: (text.wordSpace || 0) + 'px',
          padding: `${inset[0]}px ${inset[1]}px ${inset[2]}px ${inset[3]}px`,
          '--paragraphSpace': `${text.paragraphSpace === undefined ? 5 : text.paragraphSpace}px`
        } as CSSProperties}><div className={cx('prosemirror-editor')}><div className={cx('ProseMirror', 'ProseMirror-static')} dangerouslySetInnerHTML={{
            __html: staticContent
          }} /></div></div></div></div></div>;
}, areBaseShapePropsEqual);
export default BaseShapeElement;
