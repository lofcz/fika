import { bindStyles } from '@/utils/cssm'
import styles from './MobileOperate.module.scss'
const cx = bindStyles(styles)
import type { PPTElement, PPTLineElement, PPTChartElement, PPTVideoElement, PPTAudioElement } from '@/types/slides'
import useCommonOperate from '@/views/Editor/Canvas/hooks/useCommonOperate'
import type { OperateResizeHandlers } from '@/types/edit'
import { mediaPlayerHostId } from '@/utils/mediaLayout'
import BorderLine from '@/views/Editor/Canvas/Operate/BorderLine'
import ResizeHandler from '@/views/Editor/Canvas/Operate/ResizeHandler'
import RotateHandler from '@/views/Editor/Canvas/Operate/RotateHandler'

type CanRotatePPTElement = Exclude<PPTElement, PPTChartElement | PPTLineElement | PPTVideoElement | PPTAudioElement>

export type IMobileOperateProps = {
  elementInfo: Exclude<PPTElement, PPTLineElement>
  isSelected: boolean
  canvasScale: number
  scaleElement: (e: TouchEvent, element: Exclude<PPTElement, PPTLineElement>, command: OperateResizeHandlers) => void
  rotateElement: (e: TouchEvent, element: CanRotatePPTElement) => void
}

export default function MobileOperate({
  elementInfo,
  isSelected,
  canvasScale,
  scaleElement,
  rotateElement,
}: IMobileOperateProps) {
  const rotate = 'rotate' in elementInfo ? elementInfo.rotate : 0
  const scaleWidth = elementInfo.width * canvasScale
  const scaleHeight = elementInfo.height * canvasScale
  const {
    borderLines,
    resizeHandlers: _resizeHandlers,
    textElementResizeHandlers,
    verticalTextElementResizeHandlers,
  } = useCommonOperate(scaleWidth, scaleHeight)

  const resizeHandlers = (() => {
    if (elementInfo.type === 'text') {
      if (elementInfo.fixedHeight) return _resizeHandlers
      return elementInfo.vertical ? verticalTextElementResizeHandlers : textElementResizeHandlers
    }
    if (elementInfo.type === 'table') return textElementResizeHandlers
    return _resizeHandlers
  })()

  const cannotRotate = ['chart', 'video', 'audio'].includes(elementInfo.type)
  const isMedia = elementInfo.type === 'video' || elementInfo.type === 'audio'
  const mediaHostId = mediaPlayerHostId(elementInfo.id)

  return (
    <div
      className={cx('mobile-operate')}
      style={{
        top: elementInfo.top * canvasScale + 'px',
        left: elementInfo.left * canvasScale + 'px',
        width: elementInfo.width * canvasScale + 'px',
        height: ('height' in elementInfo ? elementInfo.height : 0) * canvasScale + 'px',
        transform: `rotate(${rotate}deg)`,
        transformOrigin: `${elementInfo.width * canvasScale / 2}px ${elementInfo.height * canvasScale / 2}px`,
      }}
    >
      {isMedia ? <div className={cx('media-player-host')} id={mediaHostId} /> : null}
      {isSelected ? (
        <>
          {borderLines.map(line => (
            <BorderLine className={cx('operate-border-line')} key={line.type} type={line.type} style={line.style} />
          ))}
          {resizeHandlers.map(point => (
            <div
              key={point.direction}
              onTouchStart={event => {
                event.stopPropagation()
                scaleElement(event.nativeEvent, elementInfo, point.direction)
              }}
            >
              <ResizeHandler
                className={cx('operate-resize-handler')}
                type={point.direction}
                rotate={'rotate' in elementInfo ? elementInfo.rotate : 0}
                style={point.style}
              />
            </div>
          ))}
          {!cannotRotate ? (
            <div
              onTouchStart={event => {
                event.stopPropagation()
                rotateElement(event.nativeEvent, elementInfo as CanRotatePPTElement)
              }}
            >
              <RotateHandler
                className={cx('operate-rotate-handler')}
                style={{ left: scaleWidth / 2 + 'px' }}
              />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
