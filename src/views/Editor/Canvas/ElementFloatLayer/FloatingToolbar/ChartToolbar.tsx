import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './ChartToolbar.module.scss'
const cx = bindStyles(styles)
import { useCallback, memo } from 'react'

import { useSlidesStore, useMainStore } from '@/store'
import type { ChartType, PPTChartElement } from '@/types/slides'
import emitter, { EmitterEvents } from '@/utils/emitter'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import { useI18nContext } from '@/i18n/useI18nContext'
import Popover from '@/components/Popover'
import PopoverMenuItem from '@/components/PopoverMenuItem'
import { findSlideElement, sameElementId } from '../floatCompare'

export type IChartToolbarProps = {
  elementInfo: PPTChartElement
}

const ChartToolbar = memo((_props: IChartToolbarProps) => {
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

  const { addHistorySnapshot } = useHistorySnapshot()

  const openDataEditor = () => {
    emitter.emit(EmitterEvents.OPEN_CHART_DATA_EDITOR)
  }

  const changeChartType = useCallback((type: ChartType) => {
    const id = useMainStore.getState().handleElementId
    const slides = useSlidesStore.getState()
    const el = findSlideElement(slides, id)
    if (!el || el.type !== 'chart' || el.chartType === type) return
    slides.updateElement({
      id,
      props: { chartType: type },
    })
    addHistorySnapshot()
  }, [addHistorySnapshot])

  return (
    <div className={cx('toolbar-content')}>
      <button className={cx('toolbar-btn')} onClick={() => openDataEditor()}>
        <Icon icon="pencil" className={cx('icon')} />
        <span>{LL.canvas.floatingToolbar.chart.editData()}</span>
      </button>
      <Popover
        trigger="click"
        content={(
          <div className={cx('chart-type-list')}>
            {chartList.map(item => (
              <PopoverMenuItem center key={item} onClick={() => changeChartType(item)}>
                {chartTypeLabels[item]}
              </PopoverMenuItem>
            ))}
          </div>
        )}
      >
        <button className={cx('toolbar-btn')}>
          <Icon icon="chart-column" className={cx('icon')} />
          <span>{LL.canvas.floatingToolbar.chart.type()}</span>
        </button>
      </Popover>
    </div>
  )
}, sameElementId)

ChartToolbar.displayName = 'ChartToolbar'

export default ChartToolbar
