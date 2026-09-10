import { memo, type MouseEvent } from 'react'

import { SLIDE_SKELETON_BLOCKS } from '@/configs/slideSkeleton'
import { bindStyles } from '@/utils/cssm'
import styles from './index.module.scss'

const cx = bindStyles(styles)

export type ISlideSkeletonProps = {
  className?: string
  /** Swallow pointer gestures so the placeholder cannot be drawn on (live canvas). */
  shield?: boolean
}

const pct = (value: number) => `${value * 100}%`

const swallow = (e: MouseEvent) => {
  e.stopPropagation()
  e.preventDefault()
}

/**
 * Shimmering placeholder painted over a `Slide.skeleton` slide. Absolutely
 * fills its positioned parent; block geometry is shared with the canvas
 * painter so a thumbnail and a `renderSlide` capture agree.
 */
const SlideSkeleton = memo(({ className, shield = false }: ISlideSkeletonProps) => (
  <div
    className={cx('slide-skeleton', { shield }, className)}
    data-slide-skeleton=""
    aria-hidden="true"
    onMouseDown={shield ? swallow : undefined}
    onDoubleClick={shield ? swallow : undefined}
    onContextMenu={shield ? swallow : undefined}
  >
    {SLIDE_SKELETON_BLOCKS.map((block, index) => (
      <span
        key={index}
        className={cx('block')}
        style={{ left: pct(block.x), top: pct(block.y), width: pct(block.w), height: pct(block.h) }}
      />
    ))}
  </div>
))

SlideSkeleton.displayName = 'SlideSkeleton'

export default SlideSkeleton
