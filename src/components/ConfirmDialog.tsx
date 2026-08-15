import { memo, useEffect, useId, useRef } from 'react'

import {
  InkDialog,
  InkDialogChoice,
  InkDialogChoices,
  InkDialogFooter,
  InkDialogIntro,
} from '@/components/InkDialog'
import type { IconName } from '@/components/Icon'
import Button from '@/components/Button'
import { useMainStore } from '@/store'

export type IConfirmDialogProps = {
  visible: boolean
  width?: number
  icon?: IconName
  kicker?: string
  title: string
  description?: string
  actionTitle: string
  actionHint?: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
}

const ConfirmDialog = memo((props: IConfirmDialogProps) => {
  const width = props.width ?? 420
  const icon = props.icon ?? 'file-plus'
  const titleId = useId()
  const descriptionId = useId()
  const actionRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    useMainStore.getState().setDisableHotkeysState(props.visible)
    if (!props.visible) return
    let cancelled = false
    let frame = 0
    queueMicrotask(() => {
      if (cancelled) return
      frame = requestAnimationFrame(() => actionRef.current?.focus())
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      useMainStore.getState().setDisableHotkeysState(false)
    }
  }, [props.visible])

  return (
    <InkDialog
      visible={props.visible}
      width={width}
      labelledBy={titleId}
      describedBy={props.description ? descriptionId : undefined}
      onClose={props.onCancel}
    >
      <InkDialogIntro
        kicker={props.kicker}
        title={props.title}
        subtitle={props.description}
        titleId={titleId}
        subtitleId={props.description ? descriptionId : undefined}
      />
      <InkDialogChoices>
        <InkDialogChoice
          buttonRef={actionRef}
          icon={icon}
          name={props.actionTitle}
          hint={props.actionHint}
          emphasis
          onClick={props.onConfirm}
        />
      </InkDialogChoices>
      <InkDialogFooter>
        <Button onClick={props.onCancel}>{props.cancelLabel}</Button>
      </InkDialogFooter>
    </InkDialog>
  )
})

export default ConfirmDialog
