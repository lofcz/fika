import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './Message.module.scss'
const cx = bindStyles(styles)
import { forwardRef, useImperativeHandle, useRef, useCallback, memo, useState, useEffect } from 'react'

export type IMessageProps = {
  id: string
  message: string
  type?: string
  title?: string
  duration?: number
  closable?: boolean
  className?: string
  onClose?: () => void
  onDestroy?: () => void
}

const Message = memo(forwardRef<{ close: () => void }, IMessageProps>((vrProps, expose) => {
  const type = vrProps.type ?? 'success'
  const title = vrProps.title ?? ''
  const duration = vrProps.duration ?? 3000
  const closable = vrProps.closable ?? false

  const [visible, setVisible] = useState(true)
  const [mounted, setMounted] = useState(true)
  const [animClass, setAnimClass] = useState('sonner-enter-active')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onCloseRef = useRef(vrProps.onClose)
  onCloseRef.current = vrProps.onClose
  const onDestroyRef = useRef(vrProps.onDestroy)
  onDestroyRef.current = vrProps.onDestroy
  const durationRef = useRef(duration)
  durationRef.current = duration

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const close = useCallback(() => {
    setVisible(false)
  }, [])

  const startTimer = useCallback(() => {
    if (durationRef.current <= 0) return
    clearTimer()
    timerRef.current = setTimeout(close, durationRef.current)
  }, [clearTimer, close])

  useEffect(() => {
    startTimer()
    return () => clearTimer()
  }, [startTimer, clearTimer])

  useEffect(() => {
    if (visible) return
    onCloseRef.current?.()
    setAnimClass('sonner-leave-active')
  }, [visible])

  const onAnimationEnd = useCallback((event: React.AnimationEvent) => {
    if (event.target !== event.currentTarget) return
    if (visible) {
      setAnimClass('')
      return
    }
    setMounted(false)
    onDestroyRef.current?.()
  }, [visible])

  useImperativeHandle(expose, () => ({ close }))

  if (!mounted) return null

  return (
    <div
      className={cx('sonner', animClass, vrProps.className)}
      id={vrProps.id}
      role="status"
      aria-live="polite"
      onAnimationEnd={onAnimationEnd}
    >
      <div
        className={cx('sonner-card', { sticky: closable || duration <= 0 })}
        onMouseEnter={() => { clearTimer() }}
        onMouseLeave={() => { startTimer() }}
      >
        <span className={cx('mark', type)} aria-hidden>
          {type === 'success' ? <Icon icon="check" />
            : type === 'error' ? <Icon icon="x" />
              : type === 'warning' ? <Icon icon="triangle-alert" />
                : type === 'loading' ? <Icon icon="loader-circle" className={cx('spin')} />
                  : <Icon icon="info" />}
        </span>
        <div className={cx('body')}>
          {title ? <div className={cx('title')}>{title}</div> : null}
          <div className={cx('description')}>{vrProps.message}</div>
        </div>
        <button
          className={cx('dismiss')}
          type="button"
          aria-label="Close"
          onClick={(event) => { event.stopPropagation(); close() }}
        >
          <Icon icon="x" />
        </button>
      </div>
    </div>
  )
}))

export default Message
