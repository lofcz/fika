import { bindStyles } from '@/utils/cssm'
import styles from './Popover.module.scss'
const cx = bindStyles(styles)
import { type CSSProperties, type ReactNode, useRef, memo, useState, useEffect, useLayoutEffect } from 'react'
import { createPortal, flushSync } from 'react-dom'

import tippy, { type Instance, type Placement } from 'tippy.js'
import { resolveFikaPortalTarget } from '@/utils/portal'
import { markOverlayOpenChildren, markOverlaySurface, useReportOverlayTrigger } from '@/components/OverlayTrigger'
import 'tippy.js/animations/scale.css'
import './popover-tippy.scss'

export type IPopoverProps = {
  value?: boolean
  trigger?: 'click' | 'mouseenter' | 'manual'
  placement?: Placement
  appendTo?: HTMLElement | 'parent'
  contentStyle?: CSSProperties
  center?: boolean
  offset?: number
  /** Align to the trigger's parent instead of the trigger itself (e.g. a chevron inside a grouped button). */
  anchorParent?: boolean
  onUpdateValue?: (payload: boolean) => void
  onShow?: () => void
  onHide?: () => void
  content?: ReactNode
  children?: ReactNode
  className?: string
  style?: CSSProperties
}

const Popover = memo((vrProps: IPopoverProps) => {
  const value = vrProps.value ?? false
  const trigger = vrProps.trigger ?? 'click'
  const placement = vrProps.placement ?? 'bottom'
  const appendTo = vrProps.appendTo
  const center = vrProps.center ?? false
  const offset = vrProps.offset ?? 8
  const anchorParent = vrProps.anchorParent ?? false
  const contentStyle = vrProps.contentStyle || {}

  const [contentVisible, setContentVisible] = useState(false)
  const [triggerOpen, setTriggerOpen] = useState(false)
  const [portalBox, setPortalBox] = useState<Element | null>(null)
  const triggerRef = useRef<HTMLDivElement | null>(null)
  const instanceRef = useRef<Instance | undefined>(undefined)
  const contentVisibleRef = useRef(false)
  const portalBoxRef = useRef<Element | null>(null)
  contentVisibleRef.current = contentVisible
  portalBoxRef.current = portalBox

  const valueRef = useRef(value)
  valueRef.current = value
  const onUpdateValueRef = useRef(vrProps.onUpdateValue)
  onUpdateValueRef.current = vrProps.onUpdateValue
  const onShowRef = useRef(vrProps.onShow)
  onShowRef.current = vrProps.onShow
  const onHideRef = useRef(vrProps.onHide)
  onHideRef.current = vrProps.onHide

  const mountContent = (inst: Instance, sync: boolean) => {
    const box = inst.popper.querySelector('.tippy-content')
    if (!box) return
    if (contentVisibleRef.current && portalBoxRef.current === box) return
    const apply = () => {
      setPortalBox(box)
      setContentVisible(true)
    }
    if (sync) flushSync(apply)
    else apply()
  }

  useLayoutEffect(() => {
    const triggerEl = triggerRef.current
    if (!triggerEl) return

    const inst = tippy(triggerEl, {
      content: '',
      allowHTML: true,
      trigger,
      placement,
      interactive: true,
      hideOnClick: trigger !== 'manual',
      appendTo: appendTo || (() => resolveFikaPortalTarget(triggerRef.current)),
      maxWidth: 'none',
      offset: [0, offset],
      duration: 200,
      animation: 'scale',
      theme: 'popover',
      arrow: false,
      zIndex: 10050,
      getReferenceClientRect: anchorParent
        ? () => {
            const el = triggerRef.current?.parentElement ?? triggerRef.current
            return el!.getBoundingClientRect()
          }
        : undefined,
      onShow(next) {
        flushSync(() => setTriggerOpen(true))
        const already = contentVisibleRef.current && portalBoxRef.current
        if (!already) {
          next.popper.style.visibility = 'hidden'
          mountContent(next, true)
          next.popperInstance?.update()
          next.popper.style.visibility = ''
        }
      },
      onHide() {
        flushSync(() => setTriggerOpen(false))
      },
      onShown() {
        if (!valueRef.current) {
          onUpdateValueRef.current?.(true)
          onShowRef.current?.()
        }
      },
      onHidden() {
        if (valueRef.current) {
          onUpdateValueRef.current?.(false)
          onHideRef.current?.()
        }
      },
    })
    instanceRef.current = inst
    if (valueRef.current) inst.show()
    return () => {
      inst.destroy()
      instanceRef.current = undefined
      setContentVisible(false)
      setTriggerOpen(false)
      setPortalBox(null)
    }
  }, [trigger, placement, appendTo, offset, anchorParent])

  useLayoutEffect(() => {
    if (!contentVisible) return
    const inst = instanceRef.current
    if (!inst) return
    inst.popperInstance?.update()
    inst.popper.style.visibility = ''
  }, [contentVisible])

  useEffect(() => {
    const inst = instanceRef.current
    if (!inst) return
    if (value) inst.show()
    else inst.hide()
  }, [value])

  useReportOverlayTrigger(triggerOpen)

  const prefetch = () => {
    const inst = instanceRef.current
    if (!inst) return
    mountContent(inst, false)
  }

  return (
    <div
      className={cx('popover', { center, open: triggerOpen }, vrProps.className)}
      style={vrProps.style}
      ref={triggerRef}
      onPointerEnter={prefetch}
    >
      {contentVisible && portalBox
        ? createPortal(
          <div className={cx('popover-content')} style={contentStyle}>
            {vrProps.content}
          </div>,
          portalBox,
        )
        : null}
      {markOverlayOpenChildren(vrProps.children, triggerOpen)}
    </div>
  )
})

export default markOverlaySurface(Popover)
