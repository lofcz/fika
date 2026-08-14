import type { MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from 'react'

/** Stop the gesture so canvas blank-click / drag-ring / HitLayer cannot steal it. */
export function stopHandleEvent(e: ReactMouseEvent | ReactTouchEvent) {
  e.stopPropagation()
  e.nativeEvent.stopPropagation()
}
