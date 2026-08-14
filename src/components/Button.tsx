import { bindStyles } from '@/utils/cssm'
import styles from './Button.module.scss'
const cx = bindStyles(styles)
import type { ReactNode } from 'react'

export type IButtonProps = {
  checked?: boolean
  disabled?: boolean
  type?: 'default' | 'primary' | 'checkbox' | 'radio'
  size?: 'small' | 'normal'
  first?: boolean
  last?: boolean
  onClick?: () => void
  children?: ReactNode
  style?: React.CSSProperties
  className?: string
  'data-tooltip'?: string
  'data-export-format'?: string
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
      className={classes}
      style={style}
      data-tooltip={dataTooltip}
      data-export-format={dataExportFormat}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        if (disabled) return
        onClick?.()
      }}
    >
      {children}
    </button>
  )
}
