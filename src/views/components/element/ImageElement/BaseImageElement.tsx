import { bindStyles } from '@/utils/cssm'
import styles from './BaseImageElement.module.scss'
const cx = bindStyles(styles)
import { memo, useCallback, useContext, useState } from 'react'

import type { PPTImageElement } from '@/types/slides'
import { SlideIdContext, SlideScaleContext } from '@/types/injectKey'
import type { AnimatedImageFormat } from '@/utils/animatedImage'
import { toggleAnimatedImagePlayback, useAnimatedImagePaused } from '@/utils/animatedImagePlayback'
import useElementShadow from '@/views/components/element/hooks/useElementShadow'
import useElementFlip from '@/views/components/element/hooks/useElementFlip'
import useClipImage from './useClipImage'
import useFilter from './useFilter'
import ImageOutline from './ImageOutline/index'
import ImageBitmapSurface from './ImageBitmapSurface'
import AnimatedImageControl from './AnimatedImageControl'
import { useSyncImageBitmapCache } from './useImageBitmap'

export type IBaseImageElementProps = {
  elementInfo: PPTImageElement
  /** True only for the active slide in Screen/Presentation mode so off-screen slides stay idle. */
  isCurrentSlide?: boolean
}

const BaseImageElement = memo((props: IBaseImageElementProps) => {
  const { elementInfo, isCurrentSlide = false } = props
  const slideId = useContext(SlideIdContext) || ''
  const slideScale = useContext(SlideScaleContext) || 1
  const { shadowStyle } = useElementShadow(props.elementInfo.shadow)
  const { flipStyle } = useElementFlip(props.elementInfo.flipH, props.elementInfo.flipV)
  const { clipShape, imgPosition } = useClipImage(props.elementInfo)
  const { filter } = useFilter(props.elementInfo.filters)
  const [animatedFormat, setAnimatedFormat] = useState<AnimatedImageFormat | null>(null)
  const [hovered, setHovered] = useState(false)
  const paused = useAnimatedImagePaused(slideId, elementInfo.id)
  useSyncImageBitmapCache()

  const handleAnimatedChange = useCallback((format: AnimatedImageFormat | null) => {
    setAnimatedFormat(prev => (prev === format ? prev : format))
  }, [])

  const showControl = isCurrentSlide && !!animatedFormat
  const inverseScale = slideScale > 0 ? Math.min(2.5, Math.max(0.5, 1 / slideScale)) : 1
  const screenMinEdge = Math.min(elementInfo.width, elementInfo.height) * slideScale

  return (
    <div
      className={cx('base-element-image')}
      style={{
        top: elementInfo.top + 'px',
        left: elementInfo.left + 'px',
        width: elementInfo.width + 'px',
        height: elementInfo.height + 'px',
      }}
      onPointerEnter={showControl ? () => setHovered(true) : undefined}
      onPointerLeave={showControl ? () => setHovered(false) : undefined}
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
              key={`${elementInfo.src}:${elementInfo.mediaState?.status ?? ''}`}
              src={elementInfo.src}
              mediaState={elementInfo.mediaState}
              altText={elementInfo.altText}
              draggable={false}
              animate={isCurrentSlide}
              paused={paused}
              onAnimatedChange={handleAnimatedChange}
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
        {showControl ? (
          <AnimatedImageControl
            elementId={elementInfo.id}
            paused={paused}
            visible={hovered}
            compact={screenMinEdge < 96}
            style={{
              transformOrigin: 'bottom right',
              transform: `scale(${inverseScale})`,
            }}
            onToggle={() => toggleAnimatedImagePlayback(slideId, elementInfo.id)}
          />
        ) : null}
      </div>
    </div>
  )
})

export default BaseImageElement
