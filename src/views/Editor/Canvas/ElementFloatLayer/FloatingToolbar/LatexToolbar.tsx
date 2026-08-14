import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './LatexToolbar.module.scss'
const cx = bindStyles(styles)
import { useCallback, memo } from 'react'
import { useMainStore, useSlidesStore } from '@/store'
import type { PPTLatexElement } from '@/types/slides'
import emitter, { EmitterEvents } from '@/utils/emitter'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import Popover from '@/components/Popover'
import ColorPicker from '@/components/ColorPicker/index'
import { useI18nContext } from '@/i18n/useI18nContext'
import { findSlideElement, sameElementId } from '../floatCompare'

export type ILatexToolbarProps = {
  elementInfo: PPTLatexElement
}

const LatexToolbar = memo((_props: ILatexToolbarProps) => {
  const { LL } = useI18nContext()
  const handleElementId = useMainStore(s => s.handleElementId)
  const color = useSlidesStore(s => {
    const el = findSlideElement(s, handleElementId)
    return el && el.type === 'latex' ? el.color : undefined
  })
  const { addHistorySnapshot } = useHistorySnapshot()

  const updateLatex = useCallback((latexProps: Partial<PPTLatexElement>) => {
    const id = useMainStore.getState().handleElementId
    if (!id) return
    useSlidesStore.getState().updateElement({
      id,
      props: latexProps,
    })
    addHistorySnapshot()
  }, [addHistorySnapshot])

  const openLatexEditor = () => {
    emitter.emit(EmitterEvents.OPEN_LATEX_EDITOR)
  }

  return (
    <div className={cx('toolbar-content')}>
      <button className={cx('toolbar-btn')} onClick={() => openLatexEditor()}>
        <Icon icon="pencil" className={cx('icon')} />
        <span>{LL.canvas.floatingToolbar.editLatex()}</span>
      </button>
      <Popover
        trigger="click"
        content={<ColorPicker modelValue={color} onUpdateModelValue={value => updateLatex({ color: value })} />}
      >
        <button className={cx('toolbar-btn')}>
          <Icon icon="palette" className={cx('icon')} />
          <span>{LL.canvas.floatingToolbar.color()}</span>
        </button>
      </Popover>
    </div>
  )
}, sameElementId)

LatexToolbar.displayName = 'LatexToolbar'

export default LatexToolbar
