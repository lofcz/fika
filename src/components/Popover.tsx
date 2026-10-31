import { bindStyles } from '@/utils/cssm'
import styles from './Popover.module.scss'
const cx = bindStyles(styles)
import { type CSSProperties, type ReactNode, useRef, memo, useState, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'

import tippy, { type Instance, type Placement } from 'tippy.js'
import { isAppOwnedEvent, resolveFikaPortalTarget } from '@/utils/portal'
import { markOverlayOpenChildren, markOverlaySurface, useReportOverlayTrigger } from '@/components/OverlayTrigger'
import 'tippy.js/animations/scale.css'
import './popover-tippy.scss'

// Opening a nested picker must not let one Escape dismiss its parent too.
const openPopovers: Instance[] = []
const forgetPopover = (instance: Instance) => {
  const index = openPopovers.indexOf(instance)
  if (index !== -1) openPopovers.splice(index, 1)
}

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

  const mountContent = (inst: Instance) => {
    const box = inst.popper.querySelector('.tippy-content')
    if (!box) return
    if (contentVisibleRef.current && portalBoxRef.current === box) return
    setPortalBox(box)
    setContentVisible(true)
  }

  useLayoutEffect(() => {
    const triggerEl = triggerRef.current
    if (!triggerEl) return

    const ownerDocument = triggerEl.ownerDocument
    const onEscapeRelease = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      ownerDocument.removeEventListener('keyup', onEscapeRelease, true)
    }
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented || event.repeat) return
      if (openPopovers.at(-1) !== inst || !isAppOwnedEvent(event)) return
      event.preventDefault()
      event.stopPropagation()
      // Keep the release from also closing a containing dialog, even though
      // the picker is already hidden by the time the key is released.
      ownerDocument.addEventListener('keyup', onEscapeRelease, true)
      inst.hide()
      triggerEl.querySelector<HTMLElement>('button, [tabindex], input')?.focus()
    }

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
        forgetPopover(next)
        openPopovers.push(next)
        ownerDocument.addEventListener('keydown', onEscape, true)
        setTriggerOpen(true)
        // The controlled state must follow visibility immediately. Waiting for
        // the entry animation loses close requests from fast menu selections.
        if (!valueRef.current) onUpdateValueRef.current?.(true)
        const already = contentVisibleRef.current && portalBoxRef.current
        if (!already) {
          next.popper.style.visibility = 'hidden'
          mountContent(next)
        }
      },
      onHide() {
        forgetPopover(inst)
        ownerDocument.removeEventListener('keydown', onEscape, true)
        if (!instanceRef.current) return
        setTriggerOpen(false)
        if (valueRef.current) onUpdateValueRef.current?.(false)
      },
      onShown() {
        onShowRef.current?.()
      },
      onHidden() {
        // A parent-driven close must not dismiss a different popover that
        // the parent opened while this one's exit animation was running.
        if (valueRef.current) onHideRef.current?.()
      },
    })
    instanceRef.current = inst
    if (valueRef.current) {
      queueMicrotask(() => {
        if (instanceRef.current === inst && valueRef.current) inst.show()
      })
    }
    return () => {
      forgetPopover(inst)
      ownerDocument.removeEventListener('keydown', onEscape, true)
      ownerDocument.removeEventListener('keyup', onEscapeRelease, true)
      instanceRef.current = undefined
      inst.destroy()
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
    mountContent(inst)
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
