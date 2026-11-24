import { memo } from 'react'
import { bindStyles } from '@/utils/cssm'
import styles from './ImageMediaSlot.module.scss'

const cx = bindStyles(styles)

export type ImageMediaSlotKind = 'pending' | 'loading' | 'error'

export interface ImageMediaSlotProps {
  status: ImageMediaSlotKind
  label: string
  slotId?: string
  /** Hide the shimmer sweep (used for neutral static empty placeholders). */
  staticSurface?: boolean
}

const ImageMediaSlot = memo(({ status, label, slotId, staticSurface = false }: ImageMediaSlotProps) => {
  const isError = status === 'error'
  const showShimmer = !isError && !staticSurface

  return (
    <div
      className={cx('slot', { error: isError })}
      role={isError ? 'img' : 'status'}
      aria-busy={isError ? undefined : true}
      aria-live={isError ? undefined : 'polite'}
      aria-label={label}
      data-fika-image-slot-status={status}
      data-fika-image-slot-id={slotId || undefined}
    >
      {showShimmer ? <div className={cx('shimmer')} aria-hidden="true" /> : null}
      <div className={cx('emblem')} aria-hidden="true">
        {isError ? (
          <svg
            className={cx('icon')}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="2" y1="2" x2="22" y2="22" />
            <path d="M10.41 10.41a2 2 0 1 1-2.83-2.83" />
            <line x1="13.5" y1="13.5" x2="6" y2="21" />
            <line x1="18" y1="12" x2="21" y2="15" />
            <path d="M3.59 3.59A1.99 1.99 0 0 0 3 5v14a2 2 0 0 0 2 2h14c.55 0 1.052-.22 1.41-.59" />
            <path d="M21 15V5a2 2 0 0 0-2-2H9" />
          </svg>
        ) : (
          <svg
            className={cx('icon')}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
          </svg>
        )}
      </div>
      {label ? <span className={cx('caption')}>{label}</span> : null}
    </div>
  )
})

ImageMediaSlot.displayName = 'ImageMediaSlot'

export default ImageMediaSlot
