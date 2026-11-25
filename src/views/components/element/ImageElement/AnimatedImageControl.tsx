import { memo, type CSSProperties, type MouseEvent, type PointerEvent, type TouchEvent } from 'react'
import { bindStyles } from '@/utils/cssm'
import { useI18nContext } from '@/i18n/useI18nContext'
import styles from './AnimatedImageControl.module.scss'

const cx = bindStyles(styles)

export type IAnimatedImageControlProps = {
  elementId: string
  paused: boolean
  visible?: boolean
  compact?: boolean
  className?: string
  style?: CSSProperties
  onToggle: () => void
  onPointerEnter?: () => void
  onPointerLeave?: () => void
}

const stopPointer = (e: MouseEvent | PointerEvent | TouchEvent) => {
  e.stopPropagation()
  if ('nativeEvent' in e && e.nativeEvent) {
    e.nativeEvent.stopPropagation()
  }
}

const AnimatedImageControl = memo((props: IAnimatedImageControlProps) => {
  const {
    elementId,
    paused,
    visible = false,
    compact = false,
    className,
    style,
    onToggle,
    onPointerEnter,
    onPointerLeave,
  } = props
  const { LL } = useI18nContext()
  const label = paused ? LL.editor.mediaSlot.playAnimation() : LL.editor.mediaSlot.pauseAnimation()

  return (
    <button
      type="button"
      className={['animated-image-control', cx('control', { visible, paused, compact }), className].filter(Boolean).join(' ')}
      style={style}
      title={label}
      aria-label={label}
      aria-pressed={paused}
      data-fika-animated-control={elementId}
      data-fika-animated-paused={paused ? 'true' : 'false'}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerDown={stopPointer}
      onMouseDown={stopPointer}
      onTouchStart={stopPointer}
      onDoubleClick={stopPointer}
      onClick={e => {
        stopPointer(e)
        onToggle()
      }}
    >
      {paused ? (
        <svg className={cx('icon')} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M4.5 3.1a.7.7 0 0 1 1.06-.6l7.5 4.9a.7.7 0 0 1 0 1.2l-7.5 4.9a.7.7 0 0 1-1.06-.6V3.1z" />
        </svg>
      ) : (
        <svg className={cx('icon')} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <rect x="3.5" y="3" width="3.2" height="10" rx="1" />
          <rect x="9.3" y="3" width="3.2" height="10" rx="1" />
        </svg>
      )}
    </button>
  )
})

AnimatedImageControl.displayName = 'AnimatedImageControl'

export default AnimatedImageControl
