import { bindStyles } from '@/utils/cssm'
import styles from './FormatChip.module.scss'
const cx = bindStyles(styles)
import { type CSSProperties, type ReactNode, memo } from 'react'

export type IFormatChipProps = {
  active?: boolean
  disabled?: boolean
  compact?: boolean
  className?: string
  style?: CSSProperties
  'data-tooltip'?: string
  onClick?: () => void
  onDoubleClick?: () => void
  children?: ReactNode
}

const FormatChip = memo((vrProps: IFormatChipProps) => {
  const active = vrProps.active ?? false
  const disabled = vrProps.disabled ?? false
  const compact = vrProps.compact ?? false

  return (
    <button
      className={cx('format-chip', { on: active, compact }, vrProps.className)}
      style={vrProps.style}
      type="button"
      disabled={disabled}
      data-tooltip={vrProps['data-tooltip']}
      onMouseDown={(event) => { event.preventDefault() }}
      onClick={() => { vrProps.onClick?.() }}
      onDoubleClick={() => { vrProps.onDoubleClick?.() }}
    >
      {vrProps.children}
    </button>
  )
})

export default FormatChip
