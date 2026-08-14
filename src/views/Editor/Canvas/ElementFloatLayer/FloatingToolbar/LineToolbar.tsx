import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './LineToolbar.module.scss'
const cx = bindStyles(styles)
import { useCallback, memo } from 'react'

import { useMainStore, useSlidesStore } from '@/store'
import { useToolbarStoreSelect } from '@/views/Editor/Toolbar/common/handleElement'
import type { LineStyleType, PPTLineElement } from '@/types/slides'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import SVGLine from '@/views/Editor/Toolbar/common/SVGLine'
import Popover from '@/components/Popover'
import ColorPicker from '@/components/ColorPicker/index'
import Slider from '@/components/Slider'
import { useI18nContext } from '@/i18n/useI18nContext'
import { findSlideElement, sameElementId } from '../floatCompare'

export type ILineToolbarProps = {
  elementInfo: PPTLineElement
}

const LineToolbar = memo((_props: ILineToolbarProps) => {
  const { LL } = useI18nContext()
  const line = useToolbarStoreSelect(() => {
    const el = findSlideElement(useSlidesStore.getState(), useMainStore.getState().handleElementId)
    if (!el || el.type !== 'line') return null
    return { style: el.style, color: el.color, width: el.width }
  }, (prev, next) => (
    prev === next ||
    (!!prev && !!next && prev.style === next.style && prev.color === next.color && prev.width === next.width)
  ))
  const lineStyleOptions: LineStyleType[] = ['solid', 'dashed', 'dotted']
  const { addHistorySnapshot } = useHistorySnapshot()

  const updateLine = useCallback((lineProps: Partial<PPTLineElement>) => {
    const id = useMainStore.getState().handleElementId
    if (!id) return
    useSlidesStore.getState().updateElement({
      id,
      props: lineProps,
    })
    addHistorySnapshot()
  }, [addHistorySnapshot])

  if (!line) return null

  return (
    <div className={cx('toolbar-content')}>
      <Popover
        trigger="click"
        contentStyle={{ width: '120px' }}
        content={(
          <div className={cx('line-style-list')}>
            {lineStyleOptions.map(item => (
              <div
                className={cx('line-style-item', { active: line.style === item })}
                key={item}
                onClick={() => updateLine({ style: item })}
              >
                <SVGLine type={item} />
              </div>
            ))}
          </div>
        )}
      >
        <button className={cx('toolbar-btn')}>
          <Icon icon="spline" className={cx('icon')} />
          <span>{LL.canvas.floatingToolbar.style()}</span>
        </button>
      </Popover>
      <Popover
        trigger="click"
        content={<ColorPicker modelValue={line.color} onUpdateModelValue={value => updateLine({ color: value })} />}
      >
        <button className={cx('toolbar-btn')}>
          <Icon icon="palette" className={cx('icon')} />
          <span>{LL.canvas.floatingToolbar.color()}</span>
        </button>
      </Popover>
      <div className={cx('width-slider')}>
        <Slider
          min={1}
          max={12}
          step={1}
          value={line.width}
          onUpdateValue={value => updateLine({ width: value as number })}
        />
      </div>
    </div>
  )
}, sameElementId)

LineToolbar.displayName = 'LineToolbar'

export default LineToolbar
