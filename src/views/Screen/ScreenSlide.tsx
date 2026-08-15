import { bindStyles } from '@/utils/cssm'
import styles from './ScreenSlide.module.scss'
const cx = bindStyles(styles)
import { memo } from 'react';

import { useSlidesStore } from '@/store';
import type { Slide } from '@/types/slides';
import { injectKeySlideId, SlideIdContext } from '@/types/injectKey';
import useSlideBackgroundStyle from '@/hooks/useSlideBackgroundStyle';
import ScreenElement from './ScreenElement';
export type IScreenSlideProps = {
  slide: Slide;
  scale: number;
  animationIndex: number;
  turnSlideToId: (id: string) => void;
  manualExitFullscreen: () => void;
  paintElements?: boolean;
};
const ScreenSlide = memo((props: IScreenSlideProps) => {
  const { slide, scale, animationIndex, turnSlideToId, manualExitFullscreen, paintElements = true } = props;
  const viewportRatio = useSlidesStore(s => s.viewportRatio);
  const viewportSize = useSlidesStore(s => s.viewportSize);
  const background = slide.background;
  const { backgroundStyle } = useSlideBackgroundStyle(background);
  const slideId = slide.id;
  return <SlideIdContext.Provider value={slideId}><div className={cx("screen-slide")}><div className={cx("background")} style={backgroundStyle} />{paintElements ? <div className={cx("viewport")} style={{
        width: viewportSize + 'px',
        height: viewportSize * viewportRatio + 'px',
        transform: `scale(${scale})`
      }}>{slide.elements.map((element, index) => <ScreenElement key={element.id} elementInfo={element} elementIndex={index + 1} animationIndex={animationIndex} slideType={slide.type} background={slide.background} turnSlideToId={turnSlideToId} manualExitFullscreen={manualExitFullscreen} />)}</div> : null}</div></SlideIdContext.Provider>;
});
export default ScreenSlide;
