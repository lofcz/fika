import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './ChartPool.module.scss'
const cx = bindStyles(styles)
import type { CSSProperties } from 'react'
import type { ChartType } from '@/types/slides'
import { useI18nContext } from '@/i18n/useI18nContext'
import FitText from '@/components/FitText'

export type IChartPoolProps = {
  className?: string
  style?: CSSProperties
  onSelect?: (payload: ChartType) => void
}

export default function ChartPool(props: IChartPoolProps) {
  const { LL } = useI18nContext()

  const chartList: ChartType[] = ['bar', 'column', 'line', 'area', 'scatter', 'pie', 'ring', 'radar']

  const chartTypeLabels = (() => {
    const types = LL.configs.chart.types
    return {
      bar: types.bar(),
      column: types.column(),
      line: types.line(),
      area: types.area(),
      scatter: types.scatter(),
      pie: types.pie(),
      ring: types.ring(),
      radar: types.radar(),
    } satisfies Record<ChartType, string>
  })()

  const selectChart = (chart: ChartType) => {
    props.onSelect?.(chart)
  }

  return (
    <ul className={cx('chart-pool', props.className)} style={props.style}>
      {chartList.map((chart, index) => (
        <li className={cx('chart-item')} key={index}>
          <div className={cx('chart-content')} data-chart-type={chart} onClick={() => selectChart(chart)}>
            {chart === 'line' ? <Icon icon="chart-line" style={{ fontSize: '24px' }} />
              : chart === 'bar' ? <Icon icon="chart-column" style={{ fontSize: '24px' }} />
                : chart === 'pie' ? <Icon icon="chart-pie" style={{ fontSize: '24px' }} />
                  : chart === 'column' ? <Icon icon="chart-bar" style={{ fontSize: '24px' }} />
                    : chart === 'area' ? <Icon icon="chart-area" style={{ fontSize: '24px' }} />
                      : chart === 'ring' ? <Icon icon="chart-pie" style={{ fontSize: '24px' }} />
                        : chart === 'scatter' ? <Icon icon="chart-scatter" style={{ fontSize: '24px' }} />
                          : chart === 'radar' ? <Icon icon="radar" style={{ fontSize: '23px' }} />
                            : null}
            <div className={cx('name')}>
              <FitText
                text={chartTypeLabels[chart]}
                maxFontSize={12}
                minFontSize={9}
                maxLines={2}
                lineHeight={1.15}
              />
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
