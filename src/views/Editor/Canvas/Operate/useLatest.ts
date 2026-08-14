import { useRef, type MutableRefObject } from 'react'

export function useLatest<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value)
  ref.current = value
  return ref
}
