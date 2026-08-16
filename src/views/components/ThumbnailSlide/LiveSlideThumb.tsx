import { bindStyles } from '@/utils/cssm'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { memo, useEffect, useState } from 'react'

import { useSlidesStore } from '@/store'
import type { Slide } from '@/types/slides'
import ScreenSlide from '@/views/Screen/ScreenSlide'
import { SlideCaptureContext, SlideScaleContext } from '@/types/injectKey'
import { arePaintedSlideIdentitiesEqual, type PaintedSlide } from './paintedSlide'
import { subscribePaneLive, isPaneDragging } from '@/views/Editor/Thumbnails/paneSize'

export type ILiveSlideThumbProps = {
  slide: Slide
  width: number
}

const noop = () => {}

/**
 * Defer the heavy tree by one idle slot: rows that scroll past quickly never
 * mount a ScreenSlide at all (they unmount before idle fires), and settled
 * rows appear within the timeout. Long decks stay smooth without freezing
 * content into bitmaps — the mounted tree is always the real one.
 */
const useIdleMount = () => {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const done = () => setReady(true)
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(done, { timeout: 150 })
      return () => cancelIdleCallback(id)
    }
    const timer = setTimeout(done, 120)
    return () => clearTimeout(timer)
  }, [])
  return ready
}

/**
 * A thumbnail that IS the slide: the genuine ScreenSlide tree, scaled to the
 * thumbnail box. ScreenSlide applies the scale itself (its .viewport
 * transform) exactly like the presenter does — no wrapper transform, no
 * rasterization, no painter stack. Nothing can drift from the editor canvas:
 * fonts, text wrap, contrast, images and vector art are the browser's own
 * rendering of the same tree the presenter shows. Edits appear live (React
 * diffs the mounted tree).
 *
 * During a gutter drag only this light wrapper tracks the live width; the
 * mounted ScreenSlide keeps its drag-start scale and is visually scaled by a
 * composited transform — the heavy tree never re-renders mid-drag.
 */
const LiveSlideThumb = memo((props: ILiveSlideThumbProps) => {
  const { slide, width } = props
  const viewportSize = useSlidesStore(s => s.viewportSize)
  const viewportRatio = useSlidesStore(s => s.viewportRatio)
  const [frozen, setFrozen] = useState<{ width: number } | null>(null)
  const ready = useIdleMount()

  useEffect(() => subscribePaneLive(() => {
    setFrozen(isPaneDragging() ? (prev => prev ?? { width }) : () => null)
  }), [])

  const contentWidth = frozen ? frozen.width : width
  const scale = contentWidth / Math.max(1, viewportSize)
  const visualScale = frozen ? width / Math.max(1, contentWidth) : 1
  return (
    <div
      className={cx('live-slide-thumb')}
      style={{ width, height: width * viewportRatio }}
      aria-hidden="true"
    >
      {ready ? (
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
                // No entrance animations in thumbnails: every element visible.
                animationIndex={Number.MAX_SAFE_INTEGER}
                turnSlideToId={noop}
                manualExitFullscreen={noop}
                paintElements={true}
              />
            </SlideScaleContext.Provider>
          </SlideCaptureContext.Provider>
        </div>
      ) : null}
    </div>
  )
}, (prev, next) => (
  prev.width === next.width
  && arePaintedSlideIdentitiesEqual(prev.slide as PaintedSlide, next.slide as PaintedSlide)
))

LiveSlideThumb.displayName = 'LiveSlideThumb'

export default LiveSlideThumb
