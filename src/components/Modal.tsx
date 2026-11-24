import { bindStyles } from '@/utils/cssm'
import { createPortal } from 'react-dom'
import { Icon } from '@/components/Icon'
import styles from './Modal.module.scss'
const cx = bindStyles(styles)
import { type CSSProperties, type ReactNode, useRef, useCallback, memo, useState, useEffect, useLayoutEffect } from 'react'

import { getFikaPortalTarget, resolveFikaPortalTarget } from '@/utils/portal'
import { useHoldAfterOpen } from '@/hooks/useHoldAfterOpen'
import { useOverlayPhase } from '@/hooks/useOverlayPhase'
import { markOverlaySurface, useReportOverlayTrigger } from '@/components/OverlayTrigger'
import { useI18nContext } from '@/i18n/useI18nContext'

export type IModalProps = {
  visible: boolean
  width?: number
  closeButton?: boolean
  closeOnClickMask?: boolean
  closeOnEsc?: boolean
  ariaLabel?: string
  ariaLabelledBy?: string
  contentStyle?: CSSProperties
  wrapStyle?: CSSProperties
  className?: string
  onUpdateVisible?: (payload: boolean) => void
  onClosed?: () => void
  children?: ReactNode
}

const Modal = memo((vrProps: IModalProps) => {
  const { LL } = useI18nContext()
  const visible = vrProps.visible
  const width = vrProps.width ?? 480
  const closeButton = vrProps.closeButton ?? false
  const closeOnClickMask = vrProps.closeOnClickMask ?? true
  const closeOnEsc = vrProps.closeOnEsc ?? true
  const wrapStyle = vrProps.wrapStyle || {}

  const modalRef = useRef<HTMLDivElement | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const portalLockedRef = useRef(false)
  const [portalTarget, setPortalTarget] = useState<HTMLElement>(() => getFikaPortalTarget())
  const { phase, onAnimationEnd, shown, entering, leaving } = useOverlayPhase(visible)
  const held = useHoldAfterOpen(shown)
  useReportOverlayTrigger(phase === 'enter' || phase === 'open')
  const composingEscapeRef = useRef(false)
  const visibleRef = useRef(visible)
  visibleRef.current = visible

  const onUpdateVisibleRef = useRef(vrProps.onUpdateVisible)
  const onClosedRef = useRef(vrProps.onClosed)
  onUpdateVisibleRef.current = vrProps.onUpdateVisible
  onClosedRef.current = vrProps.onClosed

  const contentStyle: CSSProperties = {
    width: width + 'px',
    ...(vrProps.contentStyle || {}),
  }

  const animClass = phase === 'enter'
    ? 'modal-zoom-enter-active'
    : phase === 'leave'
      ? 'modal-zoom-leave-active'
      : ''
  const maskAnimClass = phase === 'enter'
    ? 'modal-mask-enter-active'
    : phase === 'leave'
      ? 'modal-mask-leave-active'
      : ''

  useLayoutEffect(() => {
    if (portalLockedRef.current) return
    const next = resolveFikaPortalTarget(modalRef.current)
    portalLockedRef.current = true
    setPortalTarget(prev => (prev === next ? prev : next))
  }, [])

  useEffect(() => {
    if (visible) {
      const active = document.activeElement
      previousFocusRef.current = active instanceof HTMLElement ? active : null
      Promise.resolve().then(() => modalRef.current?.focus())
      return
    }
    const prev = previousFocusRef.current
    previousFocusRef.current = null
    if (prev && prev.isConnected) {
      Promise.resolve().then(() => {
        if (prev.isConnected && !modalRef.current?.contains(prev)) prev.focus({ preventScroll: true })
      })
    }
  }, [visible])

  const close = useCallback(() => {
    onUpdateVisibleRef.current?.(false)
    onClosedRef.current?.()
  }, [])

  const onEsc = useCallback((event: React.KeyboardEvent) => {
    if (event.key !== 'Escape') return
    const composing = event.nativeEvent.isComposing || composingEscapeRef.current
    composingEscapeRef.current = false
    if (composing) return
    if (visibleRef.current && closeOnEsc) {
      event.stopPropagation()
      close()
    }
  }, [closeOnEsc, close])

  const onClickMask = useCallback(() => {
    if (entering) return
    if (closeOnClickMask) close()
  }, [entering, closeOnClickMask, close])

  return createPortal(
    <div
      className={cx('modal', { leaving }, vrProps.className)}
      ref={modalRef}
      style={{
        ...wrapStyle,
        ...(shown ? {} : { display: 'none' }),
      }}
      tabIndex={-1}
      onKeyDownCapture={event => {
        if (event.key === 'Escape' && !event.repeat) composingEscapeRef.current = event.nativeEvent.isComposing
      }}
      onKeyUp={onEsc}
    >
      <div className={cx('mask', maskAnimClass)} onClick={onClickMask} />
      <div
        className={cx('modal-content', animClass)}
        role="dialog"
        aria-modal="true"
        aria-label={vrProps.ariaLabel}
        aria-labelledby={vrProps.ariaLabelledBy}
        style={contentStyle}
        onAnimationEnd={onAnimationEnd}
      >
        {closeButton ? (
          <button
            type="button"
            className={cx('close-btn')}
            aria-label={LL.common.close()}
            onClick={close}
          >
            <Icon icon="x" />
          </button>
        ) : null}
        {held ? vrProps.children : null}
      </div>
    </div>,
    portalTarget,
  )
})

export default markOverlaySurface(Modal)
