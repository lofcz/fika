import { bindStyles } from '@/utils/cssm'
const cx = bindStyles({})
import { memo } from 'react'

import type { PPTVideoElement, PPTLatexElement, PPTAudioElement, PPTChartElement } from '@/types/slides'
import type { OperateResizeHandlers } from '@/types/edit'
import useCommonOperate from '../hooks/useCommonOperate'
import RotateHandler from './RotateHandler'
import ResizeHandler from './ResizeHandler'
import BorderLine from './BorderLine'
import { typedOperateMemoEqual } from './operateMemo'
import { useLatest } from './useLatest'

type PPTElement = PPTVideoElement | PPTLatexElement | PPTAudioElement | PPTChartElement

export type ICommonElementOperateProps = {
  elementInfo: PPTElement
  handlerVisible: boolean
  rotateElement: (e: MouseEvent, element: PPTElement) => void
  scaleElement: (e: MouseEvent, element: PPTElement, command: OperateResizeHandlers) => void
}

const CommonElementOperate = memo((props: ICommonElementOperateProps) => {
  const propsRef = useLatest(props)
  const { elementInfo, handlerVisible } = props
  const { resizeHandlers, borderLines } = useCommonOperate()
  const cannotRotate = ['chart', 'video', 'audio'].includes(props.elementInfo.type)

  return (
    <div className={cx('common-element-operate')}>
      {borderLines.map(line => (
        <BorderLine className={cx('operate-border-line')} key={line.type} type={line.type} />
      ))}
      {handlerVisible ? (
        <>
          {resizeHandlers.map(point => (
            <ResizeHandler
              className={cx('operate-resize-handler')}
              key={point.direction}
              type={point.direction}
              rotate={elementInfo.rotate}
              onMouseDown={e => {
                const { scaleElement, elementInfo: el } = propsRef.current
                scaleElement(e.nativeEvent, el, point.direction)
              }}
            />
          ))}
          {!cannotRotate ? (
            <RotateHandler
              className={cx('operate-rotate-handler')}
              onMouseDown={e => {
                const { rotateElement, elementInfo: el } = propsRef.current
                rotateElement(e.nativeEvent, el)
              }}
            />
          ) : null}
        </>
      ) : null}
    </div>
  )
}, typedOperateMemoEqual)

CommonElementOperate.displayName = 'CommonElementOperate'

export default CommonElementOperate
