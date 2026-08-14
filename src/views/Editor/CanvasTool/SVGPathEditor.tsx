import { bindStyles } from '@/utils/cssm'
import styles from './SVGPathEditor.module.scss'
const cx = bindStyles(styles)
import { useRef, useState, useEffect, type CSSProperties, type MouseEvent } from 'react'
import { openContextmenu } from '@/utils/openContextmenu'
import type { ContextmenuItem } from '@/components/Contextmenu/types'
import { useI18nContext } from '@/i18n/useI18nContext'
import Button from '@/components/Button'
import Checkbox from '@/components/Checkbox'
import Divider from '@/components/Divider'
import NumberInput from '@/components/NumberInput'
import RadioButton from '@/components/RadioButton'
import RadioGroup from '@/components/RadioGroup'

type SegmentType = 'L' | 'Q' | 'C' | 'A'
type PointAxis = 'x' | 'y'
type ArcParamKey = 'rx' | 'ry' | 'rot' | 'laf' | 'sf'

interface PointPosition {
  x: number
  y: number
}
interface ArcParams {
  rx: number
  ry: number
  rot: number
  laf: 0 | 1
  sf: 0 | 1
}
interface PathPoint extends PointPosition {
  type?: SegmentType
  q?: PointPosition
  c?: [PointPosition, PointPosition]
  a?: ArcParams
}
interface GridLine {
  key: string
  x1: number
  y1: number
  x2: number
  y2: number
}
type DraggingState = {
  type: 'point'
  index: number
} | {
  type: 'quadratic'
  index: number
} | {
  type: 'cubic'
  index: number
  anchor: 0 | 1
}

export type ISVGPathEditorProps = {
  className?: string
  style?: CSSProperties
  onClose?: () => void
  onInsert?: (path: string) => void
}

const GRID_SIZE = 400
const GRID_GAP = 20
const CANVAS_PADDING = 50

