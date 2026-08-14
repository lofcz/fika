import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './CodeToolbar.module.scss'
const cx = bindStyles(styles)
import { useCallback, memo } from 'react'
import type { PPTCodeElement } from '@/types/slides'
import emitter, { EmitterEvents } from '@/utils/emitter'
import { useI18nContext } from '@/i18n/useI18nContext'
import { sameElementId } from '../floatCompare'

export type ICodeToolbarProps = {
  elementInfo: PPTCodeElement
}

const CodeToolbar = memo((props: ICodeToolbarProps) => {
  const { LL } = useI18nContext()

  const openCodeEditor = useCallback(() => {
    emitter.emit(EmitterEvents.OPEN_CODE_EDITOR, props.elementInfo.id)
  }, [props.elementInfo.id])

  return (
    <div className={cx('toolbar-content')}>
      <button className={cx('toolbar-btn')} onClick={() => openCodeEditor()}>
        <Icon icon="pencil" className={cx('icon')} />
        <span>{LL.canvas.floatingToolbar.editCode()}</span>
      </button>
    </div>
  )
}, sameElementId)

CodeToolbar.displayName = 'CodeToolbar'

export default CodeToolbar
