import { bindStyles } from '@/utils/cssm'
import styles from './ButtonGroup.module.scss'
const cx = bindStyles(styles)
import type { CSSProperties, ReactNode } from 'react'

export type IButtonGroupProps = {
  passive?: boolean
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

export default function ButtonGroup({ passive = false, className, style, children }: IButtonGroupProps) {
  return (
    <div className={cx('button-group', { passive }, className)} style={style}>
      {children}
    </div>
  )
}
