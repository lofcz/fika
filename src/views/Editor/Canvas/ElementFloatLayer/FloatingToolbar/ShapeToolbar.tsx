import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './ShapeToolbar.module.scss'
const cx = bindStyles(styles)
import { useCallback, memo, useEffect } from 'react'

import { useMainStore, useSlidesStore } from '@/store'
import type { PPTShapeElement } from '@/types/slides'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import BorderPanel from './BorderPanel'
import TextStyleControls from './TextStyleControls'
import Popover from '@/components/Popover'
import ColorPicker from '@/components/ColorPicker/index'
import { useI18nContext } from '@/i18n/useI18nContext'
import { findSlideElement, sameElementId } from '../floatCompare'

export type IShapeToolbarProps = {
  elementInfo: PPTShapeElement
  onResize?: () => void
}

const ShapeToolbar = memo((props: IShapeToolbarProps) => {
  const { LL } = useI18nContext()
  const handleElementId = useMainStore(s => s.handleElementId)
  const fill = useSlidesStore(s => {
    const el = findSlideElement(s, handleElementId)
    if (!el || el.type !== 'shape') return '#fff'
    return el.fill || '#fff'
  })
  const showTextStyleControls = useSlidesStore(s => {
    const el = findSlideElement(s, handleElementId)
    return !!(el && el.type === 'shape' && el.text?.content)
  })

  useEffect(() => {
    Promise.resolve().then(() => props.onResize?.())
  }, [showTextStyleControls, props.onResize])

  const { addHistorySnapshot } = useHistorySnapshot()

  const updateFill = useCallback((value: string) => {
    const id = useMainStore.getState().handleElementId
    const slides = useSlidesStore.getState()
    slides.removeElementProps({
      id,
      propName: ['gradient', 'pattern'],
    })
    slides.updateElement({
      id,
      props: { fill: value },
    })
    addHistorySnapshot()
  }, [addHistorySnapshot])

  return (
    <div className={cx('toolbar-content')}>
      <Popover
        trigger="click"
        content={<ColorPicker modelValue={fill} onUpdateModelValue={value => updateFill(value)} />}
      >
        <button className={cx('toolbar-btn')}>
          <Icon icon="paint-bucket" className={cx('icon')} />
          <span>{LL.canvas.floatingToolbar.fill()}</span>
        </button>
      </Popover>
      <BorderPanel />
      {showTextStyleControls ? (
        <>
          <div className={cx('divider')} />
          <TextStyleControls />
        </>
      ) : null}
    </div>
  )
}, sameElementId)

ShapeToolbar.displayName = 'ShapeToolbar'

export default ShapeToolbar
