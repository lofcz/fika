import { bindStyles } from '@/utils/cssm'
import styles from './AlignmentLine.module.scss'
const cx = bindStyles(styles)
import { memo, useId } from 'react'

import type { AlignmentLineAxis, SnapKind } from '@/types/edit'

export type IAlignmentLineProps = {
  type: 'vertical' | 'horizontal'
  axis: AlignmentLineAxis
  length: number
  canvasScale: number
  kind?: SnapKind
  marks?: number[]
  label?: string
}

export function areAlignmentLinePropsEqual(prev: IAlignmentLineProps, next: IAlignmentLineProps) {
  return prev.type === next.type
    && prev.length === next.length
    && prev.canvasScale === next.canvasScale
    && prev.kind === next.kind
    && prev.label === next.label
    && prev.axis.x === next.axis.x
    && prev.axis.y === next.axis.y
    && (prev.marks || []).join() === (next.marks || []).join()
}

const AlignmentLine = memo((props: IAlignmentLineProps) => {
  const { type, kind = 'edge', marks = [], label } = props
  const gradId = useId().replace(/:/g, '')
  const scale = props.canvasScale
  const left = props.axis.x * scale
  const top = props.axis.y * scale
  const length = Math.max(0, props.length * scale)
  const vertical = type === 'vertical'
  const markPositions = marks
    .map(mark => (vertical ? mark - props.axis.y : mark - props.axis.x) * scale)
    .filter(pos => pos >= -1 && pos <= length + 1)

  const mid = length / 2
  const tick = kind === 'spacing' || kind === 'size' || kind === 'measure' ? 5 : 0
  const pad = 8
  const fadePct = length > 0 ? Math.min(18, length * 0.35) / length * 100 : 0
  const svgWidth = vertical ? pad * 2 : length
  const svgHeight = vertical ? length : pad * 2
  const x1 = vertical ? pad : 0
  const y1 = vertical ? 0 : pad
  const x2 = vertical ? pad : length
  const y2 = vertical ? length : pad
  const tickPath = tick
    ? (vertical
      ? `M${pad - tick} 0.5 L${pad + tick} 0.5 M${pad - tick} ${length - 0.5} L${pad + tick} ${length - 0.5}`
      : `M0.5 ${pad - tick} L0.5 ${pad + tick} M${length - 0.5} ${pad - tick} L${length - 0.5} ${pad + tick}`)
    : ''

  return (
    <div
      className={cx('alignment-line', kind, type)}
      style={{ left: `${left}px`, top: `${top}px` }}
    >
      <svg
        className={cx('stroke')}
        width={svgWidth}
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={vertical ? { marginLeft: -pad } : { marginTop: -pad }}
        aria-hidden
      >
        <defs>
          <linearGradient
            id={`${gradId}-fade`}
            gradientUnits="userSpaceOnUse"
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
          >
            <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
            <stop offset={`${fadePct}%`} stopColor="currentColor" stopOpacity="1" />
            <stop offset={`${100 - fadePct}%`} stopColor="currentColor" stopOpacity="1" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
          <linearGradient
            id={`${gradId}-halo`}
            gradientUnits="userSpaceOnUse"
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
          >
            <stop offset="0%" stopColor="var(--operate-line-halo, #ffffff)" stopOpacity="0" />
            <stop offset={`${fadePct}%`} stopColor="var(--operate-line-halo, #ffffff)" stopOpacity="1" />
            <stop offset={`${100 - fadePct}%`} stopColor="var(--operate-line-halo, #ffffff)" stopOpacity="1" />
            <stop offset="100%" stopColor="var(--operate-line-halo, #ffffff)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line
          className={cx('halo')}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={`url(#${gradId}-halo)`}
        />
        <line
          className={cx('wash')}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={`url(#${gradId}-fade)`}
        />
        <line
          className={cx('hairline')}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={`url(#${gradId}-fade)`}
        />
        {tickPath ? (
          <>
            <path className={cx('tick-halo')} d={tickPath} />
            <path className={cx('tick')} d={tickPath} />
          </>
        ) : null}
        {markPositions.map((pos, index) => {
          const cxPos = vertical ? pad : pos
          const cyPos = vertical ? pos : pad
          if (kind === 'center') {
            const d = 2.4
            return (
              <path
                key={index}
                className={cx('mark')}
                d={`M${cxPos} ${cyPos - d} L${cxPos + d} ${cyPos} L${cxPos} ${cyPos + d} L${cxPos - d} ${cyPos} Z`}
              />
            )
          }
          return <circle key={index} className={cx('mark')} cx={cxPos} cy={cyPos} r={2.1} />
        })}
      </svg>
      {label ? (
        <span
          className={cx('measure')}
          style={vertical
            ? { top: `${mid}px`, left: `${pad + 6}px` }
            : { left: `${mid}px`, top: `${pad + 6}px` }
          }
        >
          {label}
        </span>
      ) : null}
    </div>
  )
}, areAlignmentLinePropsEqual)

export default AlignmentLine
