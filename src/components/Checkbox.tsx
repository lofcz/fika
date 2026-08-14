import { bindStyles } from '@/utils/cssm'
import styles from './Checkbox.module.scss'
const cx = bindStyles(styles)
import { type CSSProperties, type ReactNode, memo } from 'react'

export type ICheckboxProps = {
  value: boolean
  disabled?: boolean
  className?: string
  style?: CSSProperties
  'data-tooltip'?: string
  onUpdateValue?: (payload: boolean) => void
  children?: ReactNode
}

const Checkbox = memo((vrProps: ICheckboxProps) => {
  const {
    value,
    disabled = false,
    className,
    style,
    'data-tooltip': dataTooltip,
    onUpdateValue,
    children,
  } = vrProps

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return
    onUpdateValue?.(e.target.checked)
  }

  return (
    <label
      className={cx('checkbox', { checked: value, disabled }, className)}
      style={style}
      data-tooltip={dataTooltip}
    >
      <span className={cx('checkbox-input')} />
      <input
        className={cx('checkbox-original')}
        type="checkbox"
        checked={value}
        disabled={disabled}
        onChange={handleChange}
      />
      <span className={cx('checkbox-label')}>{children}</span>
    </label>
  )
})

export default Checkbox
