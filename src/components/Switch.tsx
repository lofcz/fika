import { bindStyles } from '@/utils/cssm'
import styles from './Switch.module.scss'
const cx = bindStyles(styles)
import { type CSSProperties, memo } from 'react'

export type ISwitchProps = {
  value: boolean
  disabled?: boolean
  className?: string
  style?: CSSProperties
  'data-tooltip'?: string
  onUpdateValue?: (payload: boolean) => void
}

const Switch = memo((vrProps: ISwitchProps) => {
  const {
    value,
    disabled = false,
    className,
    style,
    'data-tooltip': dataTooltip,
    onUpdateValue,
  } = vrProps

  const handleChange = () => {
    if (disabled) return
    onUpdateValue?.(!value)
  }

  return (
    <span
      className={cx('switch', { active: value, disabled }, className)}
      style={style}
      data-tooltip={dataTooltip}
      onClick={handleChange}
    >
      <span className={cx('switch-core')} />
    </span>
  )
})

export default Switch
