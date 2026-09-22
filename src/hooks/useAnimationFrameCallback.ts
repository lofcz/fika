import { useEffect, useRef } from 'react'

/** Coalesce transient pointer input, with an explicit flush at the transaction boundary. */
export function useAnimationFrameCallback<T>(callback: (value: T) => void) {
  const latest = useRef(callback); latest.current = callback
  const state = useRef<{ frame: number; value?: T }>({ frame: 0 })
  const api = useRef<{
    schedule: (value: T) => void; flush: () => void; cancel: () => void
  } | null>(null)
  if (!api.current) {
    const cancel = () => { cancelAnimationFrame(state.current.frame); state.current.frame = 0; state.current.value = undefined }
    const flush = () => { const value = state.current.value; cancel(); if (value !== undefined) latest.current(value) }
    api.current = { cancel, flush, schedule: value => { state.current.value = value; if (!state.current.frame) state.current.frame = requestAnimationFrame(flush) } }
  }
  useEffect(() => () => api.current!.cancel(), [])
  return api.current
}
