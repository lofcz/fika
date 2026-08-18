import { useRef, useCallback, memo, useEffect, useMemo, useState } from 'react'

import { useMainStore, useImportConfirmStore } from '@/store'
import type { ImportTransitionChoice } from '@/store/importConfirm'
import { DEFAULT_TURNING_MODE } from '@/configs/animation'
import { SLIDE_ANIMATION_PICKER } from '@/configs/transitions'
import type { TurningMode } from '@/types/slides'
import { useI18nContext } from '@/i18n/useI18nContext'
import {
  InkDialog,
  InkDialogChoice,
  InkDialogChoices,
  InkDialogFooter,
  InkDialogIntro,
} from '@/components/InkDialog'
import Button from '@/components/Button'
import RadioGroup from '@/components/RadioGroup'
import RadioButton from '@/components/RadioButton'
import Select from '@/components/Select'
import { bindStyles } from '@/utils/cssm'
import styles from './ImportReplaceDialog.module.scss'

const cx = bindStyles(styles)

const ImportReplaceDialog = memo(() => {
  const { LL } = useI18nContext()
  const visible = useImportConfirmStore(s => s.visible)
  const slideCount = useImportConfirmStore(s => s.slideCount)
  const replaceBtnRef = useRef<HTMLButtonElement | null>(null)
  const [transitionMode, setTransitionMode] = useState<'keep' | 'all'>('keep')
  const [allTurningMode, setAllTurningMode] = useState<TurningMode>(DEFAULT_TURNING_MODE)

  const transitionOptions = useMemo(() => {
    const slide = LL.configs.animation.slide
    return SLIDE_ANIMATION_PICKER.map(value => ({
      value,
      label: slide[value](),
    }))
  }, [LL])

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
    setTransitionMode('keep')
    setAllTurningMode(DEFAULT_TURNING_MODE)
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

  const turningChoice = ((): ImportTransitionChoice => (
    transitionMode === 'all' ? allTurningMode : 'keep'
  ))()

  const choose = useCallback((apply: 'replace' | 'append' | null) => {
    useImportConfirmStore.getState().settle(apply ? { apply, turningMode: turningChoice } : null)
  }, [turningChoice])

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

      <div className={cx('transition')}>
        <div className={cx('label')}>{LL.editor.header.importConflict.transitionLabel()}</div>
        <RadioGroup
          value={transitionMode}
          onUpdateValue={value => setTransitionMode(value as 'keep' | 'all')}
        >
          <RadioButton value="keep">{LL.editor.header.importConflict.transitionKeep()}</RadioButton>
          <RadioButton value="all">{LL.editor.header.importConflict.transitionAll()}</RadioButton>
        </RadioGroup>
        {transitionMode === 'all' ? (
          <Select
            className={cx('picker')}
            value={allTurningMode}
            options={transitionOptions}
            onUpdateValue={value => setAllTurningMode(value as TurningMode)}
          />
        ) : (
          <p className={cx('hint')}>{LL.editor.header.importConflict.transitionKeepHint()}</p>
        )}
      </div>

      <InkDialogFooter>
        <Button onClick={() => choose(null)}>{LL.common.cancel()}</Button>
      </InkDialogFooter>
    </InkDialog>
  )
})

export default ImportReplaceDialog
