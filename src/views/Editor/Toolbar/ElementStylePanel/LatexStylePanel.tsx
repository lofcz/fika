import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './LatexStylePanel.module.scss'
const cx = bindStyles(styles)
import { memo } from 'react'
import { useSlidesStore } from '@/store'
import { getHandleElement, useHandleElementShallow } from '../common/handleElement'
import type { PPTLatexElement } from '@/types/slides'
import emitter, { EmitterEvents } from '@/utils/emitter'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import { useI18nContext } from '@/i18n/useI18nContext'
import ColorButton from '@/components/ColorButton'
import ColorPicker from '@/components/ColorPicker/index'
import Divider from '@/components/Divider'
import Button from '@/components/Button'
import NumberInput from '@/components/NumberInput'
import Popover from '@/components/Popover'

const LatexStylePanel = memo(() => {
  const { LL } = useI18nContext()
  const handleLatexElement = useHandleElementShallow(el => {
    if (!el || el.type !== 'latex') return null
    return { color: el.color, strokeWidth: el.strokeWidth }
  })
  const { addHistorySnapshot } = useHistorySnapshot()

  const updateLatex = (props: Partial<PPTLatexElement>) => {
    const handleElement = getHandleElement()
    if (!handleElement) return
    useSlidesStore.getState().updateElement({ id: handleElement.id, props })
    addHistorySnapshot()
  }

  const openLatexEditor = () => emitter.emit(EmitterEvents.OPEN_LATEX_EDITOR)

  if (!handleLatexElement) return null

  return (
    <div className={cx('latex-style-panel')}>
      <div className={cx('row')}>
        <Button style={{ flex: '1' }} onClick={() => openLatexEditor()}>
          <Icon icon="pencil" /> {LL.canvas.floatingToolbar.editLatex()}
        </Button>
      </div>
      <Divider />
      <div className={cx('row')}>
        <div style={{ width: '40%' }}>{LL.editor.stylePanel.latex.color()}</div>
        <Popover
          trigger="click"
          style={{ width: '60%' }}
          content={<ColorPicker modelValue={handleLatexElement.color} onUpdateModelValue={value => updateLatex({ color: value })} />}
        >
          <ColorButton color={handleLatexElement.color} />
        </Popover>
      </div>
      <div className={cx('row')}>
        <div style={{ width: '40%' }}>{LL.editor.stylePanel.latex.strokeWidth()}</div>
        <NumberInput
          min={1}
          max={3}
          value={handleLatexElement.strokeWidth}
          onUpdateValue={value => updateLatex({ strokeWidth: value })}
          style={{ width: '60%' }}
        />
      </div>
    </div>
  )
})

export default LatexStylePanel
