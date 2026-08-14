import { bindStyles } from '@/utils/cssm'
import styles from './TextColorButton.module.scss'
const cx = bindStyles(styles)
import type { CSSProperties, ReactNode } from 'react'
import Button from './Button'

export type ITextColorButtonProps = {
  color: string
  className?: string
  style?: CSSProperties
  'data-tooltip'?: string
  children?: ReactNode
}

export default function TextColorButton({
  color,
  className,
  style,
  'data-tooltip': dataTooltip,
  children,
}: ITextColorButtonProps) {
  return (
    <Button className={cx('text-color-btn', className)} style={style} data-tooltip={dataTooltip}>
      {children}
      <div className={cx('text-color-block')}>
        <div className={cx('text-color-block-content')} style={{ backgroundColor: color }} />
      </div>
    </Button>
  )
}
