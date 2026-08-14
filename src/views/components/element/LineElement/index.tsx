import { bindStyles } from '@/utils/cssm'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { useCallback, memo } from 'react'

import { openContextmenu } from '@/utils/openContextmenu'
import type { PPTLineElement } from '@/types/slides'
import { getLineElementPath, getLineElementRenderPath } from '@/utils/element'
import type { ContextmenuItem } from '@/components/Contextmenu/types'
import useElementShadow from '@/views/components/element/hooks/useElementShadow'
import LinePointMarker from './LinePointMarker'

export type ILineElementProps = {
  elementInfo: PPTLineElement
  selectElement: (e: MouseEvent | TouchEvent, element: PPTLineElement, canMove?: boolean) => void
  contextmenus: () => ContextmenuItem[] | null
}

const LineElement = memo((props: ILineElementProps) => {
  const { elementInfo, contextmenus } = props

  const handleSelectElement = useCallback((e: MouseEvent | TouchEvent) => {
    if (props.elementInfo.lock) return
    e.stopPropagation()
    props.selectElement(e, props.elementInfo)
  }, [props.elementInfo, props.selectElement])

  const { shadowStyle } = useElementShadow(props.elementInfo.shadow)

  const svgWidth = (() => {
    const width = Math.abs(props.elementInfo.start[0] - props.elementInfo.end[0])
    return width < 24 ? 24 : width
  })()
  const svgHeight = (() => {
    const height = Math.abs(props.elementInfo.start[1] - props.elementInfo.end[1])
    return height < 24 ? 24 : height
  })()
  const lineDashArray = (() => {
    const size = props.elementInfo.width
    if (props.elementInfo.style === 'dashed') return size <= 8 ? `${size * 5} ${size * 2.5}` : `${size * 5} ${size * 1.5}`
    if (props.elementInfo.style === 'dotted') return size <= 8 ? `${size * 1.8} ${size * 1.6}` : `${size * 1.5} ${size * 1.2}`
    return '0 0'
  })()
  const path = getLineElementRenderPath(props.elementInfo)
  const hitPath = getLineElementPath(props.elementInfo)

  return (
    <div
      className={cx('editable-element-shape', { lock: elementInfo.lock })}
      style={{
        top: elementInfo.top + 'px',
        left: elementInfo.left + 'px',
      }}
    >
      <div
        className={cx('element-content')}
        style={{ filter: shadowStyle ? `drop-shadow(${shadowStyle})` : '' }}
        onMouseDown={event => handleSelectElement(event.nativeEvent)}
        onTouchStart={event => handleSelectElement(event.nativeEvent)}
      >
        <svg overflow="visible" width={svgWidth} height={svgHeight}>
          <defs>
            {elementInfo.points[0] ? (
              <LinePointMarker
                id={elementInfo.id}
                position="start"
                type={elementInfo.points[0]}
                color={elementInfo.color}
                baseSize={elementInfo.width}
              />
            ) : null}
            {elementInfo.points[1] ? (
              <LinePointMarker
                id={elementInfo.id}
                position="end"
                type={elementInfo.points[1]}
                color={elementInfo.color}
                baseSize={elementInfo.width}
              />
            ) : null}
          </defs>
          <path
            className={cx('line-point')}
            d={path}
            stroke={elementInfo.color}
            strokeWidth={elementInfo.width}
            strokeDasharray={lineDashArray}
            fill="none"
          />
          <path
            className={cx('line-marker')}
            d={hitPath}
            stroke="transparent"
            strokeWidth={elementInfo.width}
            fill="none"
            markerStart={elementInfo.points[0] ? `url(#${elementInfo.id}-${elementInfo.points[0]}-start)` : ''}
            markerEnd={elementInfo.points[1] ? `url(#${elementInfo.id}-${elementInfo.points[1]}-end)` : ''}
          />
          <path
            className={cx('line-path')}
            d={hitPath}
            stroke="transparent"
            strokeWidth="20"
            fill="none"
            onContextMenu={event => {
              event.stopPropagation()
              event.preventDefault()
              openContextmenu(event, contextmenus)
            }}
          />
        </svg>
      </div>
    </div>
  )
})

export default LineElement
