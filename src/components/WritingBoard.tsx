import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './WritingBoard.module.scss'
const cx = bindStyles(styles)
import { forwardRef, useImperativeHandle, useRef, useState, useEffect, memo } from 'react'

import { CommandHistory } from '@/utils/commandHistory'
import { AddStrokeCommand, ClearInkCommand, strokeHasInk, type DrawingSurface, type ShapeType, type Stroke } from '@/utils/inkCommands'
import { appendEraserPoint, renderStroke } from '@/components/writingBoardCommands'
import { appendFreehandPoint, DEFAULT_FREEHAND_SIZE, pointerStrokeSamples, readPointerPressure, shouldSimulatePressure } from '@/utils/freehand'
import { solidPaint, type InkPaint } from '@/configs/inkPaint'

export type IWritingBoardProps = {
  paint?: InkPaint
  model?: 'pen' | 'eraser' | 'mark' | 'shape'
  shapeType?: ShapeType
  blackboard?: boolean
  penSize?: number
  markSize?: number
  rubberSize?: number
  shapeSize?: number
  interactive?: boolean
  className?: string
  onEnd?: () => void
  onHistoryChange?: (payload: { canUndo: boolean; canRedo: boolean }) => void
}

export type WritingBoardHandle = {
  clearCanvas: () => void
  getImageDataURL: () => string | undefined
  setImageDataURL: (imageDataURL: string) => void
  undo: () => void
  redo: () => void
}

const nativePointer = (e: React.PointerEvent): PointerEvent => e.nativeEvent

