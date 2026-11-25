import { type CSSProperties, type ReactNode, memo, useMemo } from 'react'
import { RadioGroupValueContext } from '@/types/injectKey'
import ButtonGroup from './ButtonGroup'

export type IRadioGroupProps = {
  value: string
  disabled?: boolean
  className?: string
  style?: CSSProperties
  'data-tooltip'?: string
  onUpdateValue?: (payload: string) => void
  children?: ReactNode
}

const RadioGroup = memo((props: IRadioGroupProps) => {
  const { value, disabled = false, onUpdateValue, children, className, style } = props
  const contextValue = useMemo(() => ({
    value,
    updateValue: (next: string) => { if (!disabled) onUpdateValue?.(next) },
  }), [value, disabled, onUpdateValue])
  return (
    <RadioGroupValueContext.Provider value={contextValue}>
      <ButtonGroup className={['radio-group', className].filter(Boolean).join(' ')} style={style}>
        {children}
      </ButtonGroup>
    </RadioGroupValueContext.Provider>
  )
})

export default RadioGroup
