import { bindStyles } from '@/utils/cssm'
import styles from './Input.module.scss'
const cx = bindStyles(styles)
import { type CSSProperties, type ReactNode, forwardRef, useImperativeHandle, useRef, useState } from 'react'

export type InputHandle = {
  focus: () => void
}

export type IInputProps = {
  value: string
  disabled?: boolean
  placeholder?: string
  simple?: boolean
  maxlength?: number
  className?: string
  style?: CSSProperties
  'data-tooltip'?: string
  onUpdateValue?: (payload: string) => void
  onInput?: (payload: Event) => void
  onChange?: (payload: Event) => void
  onBlur?: (payload: Event) => void
  onFocus?: (payload: Event) => void
  onEnter?: (payload: Event) => void
  onBackspace?: (payload: Event) => void
  prefix?: ReactNode
  suffix?: ReactNode
}

const Input = forwardRef<InputHandle, IInputProps>(function Input(vrProps, expose) {
  const {
    value,
    disabled = false,
    placeholder = '',
    simple = false,
    maxlength,
    className,
    style,
    'data-tooltip': dataTooltip,
    onUpdateValue,
    onInput,
    onChange,
    onBlur,
    onFocus,
    onEnter,
    onBackspace,
    prefix,
    suffix,
  } = vrProps

  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const handleInput = (e: React.FormEvent<HTMLInputElement>) => {
    onUpdateValue?.(e.currentTarget.value)
    onInput?.(e.nativeEvent)
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setFocused(false)
    onBlur?.(e.nativeEvent)
  }

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setFocused(true)
    onFocus?.(e.nativeEvent)
  }

  useImperativeHandle(expose, () => ({
    focus: () => { inputRef.current?.focus() },
  }))

  return (
    <div
      className={cx('input', { disabled, focused, simple }, className)}
      style={style}
      data-tooltip={dataTooltip}
    >
      <span className={cx('prefix')}>{prefix}</span>
      <input
        type="text"
        ref={inputRef}
        disabled={disabled}
        value={value}
        placeholder={placeholder}
        maxLength={maxlength}
        onInput={handleInput}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onChange={(event) => onChange?.(event.nativeEvent)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onEnter?.(event.nativeEvent)
          if (event.key === 'Backspace') onBackspace?.(event.nativeEvent)
        }}
      />
      <span className={cx('suffix')}>{suffix}</span>
    </div>
  )
})

export default Input