const WritingBoard = memo(forwardRef<WritingBoardHandle, IWritingBoardProps>((vrProps, expose) => {
  const paint = vrProps.paint ?? solidPaint('#ffcc00')
  const model = vrProps.model ?? 'pen'
  const shapeType = vrProps.shapeType ?? 'rect'
  const blackboard = vrProps.blackboard ?? false
  const penSize = vrProps.penSize ?? DEFAULT_FREEHAND_SIZE
  const markSize = vrProps.markSize ?? 24
  const rubberSize = vrProps.rubberSize ?? 80
  const shapeSize = vrProps.shapeSize ?? 4
  const interactive = vrProps.interactive ?? true

  const propsRef = useRef({ paint, model, shapeType, blackboard, penSize, markSize, rubberSize, shapeSize, interactive })
  propsRef.current = { paint, model, shapeType, blackboard, penSize, markSize, rubberSize, shapeSize, interactive }

  const onEndRef = useRef(vrProps.onEnd)
  onEndRef.current = vrProps.onEnd
  const onHistoryChangeRef = useRef(vrProps.onHistoryChange)
  onHistoryChangeRef.current = vrProps.onHistoryChange

  const [mouseInCanvas, setMouseInCanvas] = useState(false)
  const [canvasWidth, setCanvasWidth] = useState(0)
  const [canvasHeight, setCanvasHeight] = useState(0)
  const canvasWidthRef = useRef(0)
  const canvasHeightRef = useRef(0)

  const writingBoardRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const eraserCursorRef = useRef<HTMLDivElement | null>(null)
  const toolCursorRef = useRef<HTMLDivElement | null>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const committedCanvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'))
  const committedCtxRef = useRef<CanvasRenderingContext2D | null>(null)
  const committedDirtyRef = useRef(true)
  const canvasRectRef = useRef<DOMRect | null>(null)
  const isDrawingRef = useRef(false)
  const currentStrokeRef = useRef<Stroke | null>(null)
  const paintRafRef = useRef(0)
  const activePointerIdRef = useRef<number | null>(null)
  const baselineLoadIdRef = useRef(0)

  const surfaceRef = useRef<DrawingSurface>({ strokes: [], baseline: null, redraw: () => {} })
  const emitHistoryChangeRef = useRef(() => {})
  const historyRef = useRef<CommandHistory | null>(null)
  if (!historyRef.current) {
    historyRef.current = new CommandHistory(50, () => emitHistoryChangeRef.current())
  }

  const emitHistoryChange = () => {
    onHistoryChangeRef.current?.({
      canUndo: historyRef.current!.canUndo,
      canRedo: historyRef.current!.canRedo,
    })
  }
  emitHistoryChangeRef.current = emitHistoryChange

  const deviceRatio = () => window.devicePixelRatio || 1

  const applyCanvasTransform = (target = ctxRef.current) => {
    if (!target) return
    const ratio = deviceRatio()
    target.setTransform(ratio, 0, 0, ratio, 0, 0)
    target.imageSmoothingEnabled = true
    target.imageSmoothingQuality = 'high'
    target.lineCap = 'round'
    target.lineJoin = 'round'
  }

  const syncCommittedSize = () => {
    if (!canvasRef.current) return false
    const width = canvasRef.current.width
    const height = canvasRef.current.height
    if (committedCanvasRef.current.width !== width || committedCanvasRef.current.height !== height) {
      committedCanvasRef.current.width = width
      committedCanvasRef.current.height = height
      committedCtxRef.current = committedCanvasRef.current.getContext('2d')
      committedDirtyRef.current = true
    }
    return Boolean(committedCtxRef.current)
  }

  const rebuildCommitted = () => {
    if (!syncCommittedSize() || !committedCtxRef.current) return
    committedCtxRef.current.setTransform(1, 0, 0, 1, 0, 0)
    committedCtxRef.current.globalCompositeOperation = 'source-over'
    committedCtxRef.current.globalAlpha = 1
    committedCtxRef.current.clearRect(0, 0, committedCanvasRef.current.width, committedCanvasRef.current.height)
    applyCanvasTransform(committedCtxRef.current)
    if (surfaceRef.current.baseline) {
      committedCtxRef.current.drawImage(surfaceRef.current.baseline, 0, 0, canvasWidthRef.current, canvasHeightRef.current)
    }
    for (const stroke of surfaceRef.current.strokes) {
      renderStroke(committedCtxRef.current, committedCanvasRef.current, stroke)
    }
    committedDirtyRef.current = false
  }

  const blitCommitted = () => {
    if (!ctxRef.current || !canvasRef.current) return
    if (committedDirtyRef.current) rebuildCommitted()
    ctxRef.current.save()
    ctxRef.current.setTransform(1, 0, 0, 1, 0, 0)
    ctxRef.current.globalCompositeOperation = 'copy'
    ctxRef.current.imageSmoothingEnabled = false
    ctxRef.current.drawImage(committedCanvasRef.current, 0, 0)
    ctxRef.current.restore()
    applyCanvasTransform()
    ctxRef.current.globalCompositeOperation = 'source-over'
    ctxRef.current.globalAlpha = 1
  }

  const updateCtx = () => {
    if (!ctxRef.current) return
    if (propsRef.current.model === 'mark') {
      ctxRef.current.globalCompositeOperation = 'xor'
      ctxRef.current.globalAlpha = 0.5
    }
    else {
      ctxRef.current.globalCompositeOperation = 'source-over'
      ctxRef.current.globalAlpha = 1
    }
  }

  const redrawSurface = () => {
    committedDirtyRef.current = true
    if (!ctxRef.current || !canvasRef.current) return
    blitCommitted()
    updateCtx()
  }
  surfaceRef.current.redraw = redrawSurface

  const updateCanvasSize = () => {
    if (!writingBoardRef.current || !canvasRef.current) return
    const width = writingBoardRef.current.clientWidth
    const height = writingBoardRef.current.clientHeight
    canvasWidthRef.current = width
    canvasHeightRef.current = height
    setCanvasWidth(width)
    setCanvasHeight(height)
    canvasRectRef.current = canvasRef.current.getBoundingClientRect()

    const ratio = deviceRatio()
    const nextW = Math.max(1, Math.round(width * ratio))
    const nextH = Math.max(1, Math.round(height * ratio))
    if (canvasRef.current.width === nextW && canvasRef.current.height === nextH && ctxRef.current) {
      applyCanvasTransform()
      return
    }

    canvasRef.current.width = nextW
    canvasRef.current.height = nextH
    ctxRef.current = canvasRef.current.getContext('2d', { alpha: true, desynchronized: true })
    if (!ctxRef.current) return
    applyCanvasTransform()
    redrawSurface()
  }

  const updateCanvasSizeRef = useRef(updateCanvasSize)
  updateCanvasSizeRef.current = updateCanvasSize

  useEffect(() => {
    const el = writingBoardRef.current
    const resizeObserver = new ResizeObserver(() => updateCanvasSizeRef.current())
    if (el) resizeObserver.observe(el)
    updateCanvasSizeRef.current()
    const onResize = () => updateCanvasSizeRef.current()
    window.addEventListener('resize', onResize)
    return () => {
      if (el) resizeObserver.unobserve(el)
      resizeObserver.disconnect()
      window.removeEventListener('resize', onResize)
      if (paintRafRef.current) cancelAnimationFrame(paintRafRef.current)
    }
  }, [])

  useEffect(() => {
    updateCtx()
  }, [model])

  const paintCurrentStroke = (complete = false) => {
    if (!ctxRef.current || !canvasRef.current) return
    blitCommitted()
    if (currentStrokeRef.current) renderStroke(ctxRef.current, canvasRef.current, currentStrokeRef.current, complete)
  }

  const schedulePaint = () => {
    if (paintRafRef.current) return
    paintRafRef.current = requestAnimationFrame(() => {
      paintRafRef.current = 0
      paintCurrentStroke()
    })
  }

  const syncEraserCursor = (x: number, y: number) => {
    const el = eraserCursorRef.current
    if (!el) return
    el.style.transform = `translate(${x - propsRef.current.rubberSize / 2}px, ${y - propsRef.current.rubberSize / 2}px)`
  }

  const cacheCanvasRect = () => {
    canvasRectRef.current = canvasRef.current?.getBoundingClientRect() ?? null
  }

  const syncToolCursor = (x: number, y: number) => {
    if (propsRef.current.model === 'eraser') {
      syncEraserCursor(x, y)
      return
    }
    const el = toolCursorRef.current
    if (!el) return
    if (propsRef.current.model === 'pen') {
      el.style.transform = `translate(${x - propsRef.current.penSize / 2}px, ${y - propsRef.current.penSize * 6 + propsRef.current.penSize / 2}px)`
    }
    else if (propsRef.current.model === 'mark') {
      el.style.transform = `translate(${x - propsRef.current.markSize / 2}px, ${y}px)`
    }
    else {
      el.style.transform = `translate(${x - 20}px, ${y - 20}px)`
    }
  }

  const getCanvasPoint = (e: PointerEvent) => {
    const rect = canvasRectRef.current ?? canvasRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    if (!canvasRectRef.current) canvasRectRef.current = rect
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }

  const handleMove = (x: number, y: number, pressure: number, simulatePressure: boolean) => {
    if (currentStrokeRef.current?.kind === 'pen' || currentStrokeRef.current?.kind === 'mark') {
      if (currentStrokeRef.current.kind === 'pen' && currentStrokeRef.current.simulatePressure && !simulatePressure) {
        currentStrokeRef.current.simulatePressure = false
      }
      appendFreehandPoint(currentStrokeRef.current.points, { x, y, pressure }, currentStrokeRef.current.simulatePressure !== false)
      schedulePaint()
    }
    else if (currentStrokeRef.current?.kind === 'eraser') {
      if (appendEraserPoint(currentStrokeRef.current.points, x, y, currentStrokeRef.current.size)) schedulePaint()
    }
    else if (currentStrokeRef.current?.kind === 'shape') {
      currentStrokeRef.current.endX = x
      currentStrokeRef.current.endY = y
      schedulePaint()
    }
  }

  const startStroke = (x: number, y: number, e: PointerEvent) => {
    const simulatePressure = shouldSimulatePressure(e)
    const pressure = readPointerPressure(e)
    const current = propsRef.current
    if (current.model === 'pen') {
      currentStrokeRef.current = {
        kind: 'pen',
        color: current.paint.color,
        gradient: current.paint.gradient,
        gradientId: current.paint.gradientId,
        size: current.penSize,
        points: [{ x, y, pressure }],
        simulatePressure,
      }
    }
    else if (current.model === 'mark') {
      currentStrokeRef.current = {
        kind: 'mark',
        color: current.paint.color,
        gradient: current.paint.gradient,
        gradientId: current.paint.gradientId,
        size: current.markSize,
        points: [{ x, y, pressure }],
        simulatePressure: false,
      }
    }
    else if (current.model === 'eraser') {
      currentStrokeRef.current = { kind: 'eraser', size: current.rubberSize, points: [{ x, y }] }
    }
    else {
      currentStrokeRef.current = {
        kind: 'shape',
        shapeType: current.shapeType,
        color: current.paint.color,
        gradient: current.paint.gradient,
        gradientId: current.paint.gradientId,
        size: current.shapeSize,
        startX: x,
        startY: y,
        endX: x,
        endY: y,
      }
    }
    schedulePaint()
  }

  const commitStroke = () => {
    const stroke = currentStrokeRef.current
    currentStrokeRef.current = null
    if (!stroke || !strokeHasInk(stroke)) {
      redrawSurface()
      return
    }
    historyRef.current!.execute(new AddStrokeCommand(surfaceRef.current, stroke))
    onEndRef.current?.()
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!propsRef.current.interactive) return
    const native = nativePointer(e)
    if (native.button !== 0 && native.pointerType === 'mouse') return
    if (!canvasRef.current) return
    e.preventDefault()
    canvasRef.current.setPointerCapture(native.pointerId)
    activePointerIdRef.current = native.pointerId
    isDrawingRef.current = true
    setMouseInCanvas(true)
    cacheCanvasRect()

    const { x, y } = getCanvasPoint(native)
    syncToolCursor(x, y)
    startStroke(x, y, native)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const native = nativePointer(e)
    const latest = getCanvasPoint(native)
    syncToolCursor(latest.x, latest.y)
    if (!isDrawingRef.current || (activePointerIdRef.current !== null && native.pointerId !== activePointerIdRef.current)) return
    e.preventDefault()

    if (currentStrokeRef.current?.kind === 'eraser') {
      handleMove(latest.x, latest.y, 0.5, false)
      return
    }

    for (const sample of pointerStrokeSamples(native)) {
      const { x, y } = getCanvasPoint(sample)
      handleMove(x, y, readPointerPressure(sample), shouldSimulatePressure(sample))
    }
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const native = nativePointer(e)
    if (activePointerIdRef.current !== null && native.pointerId !== activePointerIdRef.current) return
    if (canvasRef.current && activePointerIdRef.current !== null && canvasRef.current.hasPointerCapture(activePointerIdRef.current)) {
      canvasRef.current.releasePointerCapture(activePointerIdRef.current)
    }
    activePointerIdRef.current = null
    if (!isDrawingRef.current) return
    isDrawingRef.current = false
    const { x, y } = getCanvasPoint(native)
    if (currentStrokeRef.current?.kind === 'eraser') {
      appendEraserPoint(currentStrokeRef.current.points, x, y, currentStrokeRef.current.size, true)
    }
    else {
      handleMove(x, y, readPointerPressure(native), shouldSimulatePressure(native))
    }
    if (paintRafRef.current) {
      cancelAnimationFrame(paintRafRef.current)
      paintRafRef.current = 0
    }
    commitStroke()
  }

  const handlePointerEnter = (e: React.PointerEvent<HTMLCanvasElement>) => {
    setMouseInCanvas(true)
    cacheCanvasRect()
    const { x, y } = getCanvasPoint(nativePointer(e))
    syncToolCursor(x, y)
  }

  const handlePointerLeave = () => {
    if (!isDrawingRef.current) setMouseInCanvas(false)
  }

  const resetHistory = () => {
    currentStrokeRef.current = null
    isDrawingRef.current = false
    activePointerIdRef.current = null
    surfaceRef.current.strokes.length = 0
    historyRef.current!.clear()
  }

  const clearCanvas = () => {
    if (!ctxRef.current || !canvasRef.current) return
    if (surfaceRef.current.strokes.length === 0 && !surfaceRef.current.baseline) return
    historyRef.current!.execute(new ClearInkCommand(surfaceRef.current))
    onEndRef.current?.()
  }

  const undo = () => {
    if (!historyRef.current!.undo()) return
    onEndRef.current?.()
  }

  const redo = () => {
    if (!historyRef.current!.redo()) return
    onEndRef.current?.()
  }

  const getImageDataURL = () => {
    return canvasRef.current?.toDataURL()
  }

  const setImageDataURL = (imageDataURL: string) => {
    if (!ctxRef.current || !canvasRef.current) return

    const loadId = ++baselineLoadIdRef.current
    resetHistory()
    surfaceRef.current.baseline = null
    redrawSurface()

    if (imageDataURL) {
      const img = new Image()
      img.src = imageDataURL
      img.onload = () => {
        if (loadId !== baselineLoadIdRef.current) return
        surfaceRef.current.baseline = img
        redrawSurface()
      }
    }
  }

  useImperativeHandle(expose, () => ({
    clearCanvas,
    getImageDataURL,
    setImageDataURL,
    undo,
    redo,
  }))

  return (
    <div className={cx('writing-board', vrProps.className)} ref={writingBoardRef}>
      {blackboard ? <div className={cx('blackboard')} /> : null}
      <canvas
        className={cx('canvas')}
        ref={canvasRef}
        style={{
          width: canvasWidth + 'px',
          height: canvasHeight + 'px',
          pointerEvents: interactive ? 'auto' : 'none',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
      />
      <div
        style={{
          display: mouseInCanvas && interactive && model === 'eraser' ? undefined : 'none',
          width: rubberSize + 'px',
          height: rubberSize + 'px',
        }}
        className={cx('eraser')}
        ref={eraserCursorRef}
      />
      <div
        style={{
          display: mouseInCanvas && interactive && model !== 'eraser' ? undefined : 'none',
          color: paint.color,
        }}
        className={cx('pen')}
        ref={toolCursorRef}
      >
        {model === 'pen' ? (
          <Icon icon="pencil" className={cx('icon')} style={{ fontSize: penSize * 6 + 'px' }} />
        ) : model === 'mark' ? (
          <Icon icon="highlighter" className={cx('icon')} style={{ fontSize: markSize * 1.5 + 'px' }} />
        ) : (
          <Icon icon="plus" className={cx('icon')} style={{ fontSize: 40 + 'px' }} />
        )}
      </div>
    </div>
  )
}))

export default WritingBoard
