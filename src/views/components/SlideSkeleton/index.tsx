import { memo, type MouseEvent } from 'react'

import { SLIDE_SKELETON_BLOCKS } from '@/configs/slideSkeleton'
import { Icon } from '@/components/Icon'
import { bindStyles } from '@/utils/cssm'
import styles from './index.module.scss'

const cx = bindStyles(styles)

export type ISlideSkeletonProps = {
  className?: string
  /** Swallow pointer gestures so the placeholder cannot be drawn on (live canvas). */
  shield?: boolean
  /** Optional host AI insertion request id to expose an accessible cancel control. */
  requestId?: string
  generatingLabel?: string
  cancelLabel?: string
  onCancel?: () => void
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
const SlideSkeleton = memo(({
  className,
  shield = false,
  requestId,
  generatingLabel,
  cancelLabel,
  onCancel,
}: ISlideSkeletonProps) => (
  <div
    className={cx('slide-skeleton', { shield }, className)}
    data-slide-skeleton=""
    aria-hidden={shield && requestId && onCancel ? undefined : 'true'}
    onMouseDown={shield ? swallow : undefined}
    onDoubleClick={shield ? swallow : undefined}
    onContextMenu={shield ? swallow : undefined}
  >
    {SLIDE_SKELETON_BLOCKS.map((block, index) => (
      <span
        key={index}
        className={cx('block')}
        aria-hidden="true"
        style={{ left: pct(block.x), top: pct(block.y), width: pct(block.w), height: pct(block.h) }}
      />
    ))}
    {shield && requestId && onCancel ? (
      <div
        className={cx('ai-status-bar')}
        role="status"
        aria-live="polite"
        onMouseDown={e => e.stopPropagation()}
        onPointerDown={e => e.stopPropagation()}
      >
        <Icon icon="sparkles" className={cx('ai-icon')} />
        <span className={cx('ai-label')}>{generatingLabel}</span>
        <button
          type="button"
          className={cx('ai-cancel-btn')}
          data-fika-ai-insert-cancel={requestId}
          aria-label={cancelLabel}
          onClick={e => {
            e.stopPropagation()
            onCancel()
          }}
        >
          <Icon icon="x" className={cx('cancel-icon')} />
          <span>{cancelLabel}</span>
        </button>
      </div>
    ) : null}
  </div>
))

SlideSkeleton.displayName = 'SlideSkeleton'

export default SlideSkeleton
