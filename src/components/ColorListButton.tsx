import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './ColorListButton.module.scss'
const cx = bindStyles(styles)
import type { CSSProperties } from 'react'
import Button from './Button'

export type IColorListButtonProps = {
  colors: string[]
  className?: string
  style?: CSSProperties
  'data-tooltip'?: string
}

export default function ColorListButton({ colors: colorsProp, className, style, 'data-tooltip': dataTooltip }: IColorListButtonProps) {
  const colors = colorsProp.length > 12 ? colorsProp.slice(0, 12) : colorsProp

  return (
    <Button className={cx('color-btn', className)} style={style} data-tooltip={dataTooltip}>
      <div className={cx('blocks')}>
        {colors.map((color, index) => (
          <div className={cx('color-block')} key={index}>
            <div className={cx('content')} style={{ backgroundColor: color }} />
          </div>
        ))}
      </div>
      <Icon icon="chevron-down" className={cx('color-btn-icon')} />
    </Button>
  )
}
