import { bindStyles } from '@/utils/cssm'
import styles from './ResizeHandler.module.scss'
const cx = bindStyles(styles)
import { memo, useRef, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'

import type { OperateResizeHandlers } from '@/types/edit'
import { stopHandleEvent } from './stopHandleEvent'
import { handlerChromeEqual } from './operateCompare'

export type IResizeHandlerProps = {
  type?: OperateResizeHandlers
  rotate?: number
  className?: string
  style?: CSSProperties
  'data-line-handle'?: string
  onMouseDown?: (e: ReactMouseEvent<HTMLDivElement>) => void
}

const ResizeHandler = memo(({ type, rotate = 0, className, style, onMouseDown, 'data-line-handle': lineHandle }: IResizeHandlerProps) => {
  const onMouseDownRef = useRef(onMouseDown)
  onMouseDownRef.current = onMouseDown
  const prefix = 'rotate-'
  let rotateClassName = prefix + 0
  if (rotate > -22.5 && rotate <= 22.5) rotateClassName = prefix + 0
  else if (rotate > 22.5 && rotate <= 67.5) rotateClassName = prefix + 45
  else if (rotate > 67.5 && rotate <= 112.5) rotateClassName = prefix + 90
  else if (rotate > 112.5 && rotate <= 157.5) rotateClassName = prefix + 135
  else if (rotate > 157.5 || rotate <= -157.5) rotateClassName = prefix + 0
  else if (rotate > -157.5 && rotate <= -112.5) rotateClassName = prefix + 45
  else if (rotate > -112.5 && rotate <= -67.5) rotateClassName = prefix + 90
  else if (rotate > -67.5 && rotate <= -22.5) rotateClassName = prefix + 135

  return (
    <div
      className={cx('resize-handler', rotateClassName, type, className)}
      data-resize-handle={type || undefined}
      data-line-handle={lineHandle}
      style={style}
      onMouseDown={e => {
        stopHandleEvent(e)
        onMouseDownRef.current?.(e)
      }}
    />
  )
}, handlerChromeEqual)

ResizeHandler.displayName = 'ResizeHandler'

export default ResizeHandler
