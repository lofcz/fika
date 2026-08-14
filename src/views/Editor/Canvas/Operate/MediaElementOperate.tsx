import { bindStyles } from '@/utils/cssm'
import styles from './MediaElementOperate.module.scss'
const cx = bindStyles(styles)
import { memo } from 'react'

import { useMainStore } from '@/store'
import type { PPTAudioElement, PPTVideoElement } from '@/types/slides'
import type { OperateResizeHandlers } from '@/types/edit'
import { mediaPlayerHostId } from '@/utils/mediaLayout'
import useCommonOperate from '../hooks/useCommonOperate'
import ResizeHandler from './ResizeHandler'
import BorderLine from './BorderLine'
import { typedOperateMemoEqual } from './operateMemo'
import { useLatest } from './useLatest'

type MediaElement = PPTVideoElement | PPTAudioElement

export type IMediaElementOperateProps = {
  elementInfo: MediaElement
  handlerVisible: boolean
  rotateElement: (e: MouseEvent, element: MediaElement) => void
  scaleElement: (e: MouseEvent, element: MediaElement, command: OperateResizeHandlers) => void
}

const MediaElementOperate = memo((props: IMediaElementOperateProps) => {
  const propsRef = useLatest(props)
  const { elementInfo, handlerVisible } = props
  const canvasScale = useMainStore(s => s.canvasScale)
  const hostId = mediaPlayerHostId(props.elementInfo.id)
  const scaleWidth = props.elementInfo.width * canvasScale
  const scaleHeight = props.elementInfo.height * canvasScale
  const { resizeHandlers, borderLines } = useCommonOperate(scaleWidth, scaleHeight)

  return (
    <div className={cx('media-element-operate')}>
      <div className={cx('media-player-host')} id={hostId} />
      {borderLines.map(line => (
        <BorderLine
          className={cx('operate-border-line')}
          style={{ ...line.style, display: handlerVisible ? '' : 'none' }}
          key={line.type}
          type={line.type}
        />
      ))}
      {handlerVisible ? resizeHandlers.map(point => (
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
      )) : null}
    </div>
  )
}, typedOperateMemoEqual)

MediaElementOperate.displayName = 'MediaElementOperate'

export default MediaElementOperate
