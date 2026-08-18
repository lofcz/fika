import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './BorderPanel.module.scss'
const cx = bindStyles(styles)
import { useCallback, memo } from 'react'

import { useI18nContext } from '@/i18n/useI18nContext'
import { useMainStore, useSlidesStore } from '@/store'
import { OUTLINE_RADIUS_MAX, OUTLINE_WIDTH_MAX } from '@/views/Editor/Toolbar/common/ElementOutline'
import { useToolbarStoreSelect } from '@/views/Editor/Toolbar/common/handleElement'
import type { LineStyleType, PPTElementOutline } from '@/types/slides'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import SVGLine from '@/views/Editor/Toolbar/common/SVGLine'
import Popover from '@/components/Popover'
import ColorButton from '@/components/ColorButton'
import ColorPicker from '@/components/ColorPicker/index'
import SelectCustom from '@/components/SelectCustom'
import Slider from '@/components/Slider'
import { outlineElementPatch, outlineRadiusToPercent, percentToOutlineRadius } from '@/utils/elementOutline'
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
  const box = useToolbarStoreSelect(() => {
    const el = findSlideElement(useSlidesStore.getState(), useMainStore.getState().handleElementId)
    return el ? { width: el.width, height: el.height } : { width: 0, height: 0 }
  }, (prev, next) => prev.width === next.width && prev.height === next.height)
  const lineStyleOptions: LineStyleType[] = ['solid', 'dashed', 'dotted']
  const { addHistorySnapshot } = useHistorySnapshot()

  const paintOutline = useCallback((outlineProps: Partial<PPTElementOutline>) => {
    const id = useMainStore.getState().handleElementId
    if (!id) return
    const slides = useSlidesStore.getState()
    const el = findSlideElement(slides, id)
    const baseOutline = (el && 'outline' in el ? el.outline : undefined) || slides.theme.outline
    const newOutline: PPTElementOutline = { ...baseOutline, ...outlineProps }
    slides.updateElement({
      id,
      props: outlineElementPatch(el || { type: 'text' }, newOutline, 'radius' in outlineProps),
    })
  }, [])

  const updateOutline = useCallback((outlineProps: Partial<PPTElementOutline>) => {
    paintOutline(outlineProps)
    addHistorySnapshot()
  }, [addHistorySnapshot, paintOutline])

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
            <Slider
              className={cx('control')}
              min={0}
              max={Math.max(OUTLINE_WIDTH_MAX, outline?.width || 0)}
              step={1}
              value={outline?.width || 0}
              onInput={value => paintOutline({ width: value })}
              onUpdateValue={value => updateOutline({ width: value })}
            />
          </div>
          <div className={cx('row')}>
            <div className={cx('label')}>{LL.canvas.floatingToolbar.border.radiusLabel()}</div>
            <Slider
              className={cx('control')}
              min={0}
              max={OUTLINE_RADIUS_MAX}
              step={1}
              tooltipSuffix="%"
              value={outlineRadiusToPercent(outline?.radius, box.width, box.height)}
              onInput={value => paintOutline({ radius: percentToOutlineRadius(value) })}
              onUpdateValue={value => updateOutline({ radius: percentToOutlineRadius(value) })}
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
