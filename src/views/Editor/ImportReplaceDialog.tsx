import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './ImportReplaceDialog.module.scss'
const cx = bindStyles(styles)
import { useRef, useCallback, memo, useEffect } from 'react'

import { useMainStore, useImportConfirmStore } from '@/store'
import type { ImportConfirmChoice } from '@/store/importConfirm'
import { useI18nContext } from '@/i18n/useI18nContext'
import Modal from '@/components/Modal'
import Button from '@/components/Button'

const ImportReplaceDialog = memo(() => {
  const { LL } = useI18nContext()
  const visible = useImportConfirmStore(s => s.visible)
  const slideCount = useImportConfirmStore(s => s.slideCount)
  const replaceBtnRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const unregister = useImportConfirmStore.getState().register()
    return () => {
      unregister()
      if (useImportConfirmStore.getState().visible) {
        useImportConfirmStore.getState().settle(null)
      }
      useMainStore.getState().setDisableHotkeysState(false)
    }
  }, [])

  useEffect(() => {
    useMainStore.getState().setDisableHotkeysState(visible)
    if (!visible) return
    let cancelled = false
    let frame = 0
    queueMicrotask(() => {
      if (cancelled) return
      frame = requestAnimationFrame(() => replaceBtnRef.current?.focus())
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
    }
  }, [visible])

  const choose = useCallback((choice: ImportConfirmChoice) => {
    useImportConfirmStore.getState().settle(choice)
  }, [])

  const onVisibleChange = useCallback((open: boolean) => {
    if (!open) useImportConfirmStore.getState().settle(null)
  }, [])

  return (
    <Modal visible={visible} width={440} closeButton onUpdateVisible={onVisibleChange}>
      <div className={cx('import-replace-dialog')}>
        <div className={cx('intro')}>
          <div className={cx('kicker')}>{LL.editor.header.importConflict.kicker()}</div>
          <div className={cx('title')}>{LL.editor.header.importConflict.title()}</div>
          <div className={cx('subtitle')}>
            {LL.editor.header.importConflict.description({ count: slideCount })}
          </div>
        </div>

        <div className={cx('choices')} role="group">
          <button
            ref={replaceBtnRef}
            type="button"
            className={cx('choice', 'choice-replace')}
            onClick={() => choose('replace')}
          >
            <span className={cx('glyph')} aria-hidden={true}>
              <Icon icon="arrow-left-right" />
            </span>
            <span className={cx('copy')}>
              <span className={cx('name')}>{LL.editor.header.importConflict.replaceTitle()}</span>
              <span className={cx('hint')}>{LL.editor.header.importConflict.replaceHint()}</span>
            </span>
          </button>

          <button
            type="button"
            className={cx('choice')}
            onClick={() => choose('append')}
          >
            <span className={cx('glyph', 'glyph-quiet')} aria-hidden={true}>
              <Icon icon="plus" />
            </span>
            <span className={cx('copy')}>
              <span className={cx('name')}>{LL.editor.header.importConflict.appendTitle()}</span>
              <span className={cx('hint')}>{LL.editor.header.importConflict.appendHint()}</span>
            </span>
          </button>
        </div>

        <div className={cx('footer')}>
          <Button onClick={() => choose(null)}>{LL.common.cancel()}</Button>
        </div>
      </div>
    </Modal>
  )
})

export default ImportReplaceDialog
