import { bindStyles } from '@/utils/cssm'
import { Icon, type IconName } from '@/components/Icon'
import styles from './InkDialog.module.scss'
const cx = bindStyles(styles)
import { type ReactNode, type Ref, memo } from 'react'

import Modal from '@/components/Modal'

export type IInkDialogProps = {
  visible: boolean
  width?: number
  closeButton?: boolean
  labelledBy?: string
  describedBy?: string
  onClose: () => void
  children?: ReactNode
}

export const InkDialog = memo((props: IInkDialogProps) => {
  const width = props.width ?? 440
  const closeButton = props.closeButton ?? true
  return (
    <Modal
      visible={props.visible}
      width={width}
      closeButton={closeButton}
      onUpdateVisible={open => { if (!open) props.onClose() }}
    >
      <div
        className={cx('ink-dialog')}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={props.labelledBy}
        aria-describedby={props.describedBy}
      >
        {props.children}
      </div>
    </Modal>
  )
})

export type IInkDialogIntroProps = {
  kicker?: string
  title: string
  subtitle?: string
  titleId?: string
  subtitleId?: string
}

export const InkDialogIntro = memo((props: IInkDialogIntroProps) => (
  <div className={cx('intro')}>
    {props.kicker ? <div className={cx('kicker')}>{props.kicker}</div> : null}
    <div className={cx('title')} id={props.titleId}>{props.title}</div>
    {props.subtitle ? <div className={cx('subtitle')} id={props.subtitleId}>{props.subtitle}</div> : null}
  </div>
))

export type IInkDialogChoicesProps = {
  children?: ReactNode
}

export const InkDialogChoices = memo((props: IInkDialogChoicesProps) => (
  <div className={cx('choices')} role="group">{props.children}</div>
))

export type IInkDialogChoiceProps = {
  icon: IconName
  name: string
  hint?: string
  emphasis?: boolean
  buttonRef?: Ref<HTMLButtonElement>
  onClick: () => void
}

export const InkDialogChoice = memo((props: IInkDialogChoiceProps) => (
  <button
    ref={props.buttonRef}
    type="button"
    className={cx('choice', props.emphasis && 'choice-emphasis')}
    onClick={props.onClick}
  >
    <span className={cx('glyph', !props.emphasis && 'glyph-quiet')} aria-hidden={true}>
      <Icon icon={props.icon} />
    </span>
    <span className={cx('copy')}>
      <span className={cx('name')}>{props.name}</span>
      {props.hint ? <span className={cx('hint')}>{props.hint}</span> : null}
    </span>
  </button>
))

export type IInkDialogFooterProps = {
  children?: ReactNode
}

export const InkDialogFooter = memo((props: IInkDialogFooterProps) => (
  <div className={cx('footer')}>{props.children}</div>
))
