import { bindStyles } from '@/utils/cssm'
import styles from './BorderLine.module.scss'
const cx = bindStyles(styles)
import { memo, useRef, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'

import type { OperateBorderLines } from '@/types/edit'
import { handlerChromeEqual } from './operateCompare'

export type IBorderLineProps = {
  type: OperateBorderLines
  isWide?: boolean
  className?: string
  style?: CSSProperties
  onMouseDown?: (e: ReactMouseEvent<HTMLDivElement>) => void
}

const BorderLine = memo(({ type, isWide = false, className, style, onMouseDown }: IBorderLineProps) => {
  const onMouseDownRef = useRef(onMouseDown)
  onMouseDownRef.current = onMouseDown
  return (
    <div
      className={cx('border-line', type, { wide: isWide }, className)}
      style={style}
      onMouseDown={e => onMouseDownRef.current?.(e)}
    />
  )
}, (prev, next) => prev.isWide === next.isWide && handlerChromeEqual(prev, next))

BorderLine.displayName = 'BorderLine'

export default BorderLine
