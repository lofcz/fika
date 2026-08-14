import { memo, useState, useEffect } from 'react'
import { nanoid } from 'nanoid'
import type { LinePoint, LineStyleType } from '@/types/slides'
import LinePointMarker from '@/views/components/element/LineElement/LinePointMarker'

export type ISVGLineProps = {
  width?: number
  color?: string
  markers?: [LinePoint, LinePoint]
  type?: LineStyleType
  padding?: number
}

const SVGLine = memo(({
  width = 2,
  color = '#333',
  markers,
  type,
  padding = 0,
}: ISVGLineProps) => {
  const [id, setId] = useState('')

  useEffect(() => {
    setId(nanoid())
  }, [])

  const lineDashArray = (() => {
    const size = width
    if (type === 'dashed') return size <= 8 ? `${size * 5} ${size * 2.5}` : `${size * 5} ${size * 1.5}`
    if (type === 'dotted') return size <= 8 ? `${size * 1.8} ${size * 1.6}` : `${size * 1.5} ${size * 1.2}`
    return '0 0'
  })()

  return (
    <svg width="100%" height="100%" viewBox="0 0 100 10">
      <defs>
        {markers && markers[0] ? (
          <LinePointMarker id={id} position="start" type={markers[0]} color={color} baseSize={width} preview />
        ) : null}
        {markers && markers[1] ? (
          <LinePointMarker id={id} position="end" type={markers[1]} color={color} baseSize={width} preview />
        ) : null}
      </defs>
      <line
        x1={padding}
        y1={5}
        x2={100 - padding}
        y2={5}
        stroke={color}
        strokeWidth={width}
        strokeDasharray={lineDashArray}
        markerStart={markers && markers[0] ? `url(#${id}-${markers[0]}-start)` : ''}
        markerEnd={markers && markers[1] ? `url(#${id}-${markers[1]}-end)` : ''}
      />
    </svg>
  )
})

export default SVGLine
