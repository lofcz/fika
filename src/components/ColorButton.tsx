import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './ColorButton.module.scss'
const cx = bindStyles(styles)
import type { CSSProperties } from 'react'
import Button from './Button'

export type IColorButtonProps = {
  color: string
  className?: string
  style?: CSSProperties
  'data-tooltip'?: string
}

export default function ColorButton({ color, className, style, 'data-tooltip': dataTooltip }: IColorButtonProps) {
  return (
    <Button className={cx('color-btn', className)} style={style} data-tooltip={dataTooltip}>
      <div className={cx('color-block')}>
        <div className={cx('content')} style={{ backgroundColor: color }} />
      </div>
      <Icon icon="chevron-down" className={cx('color-btn-icon')} />
    </Button>
  )
}
