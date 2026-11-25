import { useSyncExternalStore } from 'react'
import type { AnimatedImageFormat } from './animatedImage'

export interface RegisteredAnimatedElement {
  slideId: string
  elementId: string
  format: AnimatedImageFormat
}

const registered = new Map<string, RegisteredAnimatedElement>()
const userPausedOverrides = new Map<string, boolean>()
const listeners = new Set<() => void>()
const slideListCache = new Map<string, readonly RegisteredAnimatedElement[]>()
const EMPTY_LIST: readonly RegisteredAnimatedElement[] = []

let visibilityBound = false
let docHidden = typeof document !== 'undefined' ? document.hidden : false

const keyOf = (slideId: string, elementId: string) => `${slideId}\0${elementId}`

const emit = () => {
  slideListCache.clear()
  for (const fn of listeners) fn()
}

const ensureVisibilityListener = () => {
  if (visibilityBound || typeof document === 'undefined') return
  visibilityBound = true
  docHidden = document.hidden
  document.addEventListener('visibilitychange', () => {
    const next = document.hidden
    if (next === docHidden) return
    docHidden = next
    emit()
  })
}

const subscribe = (fn: () => void) => {
  ensureVisibilityListener()
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

const prefersReducedMotion = () => (
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches
)

export const registerAnimatedImageElement = (
  slideId: string,
  elementId: string,
  format: AnimatedImageFormat,
): (() => void) => {
  if (!slideId || !elementId) return () => {}
  const key = keyOf(slideId, elementId)
  const prev = registered.get(key)
  if (!prev || prev.format !== format) {
    registered.set(key, { slideId, elementId, format })
    emit()
  }
  return () => {
    if (registered.delete(key)) emit()
  }
}

export const isAnimatedImagePaused = (slideId: string, elementId: string): boolean => {
  if (!slideId || !elementId) return false
  const override = userPausedOverrides.get(keyOf(slideId, elementId))
  if (override !== undefined) return override
  return prefersReducedMotion()
}

export const setAnimatedImagePaused = (slideId: string, elementId: string, paused: boolean): void => {
  if (!slideId || !elementId) return
  const key = keyOf(slideId, elementId)
  if (userPausedOverrides.get(key) === paused) return
  userPausedOverrides.set(key, paused)
  emit()
}

export const toggleAnimatedImagePlayback = (slideId: string, elementId: string): boolean => {
  const next = !isAnimatedImagePaused(slideId, elementId)
  setAnimatedImagePaused(slideId, elementId, next)
  return next
}

export const resetAnimatedImagePlaybackForSlide = (slideId: string): void => {
  if (!slideId) return
  const prefix = `${slideId}\0`
  let changed = false
  for (const key of [...userPausedOverrides.keys()]) {
    if (key.startsWith(prefix)) {
      userPausedOverrides.delete(key)
      changed = true
    }
  }
  if (changed) emit()
}

export const getAnimatedElementsForSlide = (slideId: string): readonly RegisteredAnimatedElement[] => {
  if (!slideId) return EMPTY_LIST
  const cached = slideListCache.get(slideId)
  if (cached) return cached
  const list: RegisteredAnimatedElement[] = []
  for (const entry of registered.values()) {
    if (entry.slideId === slideId) list.push(entry)
  }
  const result = list.length ? list : EMPTY_LIST
  slideListCache.set(slideId, result)
  return result
}

export const useAnimatedImagePaused = (slideId: string, elementId: string): boolean => (
  useSyncExternalStore(
    subscribe,
    () => isAnimatedImagePaused(slideId, elementId),
    () => false,
  )
)

export const useAnimatedElementsForSlide = (slideId: string): readonly RegisteredAnimatedElement[] => (
  useSyncExternalStore(
    subscribe,
    () => getAnimatedElementsForSlide(slideId),
    () => EMPTY_LIST,
  )
)

export const useDocumentHidden = (): boolean => (
  useSyncExternalStore(
    subscribe,
    () => docHidden,
    () => false,
  )
)

export const resetAnimatedImagePlaybackForTests = () => {
  registered.clear()
  userPausedOverrides.clear()
  slideListCache.clear()
  docHidden = false
  emit()
}
