import { bindStyles } from '@/utils/cssm'
import styles from './ImageElementOperate.module.scss'
const cx = bindStyles(styles)
import { memo } from 'react'

import { useMainStore } from '@/store'
import type { PPTImageElement } from '@/types/slides'
import type { OperateResizeHandlers } from '@/types/edit'
import useCommonOperate from '../hooks/useCommonOperate'
import RotateHandler from './RotateHandler'
import ResizeHandler from './ResizeHandler'
import BorderLine from './BorderLine'
import { typedOperateMemoEqual } from './operateMemo'
import { useLatest } from './useLatest'

export type IImageElementOperateProps = {
  elementInfo: PPTImageElement
  handlerVisible: boolean
  rotateElement: (e: MouseEvent, element: PPTImageElement) => void
  scaleElement: (e: MouseEvent, element: PPTImageElement, command: OperateResizeHandlers) => void
}

const ImageElementOperate = memo((props: IImageElementOperateProps) => {
  const propsRef = useLatest(props)
  const { elementInfo, handlerVisible } = props
  const clipingImageElementId = useMainStore(s => s.clipingImageElementId)
  const isCliping = clipingImageElementId === elementInfo.id
  const { resizeHandlers, borderLines } = useCommonOperate()

  return (
    <div className={cx('image-element-operate', { cliping: isCliping })}>
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

ImageElementOperate.displayName = 'ImageElementOperate'

export default ImageElementOperate
