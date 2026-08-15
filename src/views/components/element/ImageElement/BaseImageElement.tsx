import { bindStyles } from '@/utils/cssm'
import styles from './BaseImageElement.module.scss'
const cx = bindStyles(styles)
import { memo } from 'react'

import type { PPTImageElement } from '@/types/slides'
import useElementShadow from '@/views/components/element/hooks/useElementShadow'
import useElementFlip from '@/views/components/element/hooks/useElementFlip'
import useClipImage from './useClipImage'
import useFilter from './useFilter'
import ImageOutline from './ImageOutline/index'
import ImageBitmapSurface from './ImageBitmapSurface'
import { useSyncImageBitmapCache } from './useImageBitmap'

export type IBaseImageElementProps = {
  elementInfo: PPTImageElement
}

const BaseImageElement = memo((props: IBaseImageElementProps) => {
  const { elementInfo } = props
  const { shadowStyle } = useElementShadow(props.elementInfo.shadow)
  const { flipStyle } = useElementFlip(props.elementInfo.flipH, props.elementInfo.flipV)
  const { clipShape, imgPosition } = useClipImage(props.elementInfo)
  const { filter } = useFilter(props.elementInfo.filters)
  useSyncImageBitmapCache()

  return (
    <div
      className={cx('base-element-image')}
      style={{
        top: elementInfo.top + 'px',
        left: elementInfo.left + 'px',
        width: elementInfo.width + 'px',
        height: elementInfo.height + 'px',
      }}
    >
      <div className={cx('rotate-wrapper')} style={{ transform: `rotate(${elementInfo.rotate}deg)` }}>
        <div
          className={cx('element-content')}
          data-live-box
          style={{
            filter: shadowStyle ? `drop-shadow(${shadowStyle})` : '',
            transform: flipStyle,
          }}
        >
          <ImageOutline elementInfo={elementInfo} />
          <div className={cx('image-content')} style={{ clipPath: clipShape.style }}>
            <ImageBitmapSurface
              key={elementInfo.src}
              src={elementInfo.src}
              draggable={false}
              style={{
                top: imgPosition.top,
                left: imgPosition.left,
                width: imgPosition.width,
                height: imgPosition.height,
                filter,
              }}
            />
            {elementInfo.colorMask ? (
              <div className={cx('color-mask')} style={{ backgroundColor: elementInfo.colorMask }} />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
})

export default BaseImageElement
