import { bindStyles } from '@/utils/cssm'
import styles from './BaseAudioElement.module.scss'
const cx = bindStyles(styles)
import { memo } from 'react'

import type { PPTAudioElement } from '@/types/slides'
import { isCompactAudioBox } from '@/utils/mediaLayout'
import MediaPosterSurface from '@/views/components/element/MediaPosterSurface'

export type IBaseAudioElementProps = {
  elementInfo: PPTAudioElement
  slideId?: string
}

const BaseAudioElement = memo((props: IBaseAudioElementProps) => {
  const { elementInfo } = props
  const isCompact = isCompactAudioBox(props.elementInfo.width, props.elementInfo.height)

  return (
    <div
      className={cx('base-element-audio')}
      style={{
        top: elementInfo.top + 'px',
        left: elementInfo.left + 'px',
        width: elementInfo.width + 'px',
        height: elementInfo.height + 'px',
      }}
    >
      <div className={cx('rotate-wrapper')} style={{ transform: `rotate(${elementInfo.rotate}deg)` }}>
        <div className={cx('element-content')}>
          <MediaPosterSurface
            kind="audio"
            poster={elementInfo.poster}
            compact={isCompact}
            color={elementInfo.color}
          />
        </div>
      </div>
    </div>
  )
})

export default BaseAudioElement
