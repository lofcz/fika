import { bindStyles } from '@/utils/cssm'
import styles from './TextArea.module.scss'
const cx = bindStyles(styles)
import { type CSSProperties, forwardRef, useImperativeHandle, useRef } from 'react'

export type TextAreaHandle = {
  focus: () => void
}

export type ITextAreaProps = {
  value: string
  rows?: number
  padding?: number
  disabled?: boolean
  resizable?: boolean
  placeholder?: string
  className?: string
  style?: CSSProperties
  'data-tooltip'?: string
  onUpdateValue?: (payload: string) => void
  onFocus?: (payload: FocusEvent) => void
  onBlur?: (payload: FocusEvent) => void
  onEnter?: (payload: KeyboardEvent) => void
}

const TextArea = forwardRef<TextAreaHandle, ITextAreaProps>(function TextArea(vrProps, expose) {
  const {
    value,
    rows = 4,
    padding,
    disabled = false,
    resizable = false,
    placeholder = '',
    className,
    style,
    'data-tooltip': dataTooltip,
    onUpdateValue,
    onFocus,
    onBlur,
    onEnter,
  } = vrProps

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useImperativeHandle(expose, () => ({
    focus: () => { textareaRef.current?.focus() },
  }))

  return (
    <textarea
      className={cx('textarea', { disabled, resizable }, className)}
      ref={textareaRef}
      disabled={disabled}
      value={value}
      rows={rows}
      placeholder={placeholder}
      style={{ padding: padding ? `${padding}px` : '10px', ...style }}
      data-tooltip={dataTooltip}
      onInput={(event) => onUpdateValue?.(event.currentTarget.value)}
      onFocus={(event) => onFocus?.(event.nativeEvent)}
      onBlur={(event) => onBlur?.(event.nativeEvent)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onEnter?.(event.nativeEvent)
      }}
    />
  )
})

export default TextArea
