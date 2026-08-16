import { bindStyles } from '@/utils/cssm'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { memo, useEffect, useState } from 'react'

import { useSlidesStore } from '@/store'
import type { Slide } from '@/types/slides'
import ScreenSlide from '@/views/Screen/ScreenSlide'
import { SlideCaptureContext, SlideScaleContext } from '@/types/injectKey'
import { arePaintedSlideIdentitiesEqual, type PaintedSlide } from './paintedSlide'
import { subscribePaneLive, isPaneDragging, getPreviewDestSize } from '@/views/Editor/Thumbnails/paneSize'
import { lookupThumbSnapshot } from './thumbSnapshot'

export type ILiveSlideThumbProps = {
  slide: Slide
  width: number
  /** Opt into the identity-keyed snapshot cache (editor rail only). */
  snapshot?: boolean
}

const noop = () => {}

/**
 * A thumbnail that IS the slide: the genuine ScreenSlide tree, scaled to the
 * thumbnail box. With `snapshot` enabled, a row that already has a fresh
 * bitmap renders only the <img>. A row without one mounts the live tree —
 * the virtualizer screenshots that tree with snapdom before tearing the row
 * down, so the next visit is the bitmap. Nothing is captured ahead of the
 * viewport; only a row that was actually shown is snapshotted on leave.
 *
 * During a gutter drag only this light wrapper tracks the live width; the
 * mounted ScreenSlide keeps its drag-start scale and is visually scaled by a
 * composited transform — the heavy tree never re-renders mid-drag.
 */
const LiveSlideThumb = memo((props: ILiveSlideThumbProps) => {
  const { slide, width, snapshot: snapshotsEnabled } = props
  const viewportSize = useSlidesStore(s => s.viewportSize)
  const viewportRatio = useSlidesStore(s => s.viewportRatio)
  const theme = useSlidesStore(s => s.theme)
  const [frozen, setFrozen] = useState<{ width: number } | null>(null)

  const snapshot = snapshotsEnabled
    ? lookupThumbSnapshot({
      slideId: slide.id,
      slide,
      theme,
      viewportRatio,
      viewportSize,
      cssWidth: width,
      dpr: getPreviewDestSize().dpr,
    })
    : null

  useEffect(() => subscribePaneLive(() => {
    setFrozen(isPaneDragging() ? (prev => prev ?? { width }) : () => null)
  }), [])

  const contentWidth = frozen ? frozen.width : width
  const scale = contentWidth / Math.max(1, viewportSize)
  const visualScale = frozen ? width / Math.max(1, contentWidth) : 1
  return (
    <div
      className={cx('live-slide-thumb')}
      data-live-slide-thumb=""
      style={{ width, height: width * viewportRatio }}
      aria-hidden="true"
    >
      {snapshot ? (
        <img className={cx('thumb-snapshot')} src={snapshot.url} alt="" draggable={false} />
      ) : (
        <div style={visualScale === 1 ? undefined : {
          width: contentWidth,
          height: contentWidth * viewportRatio,
          transform: `scale(${visualScale})`,
          transformOrigin: 'top left',
        }}>
          <SlideCaptureContext.Provider value={true}>
            <SlideScaleContext.Provider value={scale}>
              <ScreenSlide
                slide={slide}
                scale={scale}
                animationIndex={Number.MAX_SAFE_INTEGER}
                turnSlideToId={noop}
                manualExitFullscreen={noop}
                paintElements={true}
              />
            </SlideScaleContext.Provider>
          </SlideCaptureContext.Provider>
        </div>
      )}
    </div>
  )
}, (prev, next) => (
  prev.width === next.width
  && prev.snapshot === next.snapshot
  && arePaintedSlideIdentitiesEqual(prev.slide as PaintedSlide, next.slide as PaintedSlide)
))

LiveSlideThumb.displayName = 'LiveSlideThumb'

export default LiveSlideThumb
