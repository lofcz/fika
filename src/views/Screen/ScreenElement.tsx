import { bindStyles } from '@/utils/cssm'
import styles from './ScreenElement.module.scss'
const cx = bindStyles(styles)
import { useCallback, memo, lazy, createElement, Suspense, type ComponentType } from 'react';

import { useSlidesStore, selectElementWaitsForInAnimation } from '@/store';
import { ElementTypes, type PPTElement, type Slide, type SlideBackground } from '@/types/slides';
import BaseImageElement from '@/views/components/element/ImageElement/BaseImageElement';
import BaseTextElement from '@/views/components/element/TextElement/BaseTextElement';
import BaseShapeElement from '@/views/components/element/ShapeElement/BaseShapeElement';
import BaseLineElement from '@/views/components/element/LineElement/BaseLineElement';
import BaseChartElement from '@/views/components/element/ChartElement/BaseChartElement';
import BaseTableElement from '@/views/components/element/TableElement/BaseTableElement';
import BaseLatexElement from '@/views/components/element/LatexElement/BaseLatexElement';
import ScreenVideoElement from '@/views/components/element/VideoElement/ScreenVideoElement';
import ScreenAudioElement from '@/views/components/element/AudioElement/ScreenAudioElement';
import { CodeElementPlaceholder } from '@/views/components/element/CodeElement/CodeBlockSkeleton';
const BaseMermaidElement = lazy(() => import('@/views/components/element/MermaidElement/BaseMermaidElement'))
const BaseCodeElement = lazy(() => import('@/views/components/element/CodeElement/BaseCodeElement'))
export type IScreenElementProps = {
  elementInfo: PPTElement;
  elementIndex: number;
  animationIndex: number;
  slideType?: Slide['type'];
  background?: SlideBackground;
  turnSlideToId: (id: string) => void;
  manualExitFullscreen: () => void;
};
const ScreenElement = memo((props: IScreenElementProps) => {
  const { elementInfo, elementIndex, animationIndex, slideType, background, turnSlideToId, manualExitFullscreen } = props
  const currentElementComponent = (() => {
    const elementTypeMap = {
      [ElementTypes.IMAGE]: BaseImageElement,
      [ElementTypes.TEXT]: BaseTextElement,
      [ElementTypes.SHAPE]: BaseShapeElement,
      [ElementTypes.LINE]: BaseLineElement,
      [ElementTypes.CHART]: BaseChartElement,
      [ElementTypes.TABLE]: BaseTableElement,
      [ElementTypes.LATEX]: BaseLatexElement,
      [ElementTypes.MERMAID]: BaseMermaidElement,
      [ElementTypes.CODE]: BaseCodeElement,
      [ElementTypes.VIDEO]: ScreenVideoElement,
      [ElementTypes.AUDIO]: ScreenAudioElement
    };
    return elementTypeMap[elementInfo.type] || null;
  })();
  const theme = useSlidesStore(s => s.theme)
  const needWaitAnimation = useSlidesStore(useCallback(
    s => selectElementWaitsForInAnimation(s, elementInfo.id, animationIndex),
    [elementInfo.id, animationIndex],
  ))

  const openLink = useCallback((e: MouseEvent) => {
    if ((e.target as HTMLElement).tagName === 'A') {
      e.stopPropagation();
      props.manualExitFullscreen();
      return;
    }
    const link = props.elementInfo.link;
    if (!link) return;
    e.stopPropagation();
    if (link.type === 'web') {
      props.manualExitFullscreen();
      window.open(link.target);
    } else if (link.type === 'slide') {
      props.turnSlideToId(link.target);
    }
  }, [props.manualExitFullscreen, props.elementInfo?.link, props.turnSlideToId]);
  const paintProps = {
    elementInfo,
    slideType,
    background,
    themeBackgroundColor: theme.backgroundColor,
    themeFontColor: theme.fontColor,
  };
  return <><div className={cx('screen-element', {
      'link': elementInfo.link
    })} id={`screen-element-${elementInfo.id}`} data-screen-element={elementInfo.id} style={{
      zIndex: elementIndex,
      fontFamily: theme.fontName,
      visibility: needWaitAnimation ? 'hidden' : 'visible'
    }} title={elementInfo.link?.target || ''} onClick={(event) => {
      openLink(event.nativeEvent);
    }}>{currentElementComponent ? (
      elementInfo.type === ElementTypes.CODE || elementInfo.type === ElementTypes.MERMAID ? (
        <Suspense fallback={elementInfo.type === ElementTypes.CODE ? <CodeElementPlaceholder elementInfo={elementInfo} /> : null}>
          {createElement(currentElementComponent as ComponentType<Record<string, unknown>>, paintProps)}
        </Suspense>
      ) : createElement(currentElementComponent as ComponentType<Record<string, unknown>>, paintProps)
    ) : null}</div></>;
});
export default ScreenElement;
