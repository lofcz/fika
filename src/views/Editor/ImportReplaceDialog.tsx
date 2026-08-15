import { useRef, useCallback, memo, useEffect } from 'react'

import { useMainStore, useImportConfirmStore } from '@/store'
import type { ImportConfirmChoice } from '@/store/importConfirm'
import { useI18nContext } from '@/i18n/useI18nContext'
import {
  InkDialog,
  InkDialogChoice,
  InkDialogChoices,
  InkDialogFooter,
  InkDialogIntro,
} from '@/components/InkDialog'
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

  return (
    <InkDialog visible={visible} width={440} onClose={() => choose(null)}>
      <InkDialogIntro
        kicker={LL.editor.header.importConflict.kicker()}
        title={LL.editor.header.importConflict.title()}
        subtitle={LL.editor.header.importConflict.description({ count: slideCount })}
      />

      <InkDialogChoices>
        <InkDialogChoice
          buttonRef={replaceBtnRef}
          icon="arrow-left-right"
          name={LL.editor.header.importConflict.replaceTitle()}
          hint={LL.editor.header.importConflict.replaceHint()}
          emphasis
          onClick={() => choose('replace')}
        />
        <InkDialogChoice
          icon="plus"
          name={LL.editor.header.importConflict.appendTitle()}
          hint={LL.editor.header.importConflict.appendHint()}
          onClick={() => choose('append')}
        />
      </InkDialogChoices>

      <InkDialogFooter>
        <Button onClick={() => choose(null)}>{LL.common.cancel()}</Button>
      </InkDialogFooter>
    </InkDialog>
  )
})

export default ImportReplaceDialog
