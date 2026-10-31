import { bindStyles } from '@/utils/cssm'
import styles from './ImageClipHandler.module.scss'
const cx = bindStyles(styles)
import { useRef, useCallback, memo, useState, useEffect } from 'react'

import { useMainStore, useKeyboardStore, selectCtrlOrShiftKeyActive } from '@/store'
import { useClickOutside } from '@/hooks/useClickOutside'
import { KEYS } from '@/configs/hotkey'
import { type ImageClipedEmitData, OperateResizeHandlers } from '@/types/edit'
import type { ImageClipDataRange, ImageElementClip } from '@/types/slides'
import { findSlideViewport, getPointerClient, pointerDeltaToCanvas } from '@/utils/canvasPointer'
import ImageBitmapSurface from './ImageBitmapSurface'

export type IImageClipHandlerProps = {
  src: string
  clipPath: string
  width: number
  height: number
  top: number
  left: number
  rotate: number
  flipH?: boolean
  flipV?: boolean
  clipData?: ImageElementClip
  onClip?: (payload: ImageClipedEmitData | null) => void
}

const ImageClipHandler = memo((props: IImageClipHandlerProps) => {
  const { src, clipPath, width, height, rotate, flipH, flipV } = props
  const canvasScale = useMainStore(s => s.canvasScale)
  const ctrlOrShiftKeyActive = useKeyboardStore(selectCtrlOrShiftKeyActive)

  const [clipWrapperPositionStyle, setClipWrapperPositionStyle] = useState({
    top: '0',
    left: '0',
  })
  const isSettingClipRangeRef = useRef(false)
  const clearDragRef = useRef<() => void>(() => {})
  const onClipRef = useRef(props.onClip)
  onClipRef.current = props.onClip
  const registerDragCleanup = (stop: () => void) => {
    const move = document.onmousemove
    const end = document.onmouseup
    clearDragRef.current = () => {
      stop()
      if (document.onmousemove === move) document.onmousemove = null
      if (document.onmouseup === end) document.onmouseup = null
      clearDragRef.current = () => {}
    }
  }
  const currentRangeRef = useRef<ImageClipDataRange | null>(null)
  const [topImgWrapperPosition, setTopImgWrapperPosition] = useState({
    top: 0,
    left: 0,
    width: 0,
    height: 0,
  })
  const topImgWrapperPositionRef = useRef(topImgWrapperPosition)
  topImgWrapperPositionRef.current = topImgWrapperPosition

  const getClipDataTransformInfo = useCallback(() => {
    const [start, end] = props.clipData ? props.clipData.range : [[0, 0], [100, 100]]
    const widthScale = (end[0] - start[0]) / 100
    const heightScale = (end[1] - start[1]) / 100
    const left = start[0] / widthScale
    const top = start[1] / heightScale
    return { widthScale, heightScale, left, top }
  }, [props.clipData])

  const imgPosition = (() => {
    const { widthScale, heightScale, left, top } = getClipDataTransformInfo()
    return {
      left: -left,
      top: -top,
      width: 100 / widthScale,
      height: 100 / heightScale,
    }
  })()

  const bottomImgPositionStyle = {
    top: imgPosition.top + '%',
    left: imgPosition.left + '%',
    width: imgPosition.width + '%',
    height: imgPosition.height + '%',
  }

  const topImgWrapperPositionStyle = {
    top: topImgWrapperPosition.top + '%',
    left: topImgWrapperPosition.left + '%',
    width: topImgWrapperPosition.width + '%',
    height: topImgWrapperPosition.height + '%',
  }

  const topImgPositionStyle = (() => {
    const { top, left, width: wrapW, height: wrapH } = topImgWrapperPosition
    return {
      left: -left * (100 / wrapW) + '%',
      top: -top * (100 / wrapH) + '%',
      width: imgPosition.width / wrapW * 100 + '%',
      height: imgPosition.height / wrapH * 100 + '%',
    }
  })()

  const initClipPosition = useCallback(() => {
    const { left, top } = getClipDataTransformInfo()
    const next = { left, top, width: 100, height: 100 }
    topImgWrapperPositionRef.current = next
    setTopImgWrapperPosition(next)
    setClipWrapperPositionStyle({
      top: -top + '%',
      left: -left + '%',
    })
  }, [getClipDataTransformInfo])

  const updateRange = useCallback(() => {
    const wrap = topImgWrapperPositionRef.current
    const { width: bottomWidth, height: bottomHeight } = imgPosition
    currentRangeRef.current = [
      [wrap.left / bottomWidth * 100, wrap.top / bottomHeight * 100],
      [(wrap.left + wrap.width) / bottomWidth * 100, (wrap.top + wrap.height) / bottomHeight * 100],
    ]
  }, [imgPosition.width, imgPosition.height])

  const handleClip = useCallback(() => {
    if (isSettingClipRangeRef.current) return
    if (!currentRangeRef.current) {
      props.onClip?.(null)
      return
    }
    const { left, top } = getClipDataTransformInfo()
    const wrap = topImgWrapperPositionRef.current
    const position = {
      left: (wrap.left - left) / 100 * props.width,
      top: (wrap.top - top) / 100 * props.height,
      width: (wrap.width - 100) / 100 * props.width,
      height: (wrap.height - 100) / 100 * props.height,
    }
    props.onClip?.({
      range: currentRangeRef.current,
      position,
    })
  }, [getClipDataTransformInfo, props.onClip, props.width, props.height])

  const handleClipRef = useRef(handleClip)
  handleClipRef.current = handleClip

  const clipHandlerRef = useRef<HTMLDivElement | null>(null)
  useClickOutside(clipHandlerRef, () => { handleClipRef.current() })

  useEffect(() => {
    initClipPosition()
    const keyboardListener = (e: KeyboardEvent) => {
      if (e.key.toUpperCase() === KEYS.ESC) {
        e.preventDefault()
        clearDragRef.current()
        onClipRef.current?.(null)
        return
      }
      if (e.key.toUpperCase() === KEYS.ENTER) {
        e.preventDefault()
        handleClipRef.current()
      }
    }
    document.addEventListener('keydown', keyboardListener)
    return () => {
      document.removeEventListener('keydown', keyboardListener)
      clearDragRef.current()
    }
  }, [])

  const moveClipRange = (e: MouseEvent) => {
    if (e.button !== 0) return
    clearDragRef.current()
    isSettingClipRangeRef.current = true
    let isMouseDown = true
    const viewport = findSlideViewport(e.target)
    const startPointer = getPointerClient(e)
    const bottomPosition = imgPosition
    const originPositopn = { ...topImgWrapperPositionRef.current }

    document.onmousemove = ev => {
      if (!isMouseDown) return
      const { x: _moveX, y: _moveY } = pointerDeltaToCanvas(startPointer, ev, viewport, canvasScale)
      const _moveL = Math.sqrt(_moveX * _moveX + _moveY * _moveY)
      const _moveLRotate = Math.atan2(_moveY, _moveX)
      const rot = _moveLRotate - rotate / 180 * Math.PI
      const moveX = _moveL * Math.cos(rot) / width * 100 * (flipH ? -1 : 1)
      const moveY = _moveL * Math.sin(rot) / height * 100 * (flipV ? -1 : 1)
      let targetLeft = originPositopn.left + moveX
      let targetTop = originPositopn.top + moveY
      if (targetLeft < 0) targetLeft = 0
      else if (targetLeft + originPositopn.width > bottomPosition.width) {
        targetLeft = bottomPosition.width - originPositopn.width
      }
      if (targetTop < 0) targetTop = 0
      else if (targetTop + originPositopn.height > bottomPosition.height) {
        targetTop = bottomPosition.height - originPositopn.height
      }
      const next = { ...originPositopn, left: targetLeft, top: targetTop }
      topImgWrapperPositionRef.current = next
      setTopImgWrapperPosition(next)
    }

    document.onmouseup = () => {
      clearDragRef.current()
      updateRange()
      setTimeout(() => { isSettingClipRangeRef.current = false }, 0)
    }
    registerDragCleanup(() => { isMouseDown = false })
  }

  const scaleClipRange = (e: MouseEvent, type: OperateResizeHandlers) => {
    if (e.button !== 0) return
    clearDragRef.current()
    isSettingClipRangeRef.current = true
    let isMouseDown = true
    const minWidth = Math.min(50, width) / width * 100
    const minHeight = Math.min(50, height) / height * 100
    const viewport = findSlideViewport(e.target)
    const startPointer = getPointerClient(e)
    const bottomPosition = imgPosition
    const originPositopn = { ...topImgWrapperPositionRef.current }
    const leftCorner = type === OperateResizeHandlers.LEFT_TOP || type === OperateResizeHandlers.LEFT_BOTTOM
    const rightCorner = type === OperateResizeHandlers.RIGHT_TOP || type === OperateResizeHandlers.RIGHT_BOTTOM
    const topCorner = type === OperateResizeHandlers.LEFT_TOP || type === OperateResizeHandlers.RIGHT_TOP

    document.onmousemove = ev => {
      if (!isMouseDown) return
      const { x: _moveX, y: _moveY } = pointerDeltaToCanvas(startPointer, ev, viewport, canvasScale)
      const _moveL = Math.sqrt(_moveX * _moveX + _moveY * _moveY)
      const _moveLRotate = Math.atan2(_moveY, _moveX)
      const rot = _moveLRotate - rotate / 180 * Math.PI
      let moveX = _moveL * Math.cos(rot) / width * 100 * (flipH ? -1 : 1)
      let moveY = _moveL * Math.sin(rot) / height * 100 * (flipV ? -1 : 1)
      let targetLeft = originPositopn.left
      let targetTop = originPositopn.top
      let targetWidth = originPositopn.width
      let targetHeight = originPositopn.height

      if (ctrlOrShiftKeyActive && (leftCorner || rightCorner)) {
        const minScale = Math.max(minWidth / originPositopn.width, minHeight / originPositopn.height)
        const availableWidth = leftCorner ? originPositopn.left + originPositopn.width : bottomPosition.width - originPositopn.left
        const availableHeight = topCorner ? originPositopn.top + originPositopn.height : bottomPosition.height - originPositopn.top
        const maxScale = Math.min(availableWidth / originPositopn.width, availableHeight / originPositopn.height)
        const requestedScale = 1 + (leftCorner ? -moveX : moveX) / originPositopn.width
        const scale = Math.min(maxScale, Math.max(minScale, requestedScale))
        targetWidth = originPositopn.width * scale
        targetHeight = originPositopn.height * scale
        if (leftCorner) targetLeft += originPositopn.width - targetWidth
        if (topCorner) targetTop += originPositopn.height - targetHeight
      }
      else if (type === OperateResizeHandlers.LEFT_TOP) {
        if (originPositopn.left + moveX < 0) moveX = -originPositopn.left
        if (originPositopn.top + moveY < 0) moveY = -originPositopn.top
        if (originPositopn.width - moveX < minWidth) moveX = originPositopn.width - minWidth
        if (originPositopn.height - moveY < minHeight) moveY = originPositopn.height - minHeight
        targetWidth = originPositopn.width - moveX
        targetHeight = originPositopn.height - moveY
        targetLeft = originPositopn.left + moveX
        targetTop = originPositopn.top + moveY
      }
      else if (type === OperateResizeHandlers.RIGHT_TOP) {
        if (originPositopn.left + originPositopn.width + moveX > bottomPosition.width) {
          moveX = bottomPosition.width - (originPositopn.left + originPositopn.width)
        }
        if (originPositopn.top + moveY < 0) moveY = -originPositopn.top
        if (originPositopn.width + moveX < minWidth) moveX = minWidth - originPositopn.width
        if (originPositopn.height - moveY < minHeight) moveY = originPositopn.height - minHeight
        targetWidth = originPositopn.width + moveX
        targetHeight = originPositopn.height - moveY
        targetLeft = originPositopn.left
        targetTop = originPositopn.top + moveY
      }
      else if (type === OperateResizeHandlers.LEFT_BOTTOM) {
        if (originPositopn.left + moveX < 0) moveX = -originPositopn.left
        if (originPositopn.top + originPositopn.height + moveY > bottomPosition.height) {
          moveY = bottomPosition.height - (originPositopn.top + originPositopn.height)
        }
        if (originPositopn.width - moveX < minWidth) moveX = originPositopn.width - minWidth
        if (originPositopn.height + moveY < minHeight) moveY = minHeight - originPositopn.height
        targetWidth = originPositopn.width - moveX
        targetHeight = originPositopn.height + moveY
        targetLeft = originPositopn.left + moveX
        targetTop = originPositopn.top
      }
      else if (type === OperateResizeHandlers.RIGHT_BOTTOM) {
        if (originPositopn.left + originPositopn.width + moveX > bottomPosition.width) {
          moveX = bottomPosition.width - (originPositopn.left + originPositopn.width)
        }
        if (originPositopn.top + originPositopn.height + moveY > bottomPosition.height) {
          moveY = bottomPosition.height - (originPositopn.top + originPositopn.height)
        }
        if (originPositopn.width + moveX < minWidth) moveX = minWidth - originPositopn.width
        if (originPositopn.height + moveY < minHeight) moveY = minHeight - originPositopn.height
        targetWidth = originPositopn.width + moveX
        targetHeight = originPositopn.height + moveY
        targetLeft = originPositopn.left
        targetTop = originPositopn.top
      }
      else if (type === OperateResizeHandlers.TOP) {
        if (originPositopn.top + moveY < 0) moveY = -originPositopn.top
        if (originPositopn.height - moveY < minHeight) moveY = originPositopn.height - minHeight
        targetWidth = originPositopn.width
        targetHeight = originPositopn.height - moveY
        targetLeft = originPositopn.left
        targetTop = originPositopn.top + moveY
      }
      else if (type === OperateResizeHandlers.BOTTOM) {
        if (originPositopn.top + originPositopn.height + moveY > bottomPosition.height) {
          moveY = bottomPosition.height - (originPositopn.top + originPositopn.height)
        }
        if (originPositopn.height + moveY < minHeight) moveY = minHeight - originPositopn.height
        targetWidth = originPositopn.width
        targetHeight = originPositopn.height + moveY
        targetLeft = originPositopn.left
        targetTop = originPositopn.top
      }
      else if (type === OperateResizeHandlers.LEFT) {
        if (originPositopn.left + moveX < 0) moveX = -originPositopn.left
        if (originPositopn.width - moveX < minWidth) moveX = originPositopn.width - minWidth
        targetWidth = originPositopn.width - moveX
        targetHeight = originPositopn.height
        targetLeft = originPositopn.left + moveX
        targetTop = originPositopn.top
      }
      else {
        if (originPositopn.left + originPositopn.width + moveX > bottomPosition.width) {
          moveX = bottomPosition.width - (originPositopn.left + originPositopn.width)
        }
        if (originPositopn.width + moveX < minWidth) moveX = minWidth - originPositopn.width
        targetHeight = originPositopn.height
        targetWidth = originPositopn.width + moveX
        targetLeft = originPositopn.left
        targetTop = originPositopn.top
      }

      const next = { left: targetLeft, top: targetTop, width: targetWidth, height: targetHeight }
      topImgWrapperPositionRef.current = next
      setTopImgWrapperPosition(next)
    }

    document.onmouseup = () => {
      clearDragRef.current()
      updateRange()
      setTimeout(() => { isSettingClipRangeRef.current = false }, 0)
    }
    registerDragCleanup(() => { isMouseDown = false })
  }

  const rotateClassName = (() => {
    const prefix = 'rotate-'
    if (rotate > -22.5 && rotate <= 22.5) return prefix + 0
    if (rotate > 22.5 && rotate <= 67.5) return prefix + 45
    if (rotate > 67.5 && rotate <= 112.5) return prefix + 90
    if (rotate > 112.5 && rotate <= 157.5) return prefix + 135
    if (rotate > 157.5 || rotate <= -157.5) return prefix + 0
    if (rotate > -157.5 && rotate <= -112.5) return prefix + 45
    if (rotate > -112.5 && rotate <= -67.5) return prefix + 90
    if (rotate > -67.5 && rotate <= -22.5) return prefix + 135
    return prefix + 0
  })()

  const cornerPoint = [
    OperateResizeHandlers.LEFT_TOP,
    OperateResizeHandlers.RIGHT_TOP,
    OperateResizeHandlers.LEFT_BOTTOM,
    OperateResizeHandlers.RIGHT_BOTTOM,
  ]
  const edgePoints = [
    OperateResizeHandlers.TOP,
    OperateResizeHandlers.BOTTOM,
    OperateResizeHandlers.LEFT,
    OperateResizeHandlers.RIGHT,
  ]

  return (
    <div className={cx('image-clip-handler')} style={clipWrapperPositionStyle} ref={clipHandlerRef}>
      <ImageBitmapSurface className={cx('bottom-img')} src={src} draggable={false} style={bottomImgPositionStyle} />
      <div
        className={cx('top-image-content')}
        style={{
          ...topImgWrapperPositionStyle,
          clipPath,
        }}
      >
        <ImageBitmapSurface className={cx('top-img')} src={src} draggable={false} style={topImgPositionStyle} />
      </div>
      <div
        className={cx('operate')}
        style={topImgWrapperPositionStyle}
        onMouseDown={event => { event.stopPropagation(); moveClipRange(event.nativeEvent) }}
      >
        {cornerPoint.map(point => (
          <div
            className={cx('clip-point', point, rotateClassName)}
            key={point}
            onMouseDown={event => { event.stopPropagation(); scaleClipRange(event.nativeEvent, point) }}
          >
            <svg width="16" height="16" fill="#fff" stroke="#333">
              <path strokeWidth="0.3" shapeRendering="crispEdges" d="M 16 0 L 0 0 L 0 16 L 4 16 L 4 4 L 16 4 L 16 0 Z" />
            </svg>
          </div>
        ))}
        {edgePoints.map(point => (
          <div
            className={cx('clip-point', point, rotateClassName)}
            key={point}
            onMouseDown={event => { event.stopPropagation(); scaleClipRange(event.nativeEvent, point) }}
          >
            <svg width="16" height="16" fill="#fff" stroke="#333">
              <path strokeWidth="0.3" shapeRendering="crispEdges" d="M 16 0 L 0 0 L 0 4 L 16 4 Z" />
            </svg>
          </div>
        ))}
      </div>
    </div>
  )
})

export default ImageClipHandler
