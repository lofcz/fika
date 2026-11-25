import { bindStyles } from '@/utils/cssm'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { useCallback, useMemo, memo, Suspense } from 'react';
import { nativePointerEvent, type ReactPointerEvent } from '@/utils/canvasPointer';

import { openContextmenu } from '@/utils/openContextmenu';
import { useSlidesStore, selectCurrentSlide } from '@/store';
import type { PPTChartElement } from '@/types/slides';
import type { ContextmenuItem } from '@/components/Contextmenu/types';
import emitter, { EmitterEvents } from '@/utils/emitter';
import { DEFAULT_CHART_LINE_COLOR } from '@/configs/chart';
import { resolveChartElementSeriesColors, resolveChartLabelColor } from '@/utils/textContrast';
import { useOutlineRadiusCss } from '@/views/components/element/hooks/useElementOutline';
import ElementOutline from '@/views/components/element/ElementOutline';
import { createRetryableLazy, LazyChunkBoundary } from '@/components/LazyChunkBoundary';
import './Chart.module.scss';

const LazyChart = createRetryableLazy(() => import('./Chart'));
const Chart = LazyChart.Component;

export type IChartElementProps = {
  elementInfo: PPTChartElement;
  selectElement: (e: MouseEvent | TouchEvent, element: PPTChartElement, canMove?: boolean) => void;
  contextmenus: () => ContextmenuItem[] | null;
};

const ChartElement = memo((props: IChartElementProps) => {
  const { elementInfo, contextmenus } = props;
  const slideBackground = useSlidesStore(s => selectCurrentSlide(s)?.background);
  const theme = useSlidesStore(s => s.theme);
  const labelColor = resolveChartLabelColor(props.elementInfo, {
    background: slideBackground,
    fallbackSurface: theme?.backgroundColor,
    fontColor: theme?.fontColor
  });
  const gridColor = props.elementInfo.lineColor || DEFAULT_CHART_LINE_COLOR;
  const outlineRef = props.elementInfo.outline;
  const elementWidthRef = props.elementInfo.width;
  const elementHeightRef = props.elementInfo.height;
  const outlineBorderRadius = useOutlineRadiusCss(outlineRef, elementWidthRef, elementHeightRef);

  const handleSelectElement = useCallback((e: ReactPointerEvent) => {
    if (props.elementInfo.lock) return;
    e.stopPropagation();
    props.selectElement(nativePointerEvent(e), props.elementInfo);
  }, [props.elementInfo, props.selectElement]);

  const openDataEditor = () => {
    emitter.emit(EmitterEvents.OPEN_CHART_DATA_EDITOR);
  };

  const seriesColors = useMemo(() => resolveChartElementSeriesColors(elementInfo, {
    background: slideBackground,
    fallbackSurface: theme?.backgroundColor,
  }), [elementInfo, slideBackground, theme?.backgroundColor]);

  return <div
    className={cx('editable-element-chart', { lock: elementInfo.lock })}
    data-live-translate3d
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
        data-live-box
        data-chart-type={elementInfo.chartType}
        style={{
          width: elementInfo.width + 'px',
          height: elementInfo.height + 'px',
          backgroundColor: elementInfo.fill,
          borderRadius: outlineBorderRadius
        }}
        onContextMenu={event => { event.stopPropagation(); event.preventDefault(); openContextmenu(event, contextmenus); }}
        onMouseDown={$event => { handleSelectElement($event); }}
        onTouchStart={$event => { handleSelectElement($event); }}
        onDoubleClick={() => { openDataEditor(); }}
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
export default ChartElement;
