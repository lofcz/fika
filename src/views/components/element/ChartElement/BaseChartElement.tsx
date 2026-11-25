import { bindStyles } from '@/utils/cssm'
import styles from './BaseChartElement.module.scss'
const cx = bindStyles(styles)
import { memo, useContext, useMemo, Suspense } from 'react';

import { useSlidesStore, selectSlideById } from '@/store';
import type { PPTChartElement, SlideBackground } from '@/types/slides';
import { SlideIdContext } from '@/types/injectKey';
import { DEFAULT_CHART_LINE_COLOR } from '@/configs/chart';
import { resolveChartElementSeriesColors, resolveChartLabelColor } from '@/utils/textContrast';
import { useOutlineRadiusCss } from '@/views/components/element/hooks/useElementOutline';
import ElementOutline from '@/views/components/element/ElementOutline';
import { createRetryableLazy, LazyChunkBoundary } from '@/components/LazyChunkBoundary';
import './Chart.module.scss';

const LazyChart = createRetryableLazy(() => import('./Chart'));
const Chart = LazyChart.Component;

export type IBaseChartElementProps = {
  elementInfo: PPTChartElement;
  target?: string;
  background?: SlideBackground;
  themeBackgroundColor?: string;
};

const BaseChartElement = memo((props: IBaseChartElementProps) => {
  const { elementInfo, target } = props;
  const slideId = useContext(SlideIdContext);
  const currentSlide = useSlidesStore(s => selectSlideById(s, slideId || undefined));
  const theme = useSlidesStore(s => s.theme);
  const labelColor = resolveChartLabelColor(props.elementInfo, {
    background: props.background ?? currentSlide?.background,
    fallbackSurface: props.themeBackgroundColor ?? theme?.backgroundColor,
    fontColor: theme?.fontColor
  });
  const gridColor = props.elementInfo.lineColor || DEFAULT_CHART_LINE_COLOR;
  const outlineRef = props.elementInfo.outline;
  const elementWidthRef = props.elementInfo.width;
  const elementHeightRef = props.elementInfo.height;
  const outlineBorderRadius = useOutlineRadiusCss(outlineRef, elementWidthRef, elementHeightRef);

  const effectiveBg = props.background ?? currentSlide?.background;
  const effectiveFallback = props.themeBackgroundColor ?? theme?.backgroundColor;
  const seriesColors = useMemo(() => resolveChartElementSeriesColors(elementInfo, {
    background: effectiveBg,
    fallbackSurface: effectiveFallback,
  }), [elementInfo, effectiveBg, effectiveFallback]);

  return <div
    className={cx('base-element-chart', { 'is-thumbnail': target === 'thumbnail' })}
    style={{
      top: elementInfo.top + 'px',
      left: elementInfo.left + 'px',
      width: elementInfo.width + 'px',
      height: elementInfo.height + 'px'
    }}
  >
    <div className={cx('rotate-wrapper')} style={{ transform: `rotate(${elementInfo.rotate}deg)` }}>
      <div
        className={cx('element-content')}
        style={{
          backgroundColor: elementInfo.fill,
          borderRadius: outlineBorderRadius
        }}
      >
        <ElementOutline
          width={elementInfo.width}
          height={elementInfo.height}
          outline={elementInfo.outline}
        />
        <div style={{ overflow: outlineBorderRadius ? 'hidden' : undefined, borderRadius: outlineBorderRadius, width: '100%', height: '100%' }}>
          <LazyChunkBoundary onRetry={LazyChart.reset} resetKey={elementInfo.id}>
            <Suspense fallback={null}>
              <Chart
                width={elementInfo.width}
                height={elementInfo.height}
                type={elementInfo.chartType}
                data={elementInfo.data}
                themeColors={seriesColors}
                textColor={labelColor}
                lineColor={gridColor}
                options={elementInfo.options}
              />
            </Suspense>
          </LazyChunkBoundary>
        </div>
      </div>
    </div>
  </div>;
});
export default BaseChartElement;
