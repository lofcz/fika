import { bindStyles } from '@/utils/cssm'
import styles from './ScreenElement.module.scss'
const cx = bindStyles(styles)
import { useCallback, memo, lazy, createElement, Suspense, type ComponentType } from 'react';

import { useSlidesStore, useFormatedAnimations } from '@/store';
import { ElementTypes, type PPTElement, type Slide } from '@/types/slides';
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
  turnSlideToId: (id: string) => void;
  manualExitFullscreen: () => void;
};
const ScreenElement = memo((props: IScreenElementProps) => {
  const { elementInfo, elementIndex, animationIndex, slideType, turnSlideToId, manualExitFullscreen } = props
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
  const formatedAnimations = useFormatedAnimations();
  const theme = useSlidesStore(s => s.theme);;

  const needWaitAnimation = (() => {
    const elementIndexInAnimation = formatedAnimations.findIndex(item => {
      const elIds = item.animations.map(item => item.elId);
      return elIds.includes(elementInfo.id);
    });

    if (elementIndexInAnimation === -1) return false;

    if (elementIndexInAnimation < animationIndex) return false;

    const firstAnimation = formatedAnimations[elementIndexInAnimation].animations.find(item => item.elId === elementInfo.id);
    if (firstAnimation?.type === 'in') return true;
    return false;
  })();

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
  return <><div className={cx('screen-element', {
      'link': elementInfo.link
    })} id={`screen-element-${elementInfo.id}`} style={{
      zIndex: elementIndex,
      fontFamily: theme.fontName,
      visibility: needWaitAnimation ? 'hidden' : 'visible'
    }} title={elementInfo.link?.target || ''} onClick={(event) => {
      openLink(event.nativeEvent);
    }}>{currentElementComponent ? (
      elementInfo.type === ElementTypes.CODE || elementInfo.type === ElementTypes.MERMAID ? (
        <Suspense fallback={elementInfo.type === ElementTypes.CODE ? <CodeElementPlaceholder elementInfo={elementInfo} /> : null}>
          {createElement(currentElementComponent as ComponentType<{ elementInfo: PPTElement; slideType?: Slide['type'] }>, { elementInfo, slideType })}
        </Suspense>
      ) : createElement(currentElementComponent as ComponentType<{ elementInfo: PPTElement; slideType?: Slide['type'] }>, { elementInfo, slideType })
    ) : null}</div></>;
});
export default ScreenElement;
