import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './ShapeCreateCanvas.module.scss'
const cx = bindStyles(styles)
import { useRef, memo, useState, useEffect } from 'react'

import { useKeyboardStore, useMainStore, useSlidesStore, selectCtrlOrShiftKeyActive } from '@/store'
import type { CreateCustomShapeData, CustomShapeDrawMode } from '@/types/edit'
import { KEYS } from '@/configs/hotkey'
import { MAGICAL_INK_GRADIENTS, INK_SOLID_SWATCHES, solidPaint, type InkPaint } from '@/configs/inkPaint'
import { useI18nContext } from '@/i18n/useI18nContext'
import { CommandHistory } from '@/utils/commandHistory'
import { AddStrokeCommand, strokeHasInk, type DrawingSurface, type PenStroke } from '@/utils/inkCommands'
import { appendFreehandPoint, DEFAULT_FREEHAND_SIZE, getFreehandSvgPath, pointerStrokeSamples, readPointerPressure, shouldSimulatePressure } from '@/utils/freehand'
import { joinScribbleInk } from '@/utils/scribbleJoin'
import InkPaintSwatches from '@/components/InkPaintSwatches'
import GradientDefs from '@/views/components/element/ShapeElement/GradientDefs'

export type IShapeCreateCanvasProps = {
  mode: CustomShapeDrawMode
  onCreated?: (payload: CreateCustomShapeData[]) => void
}

const CLOSE_THRESHOLD = 10
const MIN_VIEWBOX = 2
const SCRIBBLE_SIZES = [4, 6, 8, 12] as const
const SCRIBBLE_GRADIENT_PREFIX = 'scribble-ink'

