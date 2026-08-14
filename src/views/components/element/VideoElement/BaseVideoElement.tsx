import { bindStyles } from '@/utils/cssm'
import styles from './BaseVideoElement.module.scss'
const cx = bindStyles(styles)
import { memo } from 'react'
import type { PPTVideoElement } from '@/types/slides'
import MediaPosterSurface from '@/views/components/element/MediaPosterSurface'

export type IBaseVideoElementProps = {
  elementInfo: PPTVideoElement
  slideId?: string
}

const BaseVideoElement = memo((props: IBaseVideoElementProps) => {
  const { elementInfo } = props

  return (
    <div
      className={cx('base-element-video')}
      style={{
        top: elementInfo.top + 'px',
        left: elementInfo.left + 'px',
        width: elementInfo.width + 'px',
        height: elementInfo.height + 'px',
      }}
    >
      <div className={cx('rotate-wrapper')} style={{ transform: `rotate(${elementInfo.rotate}deg)` }}>
        <div className={cx('element-content')}>
          <MediaPosterSurface kind="video" poster={elementInfo.poster} />
        </div>
      </div>
    </div>
  )
})

export default BaseVideoElement
