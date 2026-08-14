import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './MoveablePanel.module.scss'
const cx = bindStyles(styles)
import { type CSSProperties, type ReactNode, useRef, useCallback, memo, useState, useEffect } from 'react'

export type IMoveablePanelProps = {
  width: number
  height: number
  minWidth?: number
  minHeight?: number
  maxWidth?: number
  maxHeight?: number
  left?: number
  top?: number
  title?: string
  moveable?: boolean
  resizeable?: boolean
  contentStyle?: CSSProperties
  className?: string
  onClose?: () => void
  children?: ReactNode
}

const Z_INDEX_KEY = '__moveable_panel_z_index__'
const Z_INDEX_BASE = 900
const Z_INDEX_MAX = 999
const ACTIVE_PANELS_KEY = '__moveable_panel_active_count__'

const MoveablePanel = memo((vrProps: IMoveablePanelProps) => {
  const width = vrProps.width
  const height = vrProps.height
  const minWidth = vrProps.minWidth ?? 20
  const minHeight = vrProps.minHeight ?? 20
  const maxWidth = vrProps.maxWidth ?? 500
  const maxHeight = vrProps.maxHeight ?? 500
  const left = vrProps.left ?? 10
  const top = vrProps.top ?? 10
  const title = vrProps.title ?? ''
  const moveable = vrProps.moveable ?? true
  const resizeable = vrProps.resizeable ?? false
  const contentStyle = vrProps.contentStyle

  const [x, setX] = useState(0)
  const [y, setY] = useState(0)
  const [w, setW] = useState(0)
  const [h, setH] = useState(0)
  const moveablePanelRef = useRef<HTMLDivElement | null>(null)
  const [zIndex, setZIndex] = useState(900)
  const zIndexRef = useRef(zIndex)
  zIndexRef.current = zIndex
  const xywhRef = useRef({ x, y, w, h })
  xywhRef.current = { x, y, w, h }

  const realHeight = () => {
    if (!xywhRef.current.h) {
      return moveablePanelRef.current?.clientHeight || 0
    }
    return xywhRef.current.h
  }

  const initGlobalZIndex = () => {
    if (!(window as any)[Z_INDEX_KEY]) (window as any)[Z_INDEX_KEY] = Z_INDEX_BASE
    if (!(window as any)[ACTIVE_PANELS_KEY]) (window as any)[ACTIVE_PANELS_KEY] = 0
    ;(window as any)[ACTIVE_PANELS_KEY]++
    const current = (window as any)[Z_INDEX_KEY]
    if (current >= Z_INDEX_MAX) (window as any)[Z_INDEX_KEY] = Z_INDEX_BASE
    else (window as any)[Z_INDEX_KEY] = current + 1
    return (window as any)[Z_INDEX_KEY]
  }

  const bringToFront = () => {
    if (!(window as any)[Z_INDEX_KEY]) (window as any)[Z_INDEX_KEY] = Z_INDEX_BASE
    const current = (window as any)[Z_INDEX_KEY]
    if (zIndexRef.current === current) return current
    if (current >= Z_INDEX_MAX) (window as any)[Z_INDEX_KEY] = Z_INDEX_BASE + 1
    else (window as any)[Z_INDEX_KEY] = current + 1
    return (window as any)[Z_INDEX_KEY]
  }

  const onPanelClose = () => {
    if (!(window as any)[Z_INDEX_KEY] || !(window as any)[ACTIVE_PANELS_KEY]) return
    const current = (window as any)[Z_INDEX_KEY]
    ;(window as any)[ACTIVE_PANELS_KEY]--
    if (zIndexRef.current === current && current > Z_INDEX_BASE) {
      (window as any)[Z_INDEX_KEY] = current - 1
    }
    if ((window as any)[ACTIVE_PANELS_KEY] <= 0) {
      (window as any)[Z_INDEX_KEY] = Z_INDEX_BASE
      ;(window as any)[ACTIVE_PANELS_KEY] = 0
    }
  }

  useEffect(() => {
    if (left >= 0) setX(left)
    else setX(document.body.clientWidth + left - width)
    if (top >= 0) setY(top)
    else setY(document.body.clientHeight + top - (height || realHeight()))
    setW(width)
    setH(height)
    setZIndex(initGlobalZIndex())
    return () => { onPanelClose() }
  }, [])

  const bringToFrontPanel = useCallback((e: React.MouseEvent) => {
    if (!moveable) return
    e.stopPropagation()
    setZIndex(bringToFront())
  }, [moveable])

  const startMove = useCallback((e: React.MouseEvent) => {
    if (!moveable) return
    if (e.button !== 0) return
    const target = e.target as HTMLElement | null
    if (target?.closest('input, textarea, button, select, a, [contenteditable="true"]')) return
    setZIndex(bringToFront())
    let isMouseDown = true
    const windowWidth = document.body.clientWidth
    const clientHeight = document.body.clientHeight
    const startPageX = e.pageX
    const startPageY = e.pageY
    const originLeft = xywhRef.current.x
    const originTop = xywhRef.current.y
    document.onmousemove = ev => {
      if (!isMouseDown) return
      const moveX = ev.pageX - startPageX
      const moveY = ev.pageY - startPageY
      let nextLeft = originLeft + moveX
      let nextTop = originTop + moveY
      if (nextLeft < 0) nextLeft = 0
      if (nextTop < 0) nextTop = 0
      if (nextLeft + xywhRef.current.w > windowWidth) nextLeft = windowWidth - xywhRef.current.w
      if (nextTop + realHeight() > clientHeight) nextTop = clientHeight - realHeight()
      setX(nextLeft)
      setY(nextTop)
    }
    document.onmouseup = () => {
      isMouseDown = false
      document.onmousemove = null
      document.onmouseup = null
    }
  }, [moveable])

  const startResize = useCallback((e: React.MouseEvent) => {
    if (!resizeable) return
    let isMouseDown = true
    const startPageX = e.pageX
    const startPageY = e.pageY
    const originWidth = xywhRef.current.w
    const originHeight = xywhRef.current.h
    document.onmousemove = ev => {
      if (!isMouseDown) return
      const moveX = ev.pageX - startPageX
      const moveY = ev.pageY - startPageY
      let nextWidth = originWidth + moveX
      let nextHeight = originHeight + moveY
      if (nextWidth < minWidth) nextWidth = minWidth
      if (nextHeight < minHeight) nextHeight = minHeight
      if (nextWidth > maxWidth) nextWidth = maxWidth
      if (nextHeight > maxHeight) nextHeight = maxHeight
      setW(nextWidth)
      setH(nextHeight)
    }
    document.onmouseup = () => {
      isMouseDown = false
      document.onmousemove = null
      document.onmouseup = null
    }
  }, [resizeable, minWidth, minHeight, maxWidth, maxHeight])

  return (
    <div
      className={cx('moveable-panel', vrProps.className)}
      ref={moveablePanelRef}
      style={{
        width: w + 'px',
        height: h ? h + 'px' : 'auto',
        left: x + 'px',
        top: y + 'px',
        zIndex,
      }}
    >
      {title ? (
        <>
          <div className={cx('header')} onMouseDown={startMove}>
            <div className={cx('title')}>{title}</div>
            <div
              className={cx('close-btn')}
              onMouseDown={(event) => { event.stopPropagation() }}
              onClick={() => { vrProps.onClose?.() }}
            >
              <Icon icon="x" />
            </div>
          </div>
          <div className={cx('content')} style={contentStyle || {}} onMouseDown={bringToFrontPanel}>
            {vrProps.children}
          </div>
        </>
      ) : (
        <div className={cx('content')} style={contentStyle || {}} onMouseDown={startMove}>
          {vrProps.children}
        </div>
      )}
      {resizeable ? <div className={cx('resizer')} onMouseDown={startResize} /> : null}
    </div>
  )
})

export default MoveablePanel
