import { bindStyles } from '@/utils/cssm'
import styles from './Button.module.scss'
const cx = bindStyles(styles)
import type { ReactNode, MouseEvent } from 'react'

export type IButtonProps = {
  checked?: boolean
  disabled?: boolean
  type?: 'default' | 'primary' | 'checkbox' | 'radio'
  size?: 'small' | 'normal'
  first?: boolean
  last?: boolean
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
  children?: ReactNode
  style?: React.CSSProperties
  className?: string
  'data-tooltip'?: string
  'data-export-format'?: string
  'data-editor-insert'?: string
  'data-editor-replace'?: string
  'data-align'?: string
  'aria-label'?: string
}

export default function Button({
  checked = false,
  disabled = false,
  type = 'default',
  size = 'normal',
  first = false,
  last = false,
  onClick,
  children,
  style,
  className,
  'data-tooltip': dataTooltip,
  'data-export-format': dataExportFormat,
  'data-editor-insert': dataEditorInsert,
  'data-editor-replace': dataEditorReplace,
  'data-align': dataAlign,
  'aria-label': ariaLabel,
}: IButtonProps) {
  const classes = cx(
    'button',
    disabled && 'disabled',
    !disabled && checked && 'checked',
    !disabled && type,
    size === 'small' && 'small',
    first && 'first',
    last && 'last',
    className,
  )

  return (
    <button
      type="button"
      className={classes}
      style={style}
      data-tooltip={dataTooltip}
      data-export-format={dataExportFormat}
      data-editor-insert={dataEditorInsert}
      data-editor-replace={dataEditorReplace}
      data-align={dataAlign}
      aria-label={ariaLabel}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={event => {
        if (disabled) return
        onClick?.(event)
      }}
    >
      {children}
    </button>
  )
}