export default function SVGPathEditor(props: ISVGPathEditorProps) {
  const { LL } = useI18nContext()
  const CANVAS_SIZE = GRID_SIZE + CANVAS_PADDING * 2
  const CANVAS_MIN = -CANVAS_PADDING
  const CANVAS_MAX = GRID_SIZE + CANVAS_PADDING

  const svgRef = useRef<SVGSVGElement>(null)
  const [points, setPoints] = useState<PathPoint[]>([{ x: 0, y: 0 }])
  const [activePointIndex, setActivePointIndex] = useState(0)
  const [closePath, setClosePath] = useState(false)
  const [contextPoint, setContextPoint] = useState<PointPosition>({ x: 280, y: 200 })
  const draggingRef = useRef<DraggingState | null>(null)
  const pointsRef = useRef(points)
  pointsRef.current = points
  const activePointIndexRef = useRef(activePointIndex)
  activePointIndexRef.current = activePointIndex
  const contextPointRef = useRef(contextPoint)
  contextPointRef.current = contextPoint

  const gridLines = (() => {
    const lines: GridLine[] = []
    for (let x = 0; x <= GRID_SIZE; x += GRID_GAP) {
      lines.push({ key: `x-${x}`, x1: x, y1: 0, x2: x, y2: GRID_SIZE })
    }
    for (let y = 0; y <= GRID_SIZE; y += GRID_GAP) {
      lines.push({ key: `y-${y}`, x1: 0, y1: y, x2: GRID_SIZE, y2: y })
    }
    return lines
  })()

  const activePoint = points[activePointIndex] || points[0]
  const activeSegmentType = (() => {
    if (activePointIndex === 0) return 'L'
    const point = activePoint
    if (point.q) return 'Q'
    if (point.c) return 'C'
    if (point.a) return 'A'
    return 'L'
  })()

  const path = (() => {
    let d = ''
    for (let i = 0; i < points.length; i++) {
      const point = points[i]
      if (i === 0) d += `M ${point.x} ${point.y} `
      else if (point.q) d += `Q ${point.q.x} ${point.q.y} ${point.x} ${point.y} `
      else if (point.c) d += `C ${point.c[0].x} ${point.c[0].y} ${point.c[1].x} ${point.c[1].y} ${point.x} ${point.y} `
      else if (point.a) d += `A ${point.a.rx} ${point.a.ry} ${point.a.rot} ${point.a.laf} ${point.a.sf} ${point.x} ${point.y} `
      else d += `L ${point.x} ${point.y} `
    }
    if (closePath) d += 'Z'
    return d.trim()
  })()

  const canInsert = points.length >= 2

  const snap = (value: number) => Math.round(value / GRID_GAP) * GRID_GAP
  const clamp = (value: number) => Math.min(Math.max(value, CANVAS_MIN), CANVAS_MAX)

  const getSvgPoint = (e: MouseEvent | globalThis.MouseEvent): PointPosition => {
    if (!svgRef.current) return { x: 0, y: 0 }
    const rect = svgRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) * CANVAS_SIZE / rect.width + CANVAS_MIN
    const y = (e.clientY - rect.top) * CANVAS_SIZE / rect.height + CANVAS_MIN
    return {
      x: clamp(snap(Math.round(x))),
      y: clamp(snap(Math.round(y))),
    }
  }

  const createPoint = (type: SegmentType, position: PointPosition, prevPoint: PathPoint): PathPoint => {
    if (type === 'Q') {
      return {
        ...position,
        type,
        q: {
          x: (position.x + prevPoint.x) / 2,
          y: (position.y + prevPoint.y) / 2,
        },
      }
    }
    if (type === 'C') {
      return {
        ...position,
        type,
        c: [{
          x: (position.x + prevPoint.x - 50) / 2,
          y: (position.y + prevPoint.y) / 2,
        }, {
          x: (position.x + prevPoint.x + 50) / 2,
          y: (position.y + prevPoint.y) / 2,
        }],
      }
    }
    if (type === 'A') {
      return {
        ...position,
        type,
        a: { rx: 50, ry: 50, rot: 0, laf: 1, sf: 1 },
      }
    }
    return { ...position, type: 'L' }
  }

  const setPoint = (index: number, point: PathPoint) => {
    const newPoints = [...pointsRef.current]
    newPoints[index] = point
    pointsRef.current = newPoints
    setPoints(newPoints)
  }

  const updateSegmentType = (type: string) => {
    if (activePointIndex === 0) return
    const index = activePointIndex
    const point = activePoint
    const prevPoint = points[index - 1]
    setPoint(index, createPoint(type as SegmentType, { x: point.x, y: point.y }, prevPoint))
  }

  const updatePointPosition = (axis: PointAxis, value: number) => {
    const point = activePoint
    setPoint(activePointIndex, { ...point, [axis]: value })
  }

  const updateQuadraticPosition = (axis: PointAxis, value: number) => {
    const point = activePoint
    if (!point.q) return
    const q = { ...point.q, [axis]: value }
    setPoint(activePointIndex, { ...point, q })
  }

  const updateCubicPosition = (axis: PointAxis, value: number, anchor: 0 | 1) => {
    const point = activePoint
    if (!point.c) return
    const c: [PointPosition, PointPosition] = [{ ...point.c[0] }, { ...point.c[1] }]
    c[anchor] = { ...c[anchor], [axis]: value }
    setPoint(activePointIndex, { ...point, c })
  }

  const updateArcParam = (key: ArcParamKey, value: number) => {
    const point = activePoint
    if (!point.a) return
    const a: ArcParams = { ...point.a }
    if (key === 'laf' || key === 'sf') a[key] = value ? 1 : 0
    else a[key] = value
    setPoint(activePointIndex, { ...point, a })
  }

  const addPoint = (type: SegmentType) => {
    const prevPoint = pointsRef.current[activePointIndexRef.current] || pointsRef.current[0]
    const newPoint = createPoint(type, contextPointRef.current, prevPoint)
    const newPoints = [...pointsRef.current]
    const isRepeat = prevPoint.x === newPoint.x && prevPoint.y === newPoint.y
    const insertIndex = isRepeat ? newPoints.length : activePointIndexRef.current + 1
    if (isRepeat) newPoints.push(newPoint)
    else newPoints.splice(insertIndex, 0, newPoint)
    pointsRef.current = newPoints
    setPoints(newPoints)
    activePointIndexRef.current = insertIndex
    setActivePointIndex(insertIndex)
  }

  const appendLineByDoubleClick = (e: MouseEvent<SVGSVGElement>) => {
    const next = getSvgPoint(e)
    contextPointRef.current = next
    setContextPoint(next)
    addPoint('L')
  }

  const removeActivePoint = () => {
    if (activePointIndexRef.current === 0) return
    if (pointsRef.current.length === 1) return
    const index = activePointIndexRef.current
    const newPoints = pointsRef.current.filter((_, i) => i !== index)
    pointsRef.current = newPoints
    setPoints(newPoints)
    const nextIndex = Math.max(index - 1, 0)
    activePointIndexRef.current = nextIndex
    setActivePointIndex(nextIndex)
  }

  const prepareContextmenu = (e: MouseEvent<HTMLDivElement>) => {
    const next = getSvgPoint(e)
    contextPointRef.current = next
    setContextPoint(next)
    const target = e.target as Element
    const pointEl = target.closest('[data-point-index]') as SVGCircleElement | null
    const pointIndex = pointEl ? Number(pointEl.dataset.pointIndex) : NaN
    if (!isNaN(pointIndex)) {
      activePointIndexRef.current = pointIndex
      setActivePointIndex(pointIndex)
    }
  }

  const contextmenus = (): ContextmenuItem[] => {
    const t = LL.editor.svgPathEditor
    return [
      { text: t.appendLine(), handler: () => addPoint('L') },
      { text: t.appendQuadratic(), handler: () => addPoint('Q') },
      { text: t.appendCubic(), handler: () => addPoint('C') },
      { text: t.appendArc(), handler: () => addPoint('A') },
      { divider: true },
      { text: t.deletePoint(), disable: activePointIndexRef.current === 0, handler: removeActivePoint },
    ]
  }

  const drag = (e: globalThis.MouseEvent) => {
    const state = draggingRef.current
    if (!state) return
    const position = getSvgPoint(e)
    const point = pointsRef.current[state.index]
    if (state.type === 'point') setPoint(state.index, { ...point, ...position })
    else if (state.type === 'quadratic' && point.q) setPoint(state.index, { ...point, q: position })
    else if (state.type === 'cubic' && point.c) {
      const c: [PointPosition, PointPosition] = [{ ...point.c[0] }, { ...point.c[1] }]
      c[state.anchor] = position
      setPoint(state.index, { ...point, c })
    }
  }

  const stopDragging = () => {
    draggingRef.current = null
    document.removeEventListener('mousemove', drag)
    document.removeEventListener('mouseup', stopDragging)
  }

  const startDragging = (e: MouseEvent) => {
    e.preventDefault()
    document.addEventListener('mousemove', drag)
    document.addEventListener('mouseup', stopDragging)
  }

  const startDraggingPoint = (e: MouseEvent, index: number) => {
    activePointIndexRef.current = index
    setActivePointIndex(index)
    draggingRef.current = { type: 'point', index }
    startDragging(e)
  }

  const startDraggingQuadratic = (e: MouseEvent, index: number) => {
    activePointIndexRef.current = index
    setActivePointIndex(index)
    draggingRef.current = { type: 'quadratic', index }
    startDragging(e)
  }

  const startDraggingCubic = (e: MouseEvent, index: number, anchor: 0 | 1) => {
    activePointIndexRef.current = index
    setActivePointIndex(index)
    draggingRef.current = { type: 'cubic', index, anchor }
    startDragging(e)
  }

  const insert = () => {
    if (!canInsert) return
    props.onInsert?.(path)
  }

  useEffect(() => () => {
    stopDragging()
  }, [])

  return (
    <div className={cx('svg-path-editor', props.className)} style={props.style}>
      <div className={cx('container')}>
        <div
          className={cx('svg-canvas')}
          onContextMenu={e => { e.stopPropagation(); e.preventDefault(); openContextmenu(e, contextmenus) }}
          onContextMenuCapture={prepareContextmenu}
        >
          <svg
            ref={svgRef}
            className={cx('svg-grid')}
            viewBox={`${CANVAS_MIN} ${CANVAS_MIN} ${CANVAS_SIZE} ${CANVAS_SIZE}`}
            onDoubleClick={appendLineByDoubleClick}
          >
            <rect className={cx('canvas-background')} x={CANVAS_MIN} y={CANVAS_MIN} width={CANVAS_SIZE} height={CANVAS_SIZE} />
            <rect className={cx('grid-background')} width={GRID_SIZE} height={GRID_SIZE} />
            <g className={cx('grid-lines')}>
              {gridLines.map(line => (
                <line key={line.key} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
              ))}
            </g>
            <path className={cx('path-preview')} d={path} fill={closePath ? 'rgba(24, 24, 27, 0.08)' : 'none'} />

            {points.map((point, index) => (
              <g key={index}>
                {index > 0 && point.q ? (
                  <>
                    <line className={cx('anchor-line')} x1={points[index - 1].x} y1={points[index - 1].y} x2={point.q.x} y2={point.q.y} />
                    <line className={cx('anchor-line')} x1={point.q.x} y1={point.q.y} x2={point.x} y2={point.y} />
                    <circle
                      className={cx('anchor-point')}
                      cx={point.q.x}
                      cy={point.q.y}
                      r="6"
                      onMouseDown={e => { e.stopPropagation(); if (e.button !== 0) return; startDraggingQuadratic(e, index) }}
                    />
                  </>
                ) : null}

                {index > 0 && point.c ? (
                  <>
                    <line className={cx('anchor-line')} x1={points[index - 1].x} y1={points[index - 1].y} x2={point.c[0].x} y2={point.c[0].y} />
                    <line className={cx('anchor-line')} x1={point.x} y1={point.y} x2={point.c[1].x} y2={point.c[1].y} />
                    <circle
                      className={cx('anchor-point')}
                      cx={point.c[0].x}
                      cy={point.c[0].y}
                      r="6"
                      onMouseDown={e => { e.stopPropagation(); if (e.button !== 0) return; startDraggingCubic(e, index, 0) }}
                    />
                    <circle
                      className={cx('anchor-point')}
                      cx={point.c[1].x}
                      cy={point.c[1].y}
                      r="6"
                      onMouseDown={e => { e.stopPropagation(); if (e.button !== 0) return; startDraggingCubic(e, index, 1) }}
                    />
                  </>
                ) : null}

                <circle
                  className={cx('path-point', { start: index === 0, active: index === activePointIndex })}
                  data-point-index={index}
                  cx={point.x}
                  cy={point.y}
                  r={index === 0 ? 6 : 7}
                  onMouseDown={e => { e.stopPropagation(); if (e.button !== 0) return; startDraggingPoint(e, index) }}
                />
              </g>
            ))}
          </svg>
        </div>

        <div className={cx('svg-panel')}>
          <div className={cx('panel-section')}>
            <RadioGroup
              className={cx('segment-type', { disabled: activePointIndex === 0 })}
              value={activeSegmentType}
              onUpdateValue={updateSegmentType}
            >
              <RadioButton value="L" disabled={activePointIndex === 0}>{LL.editor.svgPathEditor.segmentLine()}</RadioButton>
              <RadioButton value="Q" disabled={activePointIndex === 0}>{LL.editor.svgPathEditor.segmentQuadratic()}</RadioButton>
              <RadioButton value="C" disabled={activePointIndex === 0}>{LL.editor.svgPathEditor.segmentCubic()}</RadioButton>
              <RadioButton value="A" disabled={activePointIndex === 0}>{LL.editor.svgPathEditor.segmentArc()}</RadioButton>
            </RadioGroup>
          </div>

          <Divider margin={20} />

          <div className={cx('panel-section')}>
            <div className={cx('section-title')}>{LL.editor.svgPathEditor.coordinates()}</div>
            <div className={cx('input-row')}>
              <NumberInput className={cx('number-input')} min={CANVAS_MIN} max={CANVAS_MAX} step={1} value={activePoint.x} onUpdateValue={value => updatePointPosition('x', value)} prefix={LL.editor.svgPathEditor.horizontal()} />
              <NumberInput className={cx('number-input')} min={CANVAS_MIN} max={CANVAS_MAX} step={1} value={activePoint.y} onUpdateValue={value => updatePointPosition('y', value)} prefix={LL.editor.svgPathEditor.vertical()} />
            </div>
          </div>

          {activePoint.q ? (
            <>
              <Divider margin={20} />
              <div className={cx('panel-section')}>
                <div className={cx('section-title')}>{LL.editor.svgPathEditor.controlPoints()}</div>
                <div className={cx('input-row')}>
                  <NumberInput className={cx('number-input')} min={CANVAS_MIN} max={CANVAS_MAX} step={1} value={activePoint.q.x} onUpdateValue={value => updateQuadraticPosition('x', value)} prefix={LL.editor.svgPathEditor.horizontal()} />
                  <NumberInput className={cx('number-input')} min={CANVAS_MIN} max={CANVAS_MAX} step={1} value={activePoint.q.y} onUpdateValue={value => updateQuadraticPosition('y', value)} prefix={LL.editor.svgPathEditor.vertical()} />
                </div>
              </div>
            </>
          ) : null}

          {activePoint.c ? (
            <>
              <Divider margin={20} />
              <div className={cx('panel-section')}>
                <div className={cx('section-title')}>{LL.editor.svgPathEditor.controlPoints()}</div>
                <div className={cx('input-row')}>
                  <NumberInput className={cx('number-input')} min={CANVAS_MIN} max={CANVAS_MAX} step={1} value={activePoint.c[0].x} onUpdateValue={value => updateCubicPosition('x', value, 0)} prefix={LL.editor.svgPathEditor.control1Horizontal()} />
                  <NumberInput className={cx('number-input')} min={CANVAS_MIN} max={CANVAS_MAX} step={1} value={activePoint.c[0].y} onUpdateValue={value => updateCubicPosition('y', value, 0)} prefix={LL.editor.svgPathEditor.control1Vertical()} />
                </div>
                <div className={cx('input-row')}>
                  <NumberInput className={cx('number-input')} min={CANVAS_MIN} max={CANVAS_MAX} step={1} value={activePoint.c[1].x} onUpdateValue={value => updateCubicPosition('x', value, 1)} prefix={LL.editor.svgPathEditor.control2Horizontal()} />
                  <NumberInput className={cx('number-input')} min={CANVAS_MIN} max={CANVAS_MAX} step={1} value={activePoint.c[1].y} onUpdateValue={value => updateCubicPosition('y', value, 1)} prefix={LL.editor.svgPathEditor.control2Vertical()} />
                </div>
              </div>
            </>
          ) : null}

          {activePoint.a ? (
            <>
              <Divider margin={20} />
              <div className={cx('panel-section')}>
                <div className={cx('section-title')}>{LL.editor.svgPathEditor.arc()}</div>
                <div className={cx('input-row')}>
                  <NumberInput className={cx('number-input')} min={0} max={1000} step={1} value={activePoint.a.rx} onUpdateValue={value => updateArcParam('rx', value)} prefix={LL.editor.svgPathEditor.radiusX()} />
                  <NumberInput className={cx('number-input')} min={0} max={1000} step={1} value={activePoint.a.ry} onUpdateValue={value => updateArcParam('ry', value)} prefix={LL.editor.svgPathEditor.radiusY()} />
                </div>
                <div className={cx('input-row')}>
                  <NumberInput className={cx('number-input')} min={0} max={360} step={1} value={activePoint.a.rot} onUpdateValue={value => updateArcParam('rot', value)} prefix={LL.editor.svgPathEditor.rotate()} />
                </div>
                <div className={cx('checkbox-row')}>
                  <Checkbox value={activePoint.a.laf === 1} onUpdateValue={value => updateArcParam('laf', value ? 1 : 0)}>{LL.editor.svgPathEditor.largeArc()}</Checkbox>
                  <Checkbox value={activePoint.a.sf === 1} onUpdateValue={value => updateArcParam('sf', value ? 1 : 0)}>{LL.editor.svgPathEditor.clockwise()}</Checkbox>
                </div>
              </div>
            </>
          ) : null}

          <Divider margin={20} />

          <div className={cx('panel-section')}>
            <Checkbox value={closePath} onUpdateValue={value => setClosePath(value)}>{LL.editor.svgPathEditor.closePath()}</Checkbox>
          </div>

          <Divider margin={20} />

          <div className={cx('panel-section')}>
            <div className={cx('path-content')}>{path}</div>
          </div>
        </div>
      </div>

      <div className={cx('footer')}>
        <div className={cx('tooltips')}>{LL.editor.svgPathEditor.tips()}</div>
        <div className={cx('footer-actions')}>
          <Button onClick={() => props.onClose?.()}>{LL.common.close()}</Button>
          <Button type="primary" disabled={!canInsert} onClick={() => insert()}>{LL.common.confirm()}</Button>
        </div>
      </div>
    </div>
  )
}
