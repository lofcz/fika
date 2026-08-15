import Konva from 'konva'
import type { PPTLineElement } from '@/types/slides'
import { getLineElementRenderPath } from '@/utils/element'
import {
  lineDashArray,
  linePolylinePoints,
  lineStrokeWidth,
  shadowPaint,
} from '@/utils/elementPaint'

const markerSize = (strokeWidth: number) => (strokeWidth < 2 ? 2 : strokeWidth)

const arrowHead = (
  tip: [number, number],
  from: [number, number],
  size: number,
  color: string,
) => {
  const dx = tip[0] - from[0]
  const dy = tip[1] - from[1]
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const backX = tip[0] - ux * size * 2
  const backY = tip[1] - uy * size * 2
  const leftX = backX - uy * size
  const leftY = backY + ux * size
  const rightX = backX + uy * size
  const rightY = backY - ux * size
  return new Konva.Path({
    data: `M ${tip[0]} ${tip[1]} L ${leftX} ${leftY} L ${rightX} ${rightY} Z`,
    fill: color,
    listening: false,
  })
}

const addCaps = (group: Konva.Group, element: PPTLineElement, strokeWidth: number) => {
  const size = markerSize(strokeWidth)
  const [startCap, endCap] = element.points
  const addDot = (x: number, y: number) => {
    group.add(new Konva.Path({
      data: `M ${x - size / 2} ${y} a ${size / 2} ${size / 2} 0 1 0 ${size} 0 a ${size / 2} ${size / 2} 0 1 0 ${-size} 0 Z`,
      fill: element.color,
      listening: false,
    }))
  }
  if (startCap === 'dot') addDot(element.start[0], element.start[1])
  if (endCap === 'dot') addDot(element.end[0], element.end[1])
  if (element.curve || element.cubic) {
    const startFrom = element.curve || element.cubic![0]
    const endFrom = element.curve || element.cubic![1]
    if (startCap === 'arrow') group.add(arrowHead(element.start, startFrom, size, element.color))
    if (endCap === 'arrow') group.add(arrowHead(element.end, endFrom, size, element.color))
  }
}

export const paintLine = (element: PPTLineElement) => {
  const strokeWidth = lineStrokeWidth(element)
  const dash = lineDashArray(element.style, strokeWidth)
  const group = new Konva.Group({ listening: false, ...shadowPaint(element.shadow) })
  const points = linePolylinePoints(element)
  const [startCap, endCap] = element.points
  const hasArrow = startCap === 'arrow' || endCap === 'arrow'

  if (points && hasArrow) {
    const size = markerSize(strokeWidth)
    group.add(new Konva.Arrow({
      points,
      stroke: element.color,
      fill: element.color,
      strokeWidth,
      dash,
      lineCap: 'round',
      lineJoin: 'round',
      pointerLength: size,
      pointerWidth: size,
      pointerAtBeginning: startCap === 'arrow',
      pointerAtEnding: endCap === 'arrow',
      listening: false,
    }))
  }
  else if (points) {
    group.add(new Konva.Line({
      points,
      stroke: element.color,
      strokeWidth,
      dash,
      lineCap: 'round',
      lineJoin: 'round',
      listening: false,
    }))
  }
  else {
    group.add(new Konva.Path({
      data: getLineElementRenderPath(element),
      stroke: element.color,
      strokeWidth,
      dash,
      lineCap: 'round',
      lineJoin: 'round',
      fillEnabled: false,
      listening: false,
    }))
  }

  addCaps(group, element, strokeWidth)
  return group
}
