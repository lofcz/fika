import { bindStyles } from '@/utils/cssm'
import styles from './ElementCreateSelection.module.scss'
const cx = bindStyles(styles)
import { useRef, useCallback, memo, useState } from 'react'

import { useMainStore, useKeyboardStore, selectCtrlOrShiftKeyActive } from '@/store'
import type { CreateElementSelectionData } from '@/types/edit'

export type IElementCreateSelectionProps = {
  onCreated?: (payload: CreateElementSelectionData) => void
}

const ElementCreateSelection = memo((props: IElementCreateSelectionProps) => {
  const creatingElement = useMainStore(s => s.creatingElement)
  const [start, setStart] = useState<[number, number]>()
  const [end, setEnd] = useState<[number, number]>()
  const startRef = useRef<[number, number] | undefined>(undefined)
  const endRef = useRef<[number, number] | undefined>(undefined)
  const selectionRef = useRef<HTMLDivElement | null>(null)
  const onCreatedRef = useRef(props.onCreated)
  onCreatedRef.current = props.onCreated

  const overlayRect = () => selectionRef.current?.getBoundingClientRect() ?? { x: 0, y: 0, left: 0, top: 0 }

  const createSelection = useCallback((e: React.MouseEvent) => {
    let isMouseDown = true
    const startClientX = e.clientX
    const startClientY = e.clientY
    const nextStart: [number, number] = [startClientX, startClientY]
    startRef.current = nextStart
    setStart(nextStart)

    document.onmousemove = moveEvent => {
      const creating = useMainStore.getState().creatingElement
      if (!creating || !isMouseDown) return
      let currentClientX = moveEvent.clientX
      let currentClientY = moveEvent.clientY

      if (selectCtrlOrShiftKeyActive(useKeyboardStore.getState())) {
        const moveX = currentClientX - startClientX
        const moveY = currentClientY - startClientY
        const absX = Math.abs(moveX)
        const absY = Math.abs(moveY)
        if (creating.type === 'shape') {
          const isOpposite = (moveY > 0 && moveX < 0) || (moveY < 0 && moveX > 0)
          if (absX > absY) {
            currentClientY = isOpposite ? startClientY - moveX : startClientY + moveX
          }
          else {
            currentClientX = isOpposite ? startClientX - moveY : startClientX + moveY
          }
        }
        else if (creating.type === 'line') {
          if (absX > absY) currentClientY = startClientY
          else currentClientX = startClientX
        }
      }
      const nextEnd: [number, number] = [currentClientX, currentClientY]
      endRef.current = nextEnd
      setEnd(nextEnd)
    }

    document.onmouseup = upEvent => {
      document.onmousemove = null
      document.onmouseup = null
      if (upEvent.button === 2) {
        setTimeout(() => useMainStore.getState().setCreatingElement(null), 0)
        return
      }
      isMouseDown = false
      const endClientX = upEvent.clientX
      const endClientY = upEvent.clientY
      const minSize = 30
      const creating = useMainStore.getState().creatingElement
      const startPos = startRef.current
      const endPos = endRef.current
      if (creating?.type === 'line' && (Math.abs(endClientX - startClientX) >= minSize || Math.abs(endClientY - startClientY) >= minSize)) {
        if (startPos && endPos) onCreatedRef.current?.({ start: startPos, end: endPos })
      }
      else if (creating?.type !== 'line' && Math.abs(endClientX - startClientX) >= minSize && Math.abs(endClientY - startClientY) >= minSize) {
        if (startPos && endPos) onCreatedRef.current?.({ start: startPos, end: endPos })
      }
      else {
        const defaultSize = 200
        const minX = Math.min(endClientX, startClientX)
        const minY = Math.min(endClientY, startClientY)
        const maxX = Math.max(endClientX, startClientX)
        const maxY = Math.max(endClientY, startClientY)
        const offsetX = maxX - minX >= minSize ? maxX - minX : defaultSize
        const offsetY = maxY - minY >= minSize ? maxY - minY : defaultSize
        onCreatedRef.current?.({
          start: [minX, minY],
          end: [minX + offsetX, minY + offsetY],
        })
      }
    }
  }, [])

  const lineData = (() => {
    if (!start || !end) return null
    if (!creatingElement || creatingElement.type !== 'line') return null
    const [_startX, _startY] = start
    const [_endX, _endY] = end
    const minX = Math.min(_startX, _endX)
    const maxX = Math.max(_startX, _endX)
    const minY = Math.min(_startY, _endY)
    const maxY = Math.max(_startY, _endY)
    const svgWidth = maxX - minX >= 24 ? maxX - minX : 24
    const svgHeight = maxY - minY >= 24 ? maxY - minY : 24
    const startX = _startX === minX ? 0 : maxX - minX
    const startY = _startY === minY ? 0 : maxY - minY
    const endX = _endX === minX ? 0 : maxX - minX
    const endY = _endY === minY ? 0 : maxY - minY
    const path = `M${startX}, ${startY} L${endX}, ${endY}`
    return { svgWidth, svgHeight, startX, startY, endX, endY, path }
  })()

  const position = (() => {
    if (!start || !end) return {}
    const [startX, startY] = start
    const [endX, endY] = end
    const minX = Math.min(startX, endX)
    const maxX = Math.max(startX, endX)
    const minY = Math.min(startY, endY)
    const maxY = Math.max(startY, endY)
    const width = maxX - minX
    const height = maxY - minY
    const rect = overlayRect()
    return {
      left: minX - rect.left + 'px',
      top: minY - rect.top + 'px',
      width: width + 'px',
      height: height + 'px',
    }
  })()

  return (
    <div
      className={cx('element-create-selection')}
      ref={selectionRef}
      data-create-selection={creatingElement?.type || ''}
      onMouseDown={e => { e.stopPropagation(); createSelection(e) }}
      onContextMenu={e => { e.stopPropagation(); e.preventDefault() }}
    >
      {start && end ? (
        <div className={cx('selection', creatingElement?.type)} style={position}>
          {creatingElement?.type === 'line' && lineData ? (
            <svg overflow="visible" width={lineData.svgWidth} height={lineData.svgHeight}>
              <path d={lineData.path} stroke="#18181b" fill="none" strokeWidth="2" />
            </svg>
          ) : null}
        </div>
      ) : null}
    </div>
  )
})

export default ElementCreateSelection
