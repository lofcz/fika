import { bindStyles } from '@/utils/cssm'
import styles from './ScreenVideoElement.module.scss'
const cx = bindStyles(styles)
import { memo, useContext } from 'react'

import { useSlidesStore, selectCurrentSlide } from '@/store'
import type { PPTVideoElement } from '@/types/slides'
import { SlideScaleContext, SlideIdContext } from '@/types/injectKey'
import useMediaPoster from '@/hooks/useMediaPoster'
import MediaPlayer from '@/views/components/element/MediaPlayer/index'

export type IScreenVideoElementProps = {
  elementInfo: PPTVideoElement
}

const ScreenVideoElement = memo((props: IScreenVideoElementProps) => {
  const { elementInfo } = props
  const currentSlide = useSlidesStore(selectCurrentSlide)
  const scale = useContext(SlideScaleContext) ?? 1
  const slideId = useContext(SlideIdContext) ?? ''
  const inCurrentSlide = currentSlide?.id === slideId
  const { persistPoster } = useMediaPoster(() => props.elementInfo, () => slideId || undefined)

  return (
    <div
      className={cx('base-element-video', 'screen-element-video')}
      style={{
        top: elementInfo.top + 'px',
        left: elementInfo.left + 'px',
        width: elementInfo.width + 'px',
        height: elementInfo.height + 'px',
      }}
    >
      <div className={cx('rotate-wrapper')} style={{ transform: `rotate(${elementInfo.rotate}deg)` }}>
        <div className={cx('element-content')}>
          {inCurrentSlide ? (
            <MediaPlayer
              kind="video"
              width={elementInfo.width}
              height={elementInfo.height}
              src={elementInfo.src}
              poster={elementInfo.poster}
              autoplay={elementInfo.autoplay}
              scale={scale}
              onPoster={persistPoster}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
})

export default ScreenVideoElement
