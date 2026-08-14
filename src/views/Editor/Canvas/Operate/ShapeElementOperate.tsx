import { bindStyles } from '@/utils/cssm'
import styles from './ShapeElementOperate.module.scss'
const cx = bindStyles(styles)
import { memo } from 'react'

import { useMainStore } from '@/store'
import type { PPTShapeElement } from '@/types/slides'
import type { OperateResizeHandlers } from '@/types/edit'
import { SHAPE_PATH_FORMULAS } from '@/configs/shapes'
import useCommonOperate from '../hooks/useCommonOperate'
import RotateHandler from './RotateHandler'
import ResizeHandler from './ResizeHandler'
import BorderLine from './BorderLine'
import { stopHandleEvent } from './stopHandleEvent'
import { typedOperateMemoEqual } from './operateMemo'
import { useLatest } from './useLatest'

export type IShapeElementOperateProps = {
  elementInfo: PPTShapeElement
  handlerVisible: boolean
  rotateElement: (e: MouseEvent, element: PPTShapeElement) => void
  scaleElement: (e: MouseEvent, element: PPTShapeElement, command: OperateResizeHandlers) => void
  moveShapeKeypoint: (e: MouseEvent, element: PPTShapeElement, index: number) => void
}

const ShapeElementOperate = memo((props: IShapeElementOperateProps) => {
  const propsRef = useLatest(props)
  const { elementInfo, handlerVisible } = props
  const canvasScale = useMainStore(s => s.canvasScale)
  const scaleWidth = props.elementInfo.width * canvasScale
  const scaleHeight = props.elementInfo.height * canvasScale
  const { resizeHandlers, borderLines } = useCommonOperate(scaleWidth, scaleHeight)

  const keypoints = (() => {
    if (!props.elementInfo.pathFormula || props.elementInfo.keypoints === undefined) return []
    const pathFormula = SHAPE_PATH_FORMULAS[props.elementInfo.pathFormula]
    return props.elementInfo.keypoints.map((keypoint, index) => {
      const getBaseSize = pathFormula.getBaseSize![index]
      const relative = pathFormula.relative![index]
      const keypointPos = getBaseSize(props.elementInfo.width, props.elementInfo.height) * keypoint
      let keypointStyles: Record<string, string> = {}
      if (relative === 'left') keypointStyles = { left: keypointPos * canvasScale + 'px' }
      else if (relative === 'right') keypointStyles = { left: (props.elementInfo.width - keypointPos) * canvasScale + 'px' }
      else if (relative === 'center') keypointStyles = { left: (props.elementInfo.width - keypointPos) / 2 * canvasScale + 'px' }
      else if (relative === 'top') keypointStyles = { top: keypointPos * canvasScale + 'px' }
      else if (relative === 'bottom') keypointStyles = { top: (props.elementInfo.height - keypointPos) * canvasScale + 'px' }
      else if (relative === 'left_bottom') keypointStyles = { left: keypointPos * canvasScale + 'px', top: props.elementInfo.height * canvasScale + 'px' }
      else if (relative === 'right_bottom') keypointStyles = { left: (props.elementInfo.width - keypointPos) * canvasScale + 'px', top: props.elementInfo.height * canvasScale + 'px' }
      else if (relative === 'top_right') keypointStyles = { left: props.elementInfo.width * canvasScale + 'px', top: keypointPos * canvasScale + 'px' }
      else if (relative === 'bottom_right') keypointStyles = { left: props.elementInfo.width * canvasScale + 'px', top: (props.elementInfo.height - keypointPos) * canvasScale + 'px' }
      return { keypoint, styles: keypointStyles }
    })
  })()

  return (
    <div className={cx('shape-element-operate')}>
      {borderLines.map(line => (
        <BorderLine className={cx('operate-border-line')} key={line.type} type={line.type} style={line.style} />
      ))}
      {handlerVisible ? (
        <>
          {resizeHandlers.map(point => (
            <ResizeHandler
              className={cx('operate-resize-handler')}
              key={point.direction}
              type={point.direction}
              rotate={elementInfo.rotate}
              style={point.style}
              onMouseDown={e => {
                const { scaleElement, elementInfo: el } = propsRef.current
                scaleElement(e.nativeEvent, el, point.direction)
              }}
            />
          ))}
          <RotateHandler
            className={cx('operate-rotate-handler')}
            style={{ left: scaleWidth / 2 + 'px' }}
            onMouseDown={e => {
              const { rotateElement, elementInfo: el } = propsRef.current
              rotateElement(e.nativeEvent, el)
            }}
          />
          {keypoints.map((keypoint, index) => (
            <div
              className={cx('operate-keypoint-handler')}
              key={index}
              style={keypoint.styles}
              onMouseDown={e => {
                stopHandleEvent(e)
                const { moveShapeKeypoint, elementInfo: el } = propsRef.current
                moveShapeKeypoint(e.nativeEvent, el, index)
              }}
            />
          ))}
        </>
      ) : null}
    </div>
  )
}, typedOperateMemoEqual)

ShapeElementOperate.displayName = 'ShapeElementOperate'

export default ShapeElementOperate
