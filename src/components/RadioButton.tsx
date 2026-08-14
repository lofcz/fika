import { type CSSProperties, type ReactNode, memo, useContext } from 'react'
import { RadioGroupValueContext, type RadioGroupValue } from '@/types/injectKey'
import Button from './Button'

export type IRadioButtonProps = {
  value: string
  disabled?: boolean
  className?: string
  style?: CSSProperties
  'data-tooltip'?: string
  children?: ReactNode
}

const RadioButton = memo((props: IRadioButtonProps) => {
  const {
    value,
    disabled = false,
    className,
    style,
    'data-tooltip': dataTooltip,
    children,
  } = props
  const group = useContext(RadioGroupValueContext) as RadioGroupValue | null
  return (
    <Button
      checked={!disabled && group?.value === value}
      disabled={disabled}
      type="radio"
      className={className}
      style={style}
      data-tooltip={dataTooltip}
      onClick={() => { if (!disabled) group?.updateValue(value) }}
    >
      {children}
    </Button>
  )
})

export default RadioButton
