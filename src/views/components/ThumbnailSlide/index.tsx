import { bindStyles } from '@/utils/cssm'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { memo } from 'react'

import { useI18nContext } from '@/i18n/useI18nContext'
import { useSlidesStore } from '@/store'
import type { Slide } from '@/types/slides'
import { SlideScaleContext } from '@/types/injectKey'
import useSlideBackgroundStyle from '@/hooks/useSlideBackgroundStyle'
import ThumbnailElement from './ThumbnailElement'
import { arePaintedSlideIdentitiesEqual, usePaintedSlide } from './paintedSlide'

export type IThumbnailSlideProps = {
  slide: Slide
  size: number
  visible?: boolean
  showPlaceholders?: boolean
  className?: string
}

export function areThumbnailSlidePropsEqual(prev: IThumbnailSlideProps, next: IThumbnailSlideProps): boolean {
  return prev.size === next.size
    && (prev.visible ?? true) === (next.visible ?? true)
    && (prev.showPlaceholders ?? false) === (next.showPlaceholders ?? false)
    && prev.className === next.className
    && arePaintedSlideIdentitiesEqual(prev.slide, next.slide)
}

const ThumbnailSlide = memo((props: IThumbnailSlideProps) => {
  const { LL } = useI18nContext()
  const {
    slide: slideProp,
    size,
    visible = true,
    showPlaceholders = false,
    className,
  } = props
  const slide = usePaintedSlide(slideProp.id, slideProp)
  const viewportRatio = useSlidesStore(s => s.viewportRatio)
  const viewportSize = useSlidesStore(s => s.viewportSize)
  const themeBackgroundColor = useSlidesStore(s => s.theme.backgroundColor)
  const background = slide.background
  const { backgroundStyle } = useSlideBackgroundStyle(background)
  const scale = size / viewportSize

  return (
    <SlideScaleContext.Provider value={scale}>
      <div
        className={cx('thumbnail-slide', className)}
        style={{
          width: size + 'px',
          height: size * viewportRatio + 'px',
        }}
      >
        {visible ? (
          <div
            className={cx('elements')}
            style={{
              width: viewportSize + 'px',
              height: viewportSize * viewportRatio + 'px',
              transform: `scale(${scale})`,
            }}
          >
            <div className={cx('background')} style={backgroundStyle} />
            {slide.elements.map((element, index) => (
              <ThumbnailElement
                key={element.id}
                elementInfo={element}
                elementIndex={index + 1}
                slideId={slide.id}
                slideType={slide.type}
                showPlaceholders={showPlaceholders}
                background={slide.background}
                themeBackgroundColor={themeBackgroundColor}
              />
            ))}
          </div>
        ) : (
          <div className={cx('placeholder')}>{LL.common.loading()}</div>
        )}
      </div>
    </SlideScaleContext.Provider>
  )
}, areThumbnailSlidePropsEqual)

ThumbnailSlide.displayName = 'ThumbnailSlide'

export default ThumbnailSlide
