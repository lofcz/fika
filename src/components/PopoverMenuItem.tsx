import { bindStyles } from '@/utils/cssm'
import styles from './PopoverMenuItem.module.scss'
const cx = bindStyles(styles)
import { type CSSProperties, type ReactNode, memo } from 'react'

export type IPopoverMenuItemProps = {
  /** @deprecated Menu rows are always left-aligned. Kept so existing callers compile. */
  center?: boolean
  className?: string
  style?: CSSProperties
  onClick?: () => void
  children?: ReactNode
}

const PopoverMenuItem = memo((props: IPopoverMenuItemProps) => {
  return (
    <div className={cx('popover-menu-item', props.className)} style={props.style} onClick={() => {
      props.onClick?.()
    }}>
      {props.children}
    </div>
  )
})

export default PopoverMenuItem
