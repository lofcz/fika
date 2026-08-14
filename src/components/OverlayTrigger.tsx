import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useLayoutEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'

export const OVERLAY_OPEN_ATTR = 'data-overlay-open'

type OverlaySurfaceType = { isOverlaySurface?: boolean }

export function markOverlaySurface<T>(component: T): T {
  Object.assign(component as object, { isOverlaySurface: true })
  return component
}

function isOverlaySurfaceElement(node: ReactElement): boolean {
  const type = node.type
  if (typeof type === 'string') return false
  return !!(type as OverlaySurfaceType).isOverlaySurface
}

export function markOverlayOpen(node: ReactNode, open: boolean): ReactNode {
  if (!isValidElement(node) || isOverlaySurfaceElement(node)) return node
  return cloneElement(node as ReactElement<{ [OVERLAY_OPEN_ATTR]?: string }>, {
    [OVERLAY_OPEN_ATTR]: open ? '' : undefined,
  })
}

export function markOverlayOpenChildren(children: ReactNode, open: boolean): ReactNode {
  return Children.map(children, child => markOverlayOpen(child, open))
}

const OverlayTriggerContext = createContext<(open: boolean) => void>(() => {})

/** Report enter/open immediately; clear on leave so the trigger unfills as the overlay starts closing. */
export function useReportOverlayTrigger(open: boolean) {
  const report = useContext(OverlayTriggerContext)
  useLayoutEffect(() => {
    report(open)
    return () => { report(false) }
  }, [open, report])
}

/**
 * Declarative pairing of a trigger host with a portaled overlay (Modal / Drawer / nested Popover).
 * The nearest non-surface child receives `data-overlay-open` while any descendant overlay is entering or open.
 */
export function OverlayTrigger({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const report = useCallback((next: boolean) => {
    setOpen(next)
  }, [])

  return (
    <OverlayTriggerContext.Provider value={report}>
      {markOverlayOpenChildren(children, open)}
    </OverlayTriggerContext.Provider>
  )
}
