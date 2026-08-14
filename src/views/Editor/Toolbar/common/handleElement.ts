import { useCallback, useRef, useSyncExternalStore } from 'react'
import { useMainStore, useSlidesStore, selectCurrentSlide, selectHandleElement } from '@/store'
import type { PPTElement } from '@/types/slides'

let toolbarStoreVersion = 0

function subscribeToolbarStores(onChange: () => void) {
  const notify = () => {
    toolbarStoreVersion += 1
    onChange()
  }
  const unsubMain = useMainStore.subscribe(notify)
  const unsubSlides = useSlidesStore.subscribe(notify)
  return () => {
    unsubMain()
    unsubSlides()
  }
}

export function getHandleElement() {
  return selectHandleElement(useMainStore.getState())
}

export function findHandleElement(handleElementId = useMainStore.getState().handleElementId) {
  const slide = selectCurrentSlide(useSlidesStore.getState())
  return slide?.elements.find(el => el.id === handleElementId) || null
}

export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (const key of aKeys) {
    if (!Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) return false
  }
  return true
}

/**
 * Subscribe to main + slides, but only rerender when `selector()` changes
 * under `equalityFn`. Read content / table cell text only if the UI shows it.
 */
export function useToolbarStoreSelect<T>(
  selector: () => T,
  equalityFn: (a: T, b: T) => boolean = Object.is,
): T {
  const selectorRef = useRef(selector)
  selectorRef.current = selector
  const equalityRef = useRef(equalityFn)
  equalityRef.current = equalityFn
  const cacheRef = useRef<{ value: T; has: boolean; version: number }>({
    value: undefined as T,
    has: false,
    version: -1,
  })

  const getSnapshot = useCallback(() => {
    if (cacheRef.current.has && cacheRef.current.version === toolbarStoreVersion) {
      return cacheRef.current.value
    }
    const next = selectorRef.current()
    if (cacheRef.current.has && equalityRef.current(cacheRef.current.value, next)) {
      cacheRef.current.version = toolbarStoreVersion
      return cacheRef.current.value
    }
    cacheRef.current = { value: next, has: true, version: toolbarStoreVersion }
    return next
  }, [])

  return useSyncExternalStore(subscribeToolbarStores, getSnapshot, getSnapshot)
}

/**
 * Select fields from the handle element by id.
 * Content / table cell text only notify when the selector reads those strings.
 */
export function useHandleElementSelect<T>(
  selector: (el: PPTElement | null) => T,
  equalityFn: (a: T, b: T) => boolean = Object.is,
): T {
  return useToolbarStoreSelect(() => selector(getHandleElement()), equalityFn)
}

export function useHandleElementShallow<T extends object | null | undefined>(
  selector: (el: PPTElement | null) => T,
): T {
  return useHandleElementSelect(selector, shallowEqual)
}

export function useHandleElementId() {
  return useMainStore(s => s.handleElementId)
}

export function useHandleElementType() {
  return useHandleElementSelect(el => el?.type ?? null)
}

export function useHasHandleElement() {
  return useHandleElementSelect(el => !!el)
}

export function useHasActiveGroupElement() {
  return useToolbarStoreSelect(() => {
    const { activeGroupElementId } = useMainStore.getState()
    if (!activeGroupElementId) return false
    const slide = selectCurrentSlide(useSlidesStore.getState())
    return !!slide?.elements.some(el => el.id === activeGroupElementId)
  })
}
