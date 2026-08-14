import { bindStyles } from '@/utils/cssm'
import styles from './MouseSelection.module.scss'
const cx = bindStyles(styles)
import { memo } from 'react'

export type IMouseSelectionProps = {
  top: number
  left: number
  width: number
  height: number
}

const MouseSelection = memo((props: IMouseSelectionProps) => {
  const { top, left, width, height } = props
  return (
    <div
      className={cx('mouse-selection')}
      style={{
        top: top + 'px',
        left: left + 'px',
        width: width + 'px',
        height: height + 'px',
      }}
    />
  )
})

export default MouseSelection
