import { bindStyles } from '@/utils/cssm'
const cx = bindStyles({})
import { memo } from 'react'

import type { PPTTextElement } from '@/types/slides'
import type { OperateResizeHandlers } from '@/types/edit'
import useCommonOperate from '../hooks/useCommonOperate'
import RotateHandler from './RotateHandler'
import ResizeHandler from './ResizeHandler'
import BorderLine from './BorderLine'
import { typedOperateMemoEqual } from './operateMemo'
import { useLatest } from './useLatest'

export type ITextElementOperateProps = {
  elementInfo: PPTTextElement
  handlerVisible: boolean
  rotateElement: (e: MouseEvent, element: PPTTextElement) => void
  scaleElement: (e: MouseEvent, element: PPTTextElement, command: OperateResizeHandlers) => void
}

const TextElementOperate = memo((props: ITextElementOperateProps) => {
  const propsRef = useLatest(props)
  const { elementInfo, handlerVisible } = props
  const {
    resizeHandlers: normalResizeHandlers,
    textElementResizeHandlers,
    verticalTextElementResizeHandlers,
    borderLines,
  } = useCommonOperate()
  const resizeHandlers = props.elementInfo.fixedHeight
    ? normalResizeHandlers
    : props.elementInfo.vertical ? verticalTextElementResizeHandlers : textElementResizeHandlers

  return (
    <div className={cx('text-element-operate')}>
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
          <RotateHandler
            className={cx('operate-rotate-handler')}
            onMouseDown={e => {
              const { rotateElement, elementInfo: el } = propsRef.current
              rotateElement(e.nativeEvent, el)
            }}
          />
        </>
      ) : null}
    </div>
  )
}, typedOperateMemoEqual)

TextElementOperate.displayName = 'TextElementOperate'

export default TextElementOperate
