import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './Header.module.scss'
const cx = bindStyles(styles)
import { useSnapshotStore, selectCanUndo, selectCanRedo } from '@/store'
import type { Mode } from '@/types/mobile'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import { useI18nContext } from '@/i18n/useI18nContext'

export type IHeaderProps = {
  changeMode: (mode: Mode) => void
}

export default function Header({ changeMode }: IHeaderProps) {
  const { LL } = useI18nContext()
  const canUndo = useSnapshotStore(selectCanUndo)
  const canRedo = useSnapshotStore(selectCanRedo)
  const { redo, undo } = useHistorySnapshot()

  return (
    <div className={cx('mobile-editor-header')}>
      <div className={cx('history')}>
        <div
          className={cx('history-item', { disable: !canUndo })}
          onClick={event => { event.stopPropagation(); undo() }}
        >
          <Icon icon="undo-2" /> {LL.mobile.editorHeader.undo()}
        </div>
        <div
          className={cx('history-item', { disable: !canRedo })}
          onClick={event => { event.stopPropagation(); redo() }}
        >
          <Icon icon="redo-2" /> {LL.mobile.editorHeader.redo()}
        </div>
      </div>
      <div className={cx('back')} onClick={() => changeMode('preview')}>
        <Icon icon="log-out" /> {LL.mobile.editorHeader.exitEdit()}
      </div>
    </div>
  )
}
