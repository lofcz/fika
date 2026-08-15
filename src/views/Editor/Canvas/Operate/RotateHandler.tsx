import { bindStyles } from '@/utils/cssm'
import styles from './RotateHandler.module.scss'
const cx = bindStyles(styles)
import { memo, useRef, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'

import { stopHandleEvent } from './stopHandleEvent'
import { handlerChromeEqual } from './operateCompare'

export type IRotateHandlerProps = {
  className?: string
  style?: CSSProperties
  onMouseDown?: (e: ReactMouseEvent<HTMLDivElement>) => void
}

const RotateHandler = memo(({ className, style, onMouseDown }: IRotateHandlerProps) => {
  const onMouseDownRef = useRef(onMouseDown)
  onMouseDownRef.current = onMouseDown
  return (
    <div
      className={cx('rotate-handler', className)}
      data-rotate-handle=""
      style={style}
      onMouseDown={e => {
        stopHandleEvent(e)
        onMouseDownRef.current?.(e)
      }}
    />
  )
}, handlerChromeEqual)

RotateHandler.displayName = 'RotateHandler'

export default RotateHandler
