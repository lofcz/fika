import { bindStyles } from '@/utils/cssm'
import { createPortal } from 'react-dom'
import { Icon } from '@/components/Icon'
import styles from './Drawer.module.scss'
const cx = bindStyles(styles)
import { type CSSProperties, type ReactNode, useRef, useCallback, memo, useState, useLayoutEffect } from 'react'

import { getFikaPortalTarget, resolveFikaPortalTarget } from '@/utils/portal'
import { useHoldAfterOpen } from '@/hooks/useHoldAfterOpen'
import { useOverlayPhase } from '@/hooks/useOverlayPhase'
import { markOverlaySurface, useReportOverlayTrigger } from '@/components/OverlayTrigger'

export type IDrawerProps = {
  visible: boolean
  width?: number
  contentStyle?: CSSProperties
  placement?: 'left' | 'right'
  className?: string
  onUpdateVisible?: (payload: boolean) => void
  title?: ReactNode
  children?: ReactNode
}

const Drawer = memo((vrProps: IDrawerProps) => {
  const visible = vrProps.visible
  const width = vrProps.width ?? 320
  const placement = vrProps.placement ?? 'right'

  const drawerRootRef = useRef<HTMLDivElement | null>(null)
  const portalLockedRef = useRef(false)
  const [portalTarget, setPortalTarget] = useState<HTMLElement>(() => getFikaPortalTarget())
  const { phase, onAnimationEnd, shown } = useOverlayPhase(visible)
  const held = useHoldAfterOpen(shown)
  useReportOverlayTrigger(phase === 'enter' || phase === 'open')
  const onUpdateVisibleRef = useRef(vrProps.onUpdateVisible)
  onUpdateVisibleRef.current = vrProps.onUpdateVisible

  const contentStyle: CSSProperties = {
    width: width + 'px',
    ...(vrProps.contentStyle || {}),
  }

  const animClass = phase === 'enter'
    ? `drawer-slide-${placement}-enter-active`
    : phase === 'leave'
      ? `drawer-slide-${placement}-leave-active`
      : ''

  useLayoutEffect(() => {
    if (portalLockedRef.current) return
    const next = resolveFikaPortalTarget(drawerRootRef.current)
    portalLockedRef.current = true
    setPortalTarget(prev => (prev === next ? prev : next))
  }, [])

  const close = useCallback(() => {
    onUpdateVisibleRef.current?.(false)
  }, [])

  return createPortal(
    <div
      ref={drawerRootRef}
      className={cx('drawer', placement, animClass, vrProps.className)}
      style={{
        width: width + 'px',
        ...(shown ? {} : { display: 'none' }),
      }}
      onAnimationEnd={onAnimationEnd}
    >
      <div className={cx('header')}>
        {vrProps.title}
        <span className={cx('close-btn')} onClick={close}>
          <Icon icon="x" />
        </span>
      </div>
      {held ? <div className={cx('content')} style={contentStyle}>{vrProps.children}</div> : null}
    </div>,
    portalTarget,
  )
})

export default markOverlaySurface(Drawer)
