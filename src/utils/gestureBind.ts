import { DragGesture } from '@use-gesture/vanilla'

export type GestureDragState = {
  xy: [number, number]
  delta: [number, number]
  movement: [number, number]
  first: boolean
  last: boolean
  event: PointerEvent | MouseEvent | TouchEvent | KeyboardEvent
}

export type GestureDragHandlers = {
  onDrag?: (state: GestureDragState) => void
  onDragStart?: (state: GestureDragState) => void
  onDragEnd?: (state: GestureDragState) => void
}

export type RafCoalesced<T extends (event: MouseEvent | TouchEvent) => void> = T & {
  cancel: () => void
}

const toDragState = (state: GestureDragState): GestureDragState => ({
  xy: state.xy,
  delta: state.delta,
  movement: state.movement,
  first: state.first,
  last: state.last,
  event: state.event,
})

const pointerSeed = () => {
  const ev = typeof window !== 'undefined' ? window.event : undefined
  if (ev instanceof PointerEvent) {
    return { clientX: ev.clientX, clientY: ev.clientY, pointerId: ev.pointerId, pointerType: ev.pointerType }
  }
  if (ev instanceof MouseEvent) {
    return { clientX: ev.clientX, clientY: ev.clientY, pointerId: 1, pointerType: 'mouse' }
  }
  if (ev && 'changedTouches' in ev) {
    const touch = (ev as TouchEvent).changedTouches[0]
    if (touch) {
      return { clientX: touch.clientX, clientY: touch.clientY, pointerId: touch.identifier, pointerType: 'touch' }
    }
  }
  return { clientX: 0, clientY: 0, pointerId: 1, pointerType: 'mouse' }
}

export const bindDocumentDrag = (handlers: GestureDragHandlers) => {
  const host = new EventTarget()
  let ignoreSeed = true
  const gesture = new DragGesture(
    host,
    state => {
      if (ignoreSeed) {
        ignoreSeed = false
        return
      }
      const next = toDragState(state)
      if (state.first) handlers.onDragStart?.(next)
      handlers.onDrag?.(next)
      if (state.last) handlers.onDragEnd?.(next)
    },
    {
      window: document.defaultView ?? window,
      pointer: { capture: false, buttons: 1, keys: false },
      filterTaps: false,
      preventScroll: false,
      from: () => [0, 0],
    },
  )
  const seed = pointerSeed()
  host.dispatchEvent(
    new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      buttons: 1,
      clientX: seed.clientX,
      clientY: seed.clientY,
      pointerId: seed.pointerId,
      pointerType: seed.pointerType,
      isPrimary: true,
    }),
  )
  return () => gesture.destroy()
}

export const rafCoalesce = <T extends (event: MouseEvent | TouchEvent) => void>(fn: T): RafCoalesced<T> => {
  let frame = 0
  let latest: MouseEvent | TouchEvent | null = null
  const wrapped = ((event: MouseEvent | TouchEvent) => {
    latest = event
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      if (latest) fn(latest)
    })
  }) as RafCoalesced<T>
  wrapped.cancel = () => {
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    latest = null
  }
  return wrapped
}
