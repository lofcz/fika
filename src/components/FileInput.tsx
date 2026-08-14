import { bindStyles } from '@/utils/cssm'
import styles from './FileInput.module.scss'
const cx = bindStyles(styles)
import { useRef, type CSSProperties, type ReactNode } from 'react'

export type IFileInputProps = {
  accept?: string
  multiple?: boolean
  className?: string
  style?: CSSProperties
  onChange?: (payload: FileList) => void
  children?: ReactNode
}

export default function FileInput({
  accept = 'image/*',
  multiple = false,
  className,
  style,
  onChange,
  children,
}: IFileInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  const handleClick = () => {
    if (!inputRef.current) return
    inputRef.current.value = ''
    inputRef.current.click()
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) onChange?.(files)
  }

  return (
    <div className={cx('file-input', className)} style={style} onClick={handleClick}>
      {children}
      <input
        className={cx('input')}
        type="file"
        name="upload"
        ref={inputRef}
        accept={accept}
        multiple={multiple}
        onChange={handleChange}
        onClick={event => event.stopPropagation()}
      />
    </div>
  )
}
