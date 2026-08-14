import { bindStyles } from '@/utils/cssm'
import styles from './Ruler.module.scss'
const cx = bindStyles(styles)
import { memo, useMemo } from 'react'

import { useMainStore, useSlidesStore } from '@/store'
import { getElementListRange } from '@/utils/element'
import type { PPTElement } from '@/types/slides'

interface ViewportStyles {
  top: number
  left: number
  width: number
  height: number
}

export type IRulerProps = {
  viewportStyles: ViewportStyles
  elementList: PPTElement[]
}

const RULER_MARKERS = Array.from({ length: 20 }, (_, i) => i + 1)

function viewportStylesEqual(a: ViewportStyles, b: ViewportStyles) {
  return a === b || (
    a.top === b.top &&
    a.left === b.left &&
    a.width === b.width &&
    a.height === b.height
  )
}

function rangeGeometryEqual(a: PPTElement, b: PPTElement) {
  if (a === b) return true
  if (a.id !== b.id || a.type !== b.type) return false
  if (a.left !== b.left || a.top !== b.top) return false
  if (a.type === 'line' && b.type === 'line') {
    return a.start[0] === b.start[0] && a.start[1] === b.start[1]
      && a.end[0] === b.end[0] && a.end[1] === b.end[1]
  }
  const widthA = 'width' in a ? a.width : undefined
  const widthB = 'width' in b ? b.width : undefined
  const heightA = 'height' in a ? a.height : undefined
  const heightB = 'height' in b ? b.height : undefined
  const rotateA = 'rotate' in a ? a.rotate : 0
  const rotateB = 'rotate' in b ? b.rotate : 0
  return widthA === widthB && heightA === heightB && rotateA === rotateB
}

function elementListRangeRelevantEqual(prev: PPTElement[], next: PPTElement[]) {
  if (prev === next) return true
  if (prev.length !== next.length) return false
  for (let i = 0; i < prev.length; i++) {
    if (!rangeGeometryEqual(prev[i], next[i])) return false
  }
  return true
}

export function areRulerPropsEqual(prev: IRulerProps, next: IRulerProps) {
  return viewportStylesEqual(prev.viewportStyles, next.viewportStyles)
    && elementListRangeRelevantEqual(prev.elementList, next.elementList)
}

const Ruler = memo(({ viewportStyles, elementList }: IRulerProps) => {
  const canvasScale = useMainStore(s => s.canvasScale)
  const activeElementIdList = useMainStore(s => s.activeElementIdList)
  const viewportRatio = useSlidesStore(s => s.viewportRatio)
  const viewportSize = useSlidesStore(s => s.viewportSize)

  const elementListRange = useMemo(() => {
    const els = elementList.filter(el => activeElementIdList.includes(el.id))
    if (!els.length) return null
    return getElementListRange(els)
  }, [elementList, activeElementIdList])

  const markerSize = viewportStyles.width * canvasScale / (viewportSize / 100)

  return (
    <div className={cx('ruler')}>
      <div
        className={cx('h')}
        style={{
          width: viewportStyles.width * canvasScale + 'px',
          left: viewportStyles.left + 'px',
        }}
      >
        {RULER_MARKERS.map(marker => (
          <div
            className={cx('ruler-marker-100', { hide: markerSize < 36, omit: markerSize < 72 })}
            key={`h-marker-100-${marker}`}
            style={{ width: markerSize + 'px' }}
          >
            {marker * 100 <= viewportSize ? <span>{marker * 100}</span> : null}
          </div>
        ))}
        {elementListRange ? (
          <div
            className={cx('range')}
            style={{
              left: elementListRange.minX * canvasScale + 'px',
              width: (elementListRange.maxX - elementListRange.minX) * canvasScale + 'px',
            }}
          />
        ) : null}
      </div>
      <div
        className={cx('v')}
        style={{
          height: viewportStyles.height * canvasScale + 'px',
          top: viewportStyles.top + 'px',
        }}
      >
        {RULER_MARKERS.map(marker => (
          <div
            className={cx('ruler-marker-100', { hide: markerSize < 36, omit: markerSize < 72 })}
            key={`v-marker-100-${marker}`}
            style={{ height: markerSize + 'px' }}
          >
            {marker * 100 <= viewportSize * viewportRatio ? <span>{marker * 100}</span> : null}
          </div>
        ))}
        {elementListRange ? (
          <div
            className={cx('range')}
            style={{
              top: elementListRange.minY * canvasScale + 'px',
              height: (elementListRange.maxY - elementListRange.minY) * canvasScale + 'px',
            }}
          />
        ) : null}
      </div>
    </div>
  )
}, areRulerPropsEqual)

export default Ruler
