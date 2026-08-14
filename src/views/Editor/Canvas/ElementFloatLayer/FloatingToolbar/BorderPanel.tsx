import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './BorderPanel.module.scss'
const cx = bindStyles(styles)
import { useCallback, memo } from 'react'

import { useI18nContext } from '@/i18n/useI18nContext'
import { useMainStore, useSlidesStore } from '@/store'
import { useToolbarStoreSelect } from '@/views/Editor/Toolbar/common/handleElement'
import type { LineStyleType, PPTElementOutline } from '@/types/slides'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import SVGLine from '@/views/Editor/Toolbar/common/SVGLine'
import Popover from '@/components/Popover'
import ColorButton from '@/components/ColorButton'
import ColorPicker from '@/components/ColorPicker/index'
import NumberInput from '@/components/NumberInput'
import SelectCustom from '@/components/SelectCustom'
import { findSlideElement } from '../floatCompare'

function outlineEqual(prev?: PPTElementOutline, next?: PPTElementOutline) {
  if (prev === next) return true
  if (!prev || !next) return !prev && !next
  return prev.style === next.style && prev.color === next.color && prev.width === next.width && prev.radius === next.radius
}

const BorderPanel = memo(() => {
  const { LL } = useI18nContext()
  const themeOutline = useToolbarStoreSelect(
    () => useSlidesStore.getState().theme.outline,
    outlineEqual,
  )
  const outline = useToolbarStoreSelect(() => {
    const el = findSlideElement(useSlidesStore.getState(), useMainStore.getState().handleElementId)
    return el && 'outline' in el ? el.outline : undefined
  }, outlineEqual)
  const lineStyleOptions: LineStyleType[] = ['solid', 'dashed', 'dotted']
  const { addHistorySnapshot } = useHistorySnapshot()

  const updateOutline = useCallback((outlineProps: Partial<PPTElementOutline>) => {
    const id = useMainStore.getState().handleElementId
    if (!id) return
    const slides = useSlidesStore.getState()
    const el = findSlideElement(slides, id)
    const baseOutline = (el && 'outline' in el ? el.outline : undefined) || slides.theme.outline
    const newOutline: PPTElementOutline = { ...baseOutline, ...outlineProps }
    slides.updateElement({
      id,
      props: { outline: newOutline },
    })
    addHistorySnapshot()
  }, [addHistorySnapshot])

  return (
    <Popover
      trigger="click"
      contentStyle={{ width: '240px' }}
      content={(
        <div className={cx('border-popover')}>
          <div className={cx('row')}>
            <div className={cx('label')}>{LL.canvas.floatingToolbar.border.styleLabel()}</div>
            <SelectCustom
              className={cx('control')}
              options={lineStyleOptions.map(item => (
                <div className={cx('option')} key={item} onClick={() => updateOutline({ style: item })}>
                  <SVGLine type={item} />
                </div>
              ))}
              label={<SVGLine type={(outline?.style || 'solid') as LineStyleType} />}
            />
          </div>
          <div className={cx('row')}>
            <div className={cx('label')}>{LL.canvas.floatingToolbar.border.colorLabel()}</div>
            <Popover
              trigger="click"
              className={cx('control')}
              content={<ColorPicker modelValue={outline?.color || '#000'} onUpdateModelValue={value => updateOutline({ color: value })} />}
            >
              <ColorButton color={outline?.color || '#000'} />
            </Popover>
          </div>
          <div className={cx('row')}>
            <div className={cx('label')}>{LL.canvas.floatingToolbar.border.widthLabel()}</div>
            <NumberInput
              className={cx('control')}
              value={outline?.width || 0}
              onUpdateValue={value => updateOutline({ width: value })}
            />
          </div>
          <div className={cx('row')}>
            <div className={cx('label')}>{LL.canvas.floatingToolbar.border.radiusLabel()}</div>
            <NumberInput
              className={cx('control')}
              min={0}
              max={200}
              value={outline?.radius || 0}
              onUpdateValue={value => updateOutline({ radius: value })}
            />
          </div>
        </div>
      )}
    >
      <div className={cx('toolbar-btn')}>
        <Icon icon="check" className={cx('icon')} />
        <span>{LL.canvas.floatingToolbar.border.label()}</span>
      </div>
    </Popover>
  )
})

BorderPanel.displayName = 'BorderPanel'

export default BorderPanel
