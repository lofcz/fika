import { bindStyles } from '@/utils/cssm'
import styles from './LineElementOperate.module.scss'
const cx = bindStyles(styles)
import { memo } from 'react'

import { useMainStore } from '@/store'
import type { PPTLineElement } from '@/types/slides'
import { OperateLineHandlers } from '@/types/edit'
import ResizeHandler from './ResizeHandler'
import { typedOperateMemoEqual } from './operateMemo'
import { useLatest } from './useLatest'

export type ILineElementOperateProps = {
  elementInfo: PPTLineElement
  handlerVisible: boolean
  dragLineElement: (e: MouseEvent, element: PPTLineElement, command: OperateLineHandlers) => void
}

const LineElementOperate = memo((props: ILineElementOperateProps) => {
  const propsRef = useLatest(props)
  const { elementInfo, handlerVisible } = props
  const canvasScale = useMainStore(s => s.canvasScale)
  const svgWidth = Math.max(props.elementInfo.start[0], props.elementInfo.end[0])
  const svgHeight = Math.max(props.elementInfo.start[1], props.elementInfo.end[1])

  const resizeHandlers = (() => {
    const handlers = [
      {
        handler: OperateLineHandlers.START,
        style: {
          left: props.elementInfo.start[0] * canvasScale + 'px',
          top: props.elementInfo.start[1] * canvasScale + 'px',
        },
      },
      {
        handler: OperateLineHandlers.END,
        style: {
          left: props.elementInfo.end[0] * canvasScale + 'px',
          top: props.elementInfo.end[1] * canvasScale + 'px',
        },
      },
    ]
    if (props.elementInfo.curve || props.elementInfo.broken || props.elementInfo.broken2) {
      const ctrlHandler = (props.elementInfo.curve || props.elementInfo.broken || props.elementInfo.broken2) as [number, number]
      handlers.push({
        handler: OperateLineHandlers.C,
        style: {
          left: ctrlHandler[0] * canvasScale + 'px',
          top: ctrlHandler[1] * canvasScale + 'px',
        },
      })
    }
    else if (props.elementInfo.cubic) {
      const [ctrlHandler1, ctrlHandler2] = props.elementInfo.cubic
      handlers.push({
        handler: OperateLineHandlers.C1,
        style: {
          left: ctrlHandler1[0] * canvasScale + 'px',
          top: ctrlHandler1[1] * canvasScale + 'px',
        },
      })
      handlers.push({
        handler: OperateLineHandlers.C2,
        style: {
          left: ctrlHandler2[0] * canvasScale + 'px',
          top: ctrlHandler2[1] * canvasScale + 'px',
        },
      })
    }
    return handlers
  })()

  return (
    <div className={cx('line-element-operate')}>
      {handlerVisible ? (
        <>
          {resizeHandlers.map(point => (
            <ResizeHandler
              className={cx('operate-resize-handler')}
              key={point.handler}
              style={point.style}
              onMouseDown={e => {
                const { dragLineElement, elementInfo: el } = propsRef.current
                dragLineElement(e.nativeEvent, el, point.handler)
              }}
            />
          ))}
          <svg width={svgWidth || 1} height={svgHeight || 1} stroke={elementInfo.color} overflow="visible" style={{ transform: `scale(${canvasScale})` }}>
            {elementInfo.curve ? (
              <g>
                <line className={cx('anchor-line')} x1={elementInfo.start[0]} y1={elementInfo.start[1]} x2={elementInfo.curve[0]} y2={elementInfo.curve[1]} />
                <line className={cx('anchor-line')} x1={elementInfo.end[0]} y1={elementInfo.end[1]} x2={elementInfo.curve[0]} y2={elementInfo.curve[1]} />
              </g>
            ) : null}
            {elementInfo.cubic ? elementInfo.cubic.map((item, index) => (
              <g key={index}>
                {index === 0 ? <line className={cx('anchor-line')} x1={elementInfo.start[0]} y1={elementInfo.start[1]} x2={item[0]} y2={item[1]} /> : null}
                {index === 1 ? <line className={cx('anchor-line')} x1={elementInfo.end[0]} y1={elementInfo.end[1]} x2={item[0]} y2={item[1]} /> : null}
              </g>
            )) : null}
          </svg>
        </>
      ) : null}
    </div>
  )
}, typedOperateMemoEqual)

LineElementOperate.displayName = 'LineElementOperate'

export default LineElementOperate