const ShapeCreateCanvas = memo((props: IShapeCreateCanvasProps) => {
  const { mode } = props
  const { LL } = useI18nContext()
  const ctrlOrShiftKeyActive = useKeyboardStore(selectCtrlOrShiftKeyActive)
  const theme = useSlidesStore(s => s.theme)

  const shapeCanvasRef = useRef<HTMLDivElement | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [scribblePath, setScribblePath] = useState('')
  const [scribbleLiveFill, setScribbleLiveFill] = useState('#18181b')
  const [committedScribblePaths, setCommittedScribblePaths] = useState<Array<{ d: string; fill: string }>>([])
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [scribblePaint, setScribblePaint] = useState<InkPaint>(solidPaint(INK_SOLID_SWATCHES[0]))
  const [scribbleSize, setScribbleSize] = useState(DEFAULT_FREEHAND_SIZE)
  const [mousePosition, setMousePosition] = useState<[number, number] | null>(null)
  const [points, setPoints] = useState<[number, number][]>([])
  const [closed, setClosed] = useState(false)

  const currentStrokeRef = useRef<PenStroke | null>(null)
  const scribblePointerIdRef = useRef<number | null>(null)
  const scribblePaintRafRef = useRef(0)
  const isDrawingRef = useRef(false)
  const pointsRef = useRef(points)
  const mousePositionRef = useRef(mousePosition)
  const closedRef = useRef(closed)
  const scribblePaintRef = useRef(scribblePaint)
  const scribbleSizeRef = useRef(scribbleSize)
  const modeRef = useRef(mode)
  const onCreatedRef = useRef(props.onCreated)
  const ctrlOrShiftRef = useRef(ctrlOrShiftKeyActive)
  const themeRef = useRef(theme)
  isDrawingRef.current = isDrawing
  pointsRef.current = points
  mousePositionRef.current = mousePosition
  closedRef.current = closed
  scribblePaintRef.current = scribblePaint
  scribbleSizeRef.current = scribbleSize
  modeRef.current = mode
  onCreatedRef.current = props.onCreated
  ctrlOrShiftRef.current = ctrlOrShiftKeyActive
  themeRef.current = theme

  const overlayRect = () => shapeCanvasRef.current?.getBoundingClientRect() ?? { x: 0, y: 0, left: 0, top: 0 }

  const hintText = mode === 'scribble' ? LL.canvas.shapeCreate.scribbleHint() : LL.canvas.shapeCreate.polygonHint()

  const inkFill = (paint: Pick<InkPaint, 'color' | 'gradientId'>) => (
    paint.gradientId ? `url(#${SCRIBBLE_GRADIENT_PREFIX}-${paint.gradientId})` : paint.color
  )

  const outlinedSupplement = () => ({
    fill: 'rgba(0, 0, 0, 0)',
    outline: {
      width: 2,
      color: themeRef.current.themeColors[0],
      style: 'solid' as const,
    },
  })

  const getPoint = (e: PointerEvent, constrain = false) => {
    const rect = overlayRect()
    let pageX = e.clientX - rect.left
    let pageY = e.clientY - rect.top
    const pts = pointsRef.current
    if (constrain && ctrlOrShiftRef.current && pts.length) {
      const [lastPointX, lastPointY] = pts[pts.length - 1]
      if (Math.abs(lastPointX - pageX) - Math.abs(lastPointY - pageY) > 0) {
        pageY = lastPointY
      }
      else pageX = lastPointX
    }
    return { pageX, pageY }
  }

  const isNearFirstPoint = (x: number, y: number) => {
    const pts = pointsRef.current
    if (pts.length < 3) return false
    const [firstX, firstY] = pts[0]
    return Math.abs(firstX - x) < CLOSE_THRESHOLD && Math.abs(firstY - y) < CLOSE_THRESHOLD
  }

  const updateClosedFromCursor = (x: number, y: number) => {
    setClosed(modeRef.current === 'polygon' && isNearFirstPoint(x, y))
  }

  const paintCurrentStroke = () => {
    const currentStroke = currentStrokeRef.current
    if (!currentStroke) {
      setScribblePath('')
      return
    }
    setScribbleLiveFill(inkFill(currentStroke))
    setScribblePath(getFreehandSvgPath(currentStroke.points, currentStroke.size, {
      simulatePressure: currentStroke.simulatePressure,
    }))
  }

  const scheduleScribblePaint = () => {
    if (scribblePaintRafRef.current) return
    scribblePaintRafRef.current = requestAnimationFrame(() => {
      scribblePaintRafRef.current = 0
      paintCurrentStroke()
    })
  }

  const paintCommittedStrokes = () => {
    setCommittedScribblePaths(surfaceRef.current.strokes.flatMap(stroke => {
      if (stroke.kind !== 'pen') return []
      const d = getFreehandSvgPath(stroke.points, stroke.size, {
        simulatePressure: stroke.simulatePressure,
      })
      return d ? [{ d, fill: inkFill(stroke) }] : []
    }))
  }

  const syncHistoryButtons = () => {
    setCanUndo(historyRef.current.canUndo)
    setCanRedo(historyRef.current.canRedo)
  }

  const surfaceRef = useRef<DrawingSurface>({
    strokes: [],
    baseline: null,
    redraw: paintCommittedStrokes,
  })
  const historyRef = useRef(new CommandHistory(50, syncHistoryButtons))
  surfaceRef.current.redraw = paintCommittedStrokes

  const appendScribbleSample = (e: PointerEvent) => {
    const currentStroke = currentStrokeRef.current
    if (!currentStroke) return
    const rect = overlayRect()
    const simulatePressure = shouldSimulatePressure(e)
    if (currentStroke.simulatePressure && !simulatePressure) currentStroke.simulatePressure = false
    appendFreehandPoint(currentStroke.points, {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: readPointerPressure(e),
    }, currentStroke.simulatePressure !== false)
  }

  const cancelCurrentStroke = () => {
    if (shapeCanvasRef.current && scribblePointerIdRef.current !== null && shapeCanvasRef.current.hasPointerCapture(scribblePointerIdRef.current)) {
      shapeCanvasRef.current.releasePointerCapture(scribblePointerIdRef.current)
    }
    currentStrokeRef.current = null
    scribblePointerIdRef.current = null
    isDrawingRef.current = false
    setIsDrawing(false)
    setScribblePath('')
    if (scribblePaintRafRef.current) {
      cancelAnimationFrame(scribblePaintRafRef.current)
      scribblePaintRafRef.current = 0
    }
  }

  const closeCanvas = () => {
    useMainStore.getState().setCreatingCustomShapeState(null)
  }

  const undoScribble = () => {
    if (isDrawingRef.current) {
      cancelCurrentStroke()
      return
    }
    historyRef.current.undo()
  }

  const redoScribble = () => {
    if (isDrawingRef.current) return
    historyRef.current.redo()
  }

  const discardScribble = () => {
    cancelCurrentStroke()
    surfaceRef.current.strokes.length = 0
    historyRef.current.clear()
    paintCommittedStrokes()
    closeCanvas()
  }

  const acceptScribble = () => {
    if (isDrawingRef.current) return
    const ink = surfaceRef.current.strokes.flatMap(stroke => stroke.kind === 'pen' ? [stroke] : [])
    const joined = joinScribbleInk(ink)
    if (!joined.length) {
      closeCanvas()
      return
    }
    const rect = overlayRect()
    onCreatedRef.current?.(joined.map(shape => ({
      start: [shape.minX + rect.left, shape.minY + rect.top] as [number, number],
      end: [shape.maxX + rect.left, shape.maxY + rect.top] as [number, number],
      path: shape.path,
      viewBox: shape.viewBox,
      fill: shape.color,
      gradient: shape.gradient,
      groupId: shape.groupId,
    })))
  }

  const onPointerMove = (e: PointerEvent) => {
    if (modeRef.current === 'scribble') {
      if (!isDrawingRef.current || (scribblePointerIdRef.current !== null && e.pointerId !== scribblePointerIdRef.current)) return
      e.preventDefault()
      for (const sample of pointerStrokeSamples(e)) appendScribbleSample(sample)
      scheduleScribblePaint()
      return
    }
    const { pageX, pageY } = getPoint(e, true)
    setMousePosition([pageX, pageY])
    updateClosedFromCursor(pageX, pageY)
  }

  let path = ''
  for (let i = 0; i < points.length; i++) {
    const point = points[i]
    if (i === 0) path += `M ${point[0]} ${point[1]} `
    else path += `L ${point[0]} ${point[1]} `
  }
  if (mode === 'polygon' && points.length && mousePosition && !closed) {
    path += `L ${mousePosition[0]} ${mousePosition[1]}`
  }
  if (closed) path += ' Z'

  const getCreateData = (close = true): CreateCustomShapeData => {
    const pts = pointsRef.current
    const xList = pts.map(item => item[0])
    const yList = pts.map(item => item[1])
    let minX = Math.min(...xList)
    let minY = Math.min(...yList)
    let maxX = Math.max(...xList)
    let maxY = Math.max(...yList)
    if (maxX - minX < MIN_VIEWBOX) {
      const mid = (minX + maxX) / 2
      minX = mid - MIN_VIEWBOX / 2
      maxX = mid + MIN_VIEWBOX / 2
    }
    if (maxY - minY < MIN_VIEWBOX) {
      const mid = (minY + maxY) / 2
      minY = mid - MIN_VIEWBOX / 2
      maxY = mid + MIN_VIEWBOX / 2
    }
    const formatedPoints = pts.map(point => [point[0] - minX, point[1] - minY])
    let d = ''
    for (let i = 0; i < formatedPoints.length; i++) {
      const point = formatedPoints[i]
      if (i === 0) d += `M ${point[0]} ${point[1]} `
      else d += `L ${point[0]} ${point[1]} `
    }
    if (close) d += 'Z'
    const rect = overlayRect()
    const start: [number, number] = [minX + rect.left, minY + rect.top]
    const end: [number, number] = [maxX + rect.left, maxY + rect.top]
    const viewBox: [number, number] = [maxX - minX, maxY - minY]
    return { start, end, path: d, viewBox }
  }

  const finish = (close: boolean) => {
    if (pointsRef.current.length < 2) {
      setPoints([])
      setMousePosition(null)
      setClosed(false)
      return
    }
    const data = getCreateData(close)
    onCreatedRef.current?.([close ? data : { ...data, ...outlinedSupplement() }])
    setPoints([])
    setMousePosition(null)
    setClosed(false)
    isDrawingRef.current = false
    setIsDrawing(false)
  }

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    if (modeRef.current === 'scribble') {
      shapeCanvasRef.current?.setPointerCapture(e.pointerId)
      scribblePointerIdRef.current = e.pointerId
      currentStrokeRef.current = {
        kind: 'pen',
        color: scribblePaintRef.current.color,
        gradient: scribblePaintRef.current.gradient,
        gradientId: scribblePaintRef.current.gradientId,
        size: scribbleSizeRef.current,
        points: [],
        simulatePressure: shouldSimulatePressure(e),
      }
      appendScribbleSample(e)
      isDrawingRef.current = true
      setIsDrawing(true)
      scheduleScribblePaint()
      return
    }
    const { pageX, pageY } = getPoint(e, true)
    if (closedRef.current) {
      finish(true)
      return
    }
    setPoints(prev => [...prev, [pageX, pageY]])
    setMousePosition([pageX, pageY])
  }

  const onPointerUp = (e: PointerEvent) => {
    if (modeRef.current !== 'scribble' || !isDrawingRef.current) return
    if (scribblePointerIdRef.current !== null && e.pointerId !== scribblePointerIdRef.current) return
    if (shapeCanvasRef.current && scribblePointerIdRef.current !== null && shapeCanvasRef.current.hasPointerCapture(scribblePointerIdRef.current)) {
      shapeCanvasRef.current.releasePointerCapture(scribblePointerIdRef.current)
    }
    scribblePointerIdRef.current = null
    isDrawingRef.current = false
    setIsDrawing(false)
    appendScribbleSample(e)
    if (scribblePaintRafRef.current) {
      cancelAnimationFrame(scribblePaintRafRef.current)
      scribblePaintRafRef.current = 0
    }
    const stroke = currentStrokeRef.current
    currentStrokeRef.current = null
    setScribblePath('')
    if (!stroke || !strokeHasInk(stroke)) return
    historyRef.current.execute(new AddStrokeCommand(surfaceRef.current, stroke))
  }

  const close = () => {
    if (modeRef.current === 'scribble') {
      discardScribble()
      return
    }
    closeCanvas()
  }

  const keydownListenerRef = useRef<(e: KeyboardEvent) => void>(() => {})
  keydownListenerRef.current = (e: KeyboardEvent) => {
    const key = e.key.toUpperCase()
    const ctrlOrMeta = e.ctrlKey || e.metaKey
    if (modeRef.current === 'scribble') {
      if (ctrlOrMeta && key === KEYS.Z) {
        e.preventDefault()
        e.stopPropagation()
        if (e.shiftKey) redoScribble()
        else undoScribble()
        return
      }
      if (ctrlOrMeta && key === KEYS.Y) {
        e.preventDefault()
        e.stopPropagation()
        redoScribble()
        return
      }
      if (key === KEYS.ENTER) {
        e.preventDefault()
        acceptScribble()
        return
      }
      if (key === KEYS.ESC) {
        e.preventDefault()
        discardScribble()
      }
      return
    }
    if (key === KEYS.ESC) {
      close()
      return
    }
    if (key === KEYS.ENTER) {
      finish(false)
      return
    }
    if (key === KEYS.BACKSPACE || key === KEYS.DELETE) {
      if (!pointsRef.current.length) return
      e.preventDefault()
      const next = pointsRef.current.slice(0, -1)
      setPoints(next)
      pointsRef.current = next
      const pos = mousePositionRef.current
      if (pos) updateClosedFromCursor(pos[0], pos[1])
    }
  }

  const onPointerDownRef = useRef(onPointerDown)
  const onPointerMoveRef = useRef(onPointerMove)
  const onPointerUpRef = useRef(onPointerUp)
  const closeRef = useRef(close)
  onPointerDownRef.current = onPointerDown
  onPointerMoveRef.current = onPointerMove
  onPointerUpRef.current = onPointerUp
  closeRef.current = close

  useEffect(() => {
    const el = shapeCanvasRef.current
    const fromScribbleBar = (e: Event) => e.target instanceof Element && !!e.target.closest('.scribble-bar')
    const down = (e: PointerEvent) => {
      if (fromScribbleBar(e)) return
      e.stopPropagation()
      onPointerDownRef.current(e)
    }
    const move = (e: PointerEvent) => {
      if (fromScribbleBar(e)) return
      onPointerMoveRef.current(e)
    }
    const up = (e: PointerEvent) => {
      if (fromScribbleBar(e)) return
      onPointerUpRef.current(e)
    }
    const mouseDown = (e: MouseEvent) => {
      if (fromScribbleBar(e)) return
      e.stopPropagation()
      e.preventDefault()
    }
    const contextMenu = (e: MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      closeRef.current()
    }
    const listener = (e: KeyboardEvent) => keydownListenerRef.current(e)
    document.addEventListener('keydown', listener, true)
    el?.addEventListener('pointerdown', down)
    el?.addEventListener('pointermove', move)
    el?.addEventListener('pointerup', up)
    el?.addEventListener('pointercancel', up)
    el?.addEventListener('mousedown', mouseDown)
    el?.addEventListener('contextmenu', contextMenu)
    if (modeRef.current === 'scribble') useMainStore.getState().setDisableHotkeysState(true)
    return () => {
      document.removeEventListener('keydown', listener, true)
      el?.removeEventListener('pointerdown', down)
      el?.removeEventListener('pointermove', move)
      el?.removeEventListener('pointerup', up)
      el?.removeEventListener('pointercancel', up)
      el?.removeEventListener('mousedown', mouseDown)
      el?.removeEventListener('contextmenu', contextMenu)
      if (scribblePaintRafRef.current) cancelAnimationFrame(scribblePaintRafRef.current)
      if (modeRef.current === 'scribble') useMainStore.getState().setDisableHotkeysState(false)
    }
  }, [])

  return (
    <div
      className={cx('shape-create-canvas', mode)}
      ref={shapeCanvasRef}
    >
      <svg overflow="visible">
        {mode === 'scribble' ? (
          <defs>
            {MAGICAL_INK_GRADIENTS.map(preset => (
              <GradientDefs
                key={preset.id}
                id={`${SCRIBBLE_GRADIENT_PREFIX}-${preset.id}`}
                type={preset.gradient.type}
                colors={preset.gradient.colors}
                rotate={preset.gradient.rotate}
              />
            ))}
          </defs>
        ) : null}
        {mode === 'scribble' ? (
          <>
            {committedScribblePaths.map((item, index) => (
              <path key={index} d={item.d} fill={item.fill} />
            ))}
            {scribblePath ? <path d={scribblePath} fill={scribbleLiveFill} /> : null}
          </>
        ) : (
          <path
            d={path}
            stroke="#18181b"
            fill={closed ? 'rgba(24, 24, 27, 0.08)' : 'none'}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {mode === 'polygon' ? (
          <g>
            {points.map((point, index) => (
              <circle
                key={index}
                className={cx('vertex', { first: index === 0, 'close-target': index === 0 && closed })}
                cx={point[0]}
                cy={point[1]}
                r={index === 0 ? (closed ? 7 : 5) : 3.5}
              />
            ))}
          </g>
        ) : null}
      </svg>
      {mode === 'scribble' ? (
        <div
          className={cx('scribble-bar')}
          title={hintText}
          onPointerDown={event => { event.stopPropagation() }}
          onPointerUp={event => { event.stopPropagation() }}
          onMouseDown={event => { event.stopPropagation() }}
          onClick={event => { event.stopPropagation() }}
        >
          <button type="button" className={cx('scribble-btn', 'icon-only')} disabled={!canUndo} title={LL.canvas.shapeCreate.scribbleUndo()} onClick={() => undoScribble()}>
            <Icon icon="undo-2" className={cx('icon')} />
          </button>
          <button type="button" className={cx('scribble-btn', 'icon-only')} disabled={!canRedo} title={LL.canvas.shapeCreate.scribbleRedo()} onClick={() => redoScribble()}>
            <Icon icon="redo-2" className={cx('icon')} />
          </button>
          <span className={cx('scribble-divider')} aria-hidden />
          <InkPaintSwatches paint={scribblePaint} variant="round" onUpdatePaint={value => setScribblePaint(value)} />
          <span className={cx('scribble-divider')} aria-hidden />
          <div className={cx('scribble-sizes')} aria-label={LL.canvas.shapeCreate.scribbleSize()}>
            {SCRIBBLE_SIZES.map(size => (
              <button
                key={size}
                type="button"
                className={cx('scribble-size', { active: scribbleSize === size })}
                title={`${size}`}
                onClick={() => setScribbleSize(size)}
              >
                <span className={cx('scribble-size-dot')} style={{ width: size + 'px', height: size + 'px' }} />
              </button>
            ))}
          </div>
          <button type="button" className={cx('scribble-btn', 'discard')} onClick={() => discardScribble()}>
            {LL.canvas.shapeCreate.scribbleDiscard()}
          </button>
          <button type="button" className={cx('scribble-btn', 'accept')} disabled={!canUndo} onClick={() => acceptScribble()}>
            {LL.canvas.shapeCreate.scribbleAccept()}
          </button>
        </div>
      ) : (
        <div className={cx('draw-hint')}>{hintText}</div>
      )}
    </div>
  )
})

export default ShapeCreateCanvas
