import { memo } from 'react'

import type { LinePoint } from '@/types/slides'

type NonEmptyLinePoint = Exclude<LinePoint, ''>

export type ILinePointMarkerProps = {
  id: string
  position: 'start' | 'end'
  type: NonEmptyLinePoint
  baseSize: number
  color?: string
  preview?: boolean
}

const LinePointMarker = memo((props: ILinePointMarkerProps) => {
  const { id, position, type, color } = props
  const pathMap = {
    dot: 'm0 5a5 5 0 1 0 10 0a5 5 0 1 0 -10 0z',
    arrow: 'M0,0 L10,5 0,10 Z',
  }
  const rotateMap: Record<string, number> = {
    'arrow-start': 180,
    'arrow-end': 0,
  }
  const path = pathMap[props.type]
  const rotate = rotateMap[`${props.type}-${props.position}`] || 0
  const size = props.baseSize < 2 ? 2 : props.baseSize
  const refX = (() => {
    if (props.preview) return size * 1.5
    if (props.position === 'start') return 0
    return size * 3
  })()
  const refY = size * 1.5

  return (
    <marker
      id={`${id}-${type}-${position}`}
      markerUnits="userSpaceOnUse"
      orient="auto"
      markerWidth={size * 3}
      markerHeight={size * 3}
      refX={refX}
      refY={refY}
    >
      <path
        d={path}
        fill={color}
        transform={`scale(${size * 0.3}, ${size * 0.3}) rotate(${rotate}, 5, 5)`}
      />
    </marker>
  )
})

export default LinePointMarker
