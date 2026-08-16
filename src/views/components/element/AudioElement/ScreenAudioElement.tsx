import { bindStyles } from '@/utils/cssm'
import styles from './ScreenAudioElement.module.scss'
const cx = bindStyles(styles)
import { memo, useContext } from 'react'

import { useSlidesStore, selectCurrentSlide } from '@/store'
import type { PPTAudioElement } from '@/types/slides'
import { SlideCaptureContext, SlideScaleContext, SlideIdContext } from '@/types/injectKey'
import { isCompactAudioBox } from '@/utils/mediaLayout'
import useMediaPoster from '@/hooks/useMediaPoster'
import MediaPlayer from '@/views/components/element/MediaPlayer/index'

export type IScreenAudioElementProps = {
  elementInfo: PPTAudioElement
}

const ScreenAudioElement = memo((props: IScreenAudioElementProps) => {
  const { elementInfo } = props
  const currentSlide = useSlidesStore(selectCurrentSlide)
  const scale = useContext(SlideScaleContext) ?? 1
  const slideId = useContext(SlideIdContext) ?? ''
  const inCurrentSlide = currentSlide?.id === slideId
  const capture = useContext(SlideCaptureContext)
  const renderPlayer = inCurrentSlide || capture
  const isCompact = isCompactAudioBox(props.elementInfo.width, props.elementInfo.height)
  const { synthesizing } = useMediaPoster(() => props.elementInfo, () => slideId || undefined)

  return (
    <div
      className={cx('base-element-audio', 'screen-element-audio')}
      style={{
        top: elementInfo.top + 'px',
        left: elementInfo.left + 'px',
        width: elementInfo.width + 'px',
        height: elementInfo.height + 'px',
      }}
    >
      <div className={cx('rotate-wrapper')} style={{ transform: `rotate(${elementInfo.rotate}deg)` }}>
        <div className={cx('element-content')}>
          {renderPlayer ? (
            <MediaPlayer
              kind="audio"
              width={elementInfo.width}
              height={elementInfo.height}
              src={elementInfo.src}
              poster={elementInfo.poster}
              loop={elementInfo.loop}
              autoplay={capture ? false : elementInfo.autoplay}
              color={elementInfo.color}
              compact={isCompact}
              docked={isCompact}
              scale={scale}
              synthesizing={synthesizing}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
})

export default ScreenAudioElement
