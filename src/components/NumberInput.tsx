import { bindStyles } from '@/utils/cssm'
import styles from './NumberInput.module.scss'
const cx = bindStyles(styles)
import { type CSSProperties, type ReactNode, useCallback, useRef, memo, useState, useEffect } from 'react'

export type INumberInputProps = {
  value: number
  disabled?: boolean
  placeholder?: string
  min?: number
  max?: number
  step?: number
  /** Shrink prefix label to one line via FitText in the prefix slot. */
  fitPrefix?: boolean
  className?: string
  style?: CSSProperties
  'data-tooltip'?: string
  onUpdateValue?: (payload: number) => void
  onInput?: (payload: Event) => void
  onChange?: (payload: Event) => void
  onBlur?: (payload: Event) => void
  onFocus?: (payload: Event) => void
  onEnter?: (payload: Event) => void
  prefix?: ReactNode
  suffix?: ReactNode
}

const NumberInput = memo((vrProps: INumberInputProps) => {
  const {
    value,
    disabled = false,
    placeholder = '',
    min = 0,
    max = Infinity,
    step = 1,
    fitPrefix = false,
    className,
    style,
    'data-tooltip': dataTooltip,
    onUpdateValue,
    onInput,
    onChange,
    onBlur,
    onFocus,
    onEnter,
    prefix,
    suffix,
  } = vrProps

  const [number, setNumber] = useState<string | number>(value)
  const [focused, setFocused] = useState(false)
  const skipNumberEmit = useRef(true)

  useEffect(() => {
    if (value !== number) setNumber(value)
  }, [value])

  useEffect(() => {
    if (skipNumberEmit.current) {
      skipNumberEmit.current = false
      return
    }
    const next = +number
    if (isNaN(next)) return
    if (next > max) return
    if (next < min) return
    if (next !== number) setNumber(next)
    if (next === value) return
    onUpdateValue?.(next)
  }, [number])

  const checkAndEmitValue = useCallback(() => {
    let next = +number
    if (isNaN(next)) next = min
    else if (next > max) next = max
    else if (next < min) next = min
    setNumber(next)
    onUpdateValue?.(next)
  }, [number, min, max, onUpdateValue])

  const handleEnter = (e: Event) => {
    checkAndEmitValue()
    onEnter?.(e)
  }

  const handleBlur = (e: Event) => {
    checkAndEmitValue()
    setFocused(false)
    onBlur?.(e)
  }

  const handleFocus = (e: Event) => {
    setFocused(true)
    onFocus?.(e)
  }

  return (
    <div
      className={cx('number-input', { disabled, focused }, className)}
      style={style}
      data-tooltip={dataTooltip}
    >
      <span className={cx('prefix', { 'prefix--fit': fitPrefix })}>{prefix}</span>
      <div className={cx('input-wrap')}>
        <input
          type="text"
          disabled={disabled}
          value={number}
          placeholder={placeholder}
          onChange={(event) => {
            setNumber(event.target.value)
            onInput?.(event.nativeEvent)
            onChange?.(event.nativeEvent)
          }}
          onFocus={(event) => handleFocus(event.nativeEvent)}
          onBlur={(event) => handleBlur(event.nativeEvent)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') handleEnter(event.nativeEvent)
          }}
        />
        <div className={cx('handlers')}>
          <span className={cx('handler')} onClick={() => setNumber((number as number) + step)}>
            <svg fill="currentColor" width="1em" height="1em" viewBox="64 64 896 896"><path d="M890.5 755.3L537.9 269.2c-12.8-17.6-39-17.6-51.7 0L133.5 755.3A8 8 0 00140 768h75c5.1 0 9.9-2.5 12.9-6.6L512 369.8l284.1 391.6c3 4.1 7.8 6.6 12.9 6.6h75c6.5 0 10.3-7.4 6.5-12.7z" /></svg>
          </span>
          <span className={cx('handler')} onClick={() => setNumber((number as number) - step)}>
            <svg fill="currentColor" width="1em" height="1em" viewBox="64 64 896 896"><path d="M884 256h-75c-5.1 0-9.9 2.5-12.9 6.6L512 654.2 227.9 262.6c-3-4.1-7.8-6.6-12.9-6.6h-75c-6.5 0-10.3 7.4-6.5-12.7l352.6 486.1c12.8 17.6 39 17.6 51.7 0l352.6-486.1c3.9-5.3.1-12.7-6.4-12.7z" /></svg>
          </span>
        </div>
      </div>
      <span className={cx('suffix')}>{suffix}</span>
    </div>
  )
})

export default NumberInput
