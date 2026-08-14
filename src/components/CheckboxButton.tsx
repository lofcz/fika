import { type CSSProperties, type ReactNode, memo } from 'react'
import Button from './Button'

export type ICheckboxButtonProps = {
  checked?: boolean
  disabled?: boolean
  className?: string
  style?: CSSProperties
  'data-tooltip'?: string
  children?: ReactNode
}

const CheckboxButton = memo((props: ICheckboxButtonProps) => {
  const {
    checked = false,
    disabled = false,
    className,
    style,
    'data-tooltip': dataTooltip,
    children,
  } = props
  return (
    <Button
      checked={checked}
      disabled={disabled}
      type="checkbox"
      className={className}
      style={style}
      data-tooltip={dataTooltip}
    >
      {children}
    </Button>
  )
})

export default CheckboxButton
