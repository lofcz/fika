import { bindStyles } from '@/utils/cssm'
const cx = bindStyles({})
import { memo } from 'react'

import type { PPTTableElement } from '@/types/slides'
import type { OperateResizeHandlers } from '@/types/edit'
import useCommonOperate from '../hooks/useCommonOperate'
import RotateHandler from './RotateHandler'
import ResizeHandler from './ResizeHandler'
import BorderLine from './BorderLine'
import { typedOperateMemoEqual } from './operateMemo'
import { useLatest } from './useLatest'

export type ITableElementOperateProps = {
  elementInfo: PPTTableElement
  handlerVisible: boolean
  rotateElement: (e: MouseEvent, element: PPTTableElement) => void
  scaleElement: (e: MouseEvent, element: PPTTableElement, command: OperateResizeHandlers) => void
}

const TableElementOperate = memo((props: ITableElementOperateProps) => {
  const propsRef = useLatest(props)
  const { elementInfo, handlerVisible } = props
  const { resizeHandlers, borderLines } = useCommonOperate()

  return (
    <div className={cx('table-element-operate')}>
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

TableElementOperate.displayName = 'TableElementOperate'

export default TableElementOperate
