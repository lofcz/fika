import { useSyncExternalStore } from 'react'

export const PREVIEW_MIN_PANE = 120
export const PREVIEW_DEFAULT_PANE = 168
export const PREVIEW_MAX_PANE = 420
export const PREVIEW_THUMB_INSET = 48
export const PREVIEW_SUPER_SAMPLE = 2
export const PREVIEW_MAX_WORKING = 1024
type DestPublishHandler = () => void
let destPublishHandler: DestPublishHandler | null = null

export type PreviewDestSize = {
  cssWidth: number
  cssHeight: number
  dpr: number
  workingSlideWidth: number
}

let paneWidth = PREVIEW_DEFAULT_PANE
let viewportRatio = 9 / 16
let workingSlideWidth = 1
const listeners = new Set<() => void>()

const readDpr = () => (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1)

const destCssWidth = () => Math.max(1, paneWidth - PREVIEW_THUMB_INSET)

const buildSnapshot = (): PreviewDestSize => {
  const cssWidth = destCssWidth()
  return {
    cssWidth,
    cssHeight: cssWidth * viewportRatio,
    dpr: readDpr(),
    workingSlideWidth,
  }
}

let snapshot = buildSnapshot()

const snapshotsEqual = (a: PreviewDestSize, b: PreviewDestSize) => (
  a.cssWidth === b.cssWidth
  && a.cssHeight === b.cssHeight
  && a.dpr === b.dpr
  && a.workingSlideWidth === b.workingSlideWidth
)

const publish = () => {
  const next = buildSnapshot()
  if (snapshotsEqual(snapshot, next)) return
  snapshot = next
  for (const listener of listeners) listener()
  destPublishHandler?.()
}

const syncWorkingWidth = () => {
  workingSlideWidth = Math.min(
    PREVIEW_MAX_WORKING,
    Math.max(1, Math.ceil(destCssWidth() * readDpr() * PREVIEW_SUPER_SAMPLE)),
  )
}

export const previewWorkingWidth = (destWidth: number, pixelRatio: number) => (
  Math.min(PREVIEW_MAX_WORKING, Math.max(1, Math.ceil(destWidth * pixelRatio * PREVIEW_SUPER_SAMPLE)))
)

export const setPreviewDestPublishHandler = (fn: DestPublishHandler | null) => {
  destPublishHandler = fn
}

export const setPreviewPaneWidth = (width: number) => {
  const next = Math.round(Math.min(PREVIEW_MAX_PANE, Math.max(PREVIEW_MIN_PANE, width)))
  if (next !== paneWidth) paneWidth = next
  syncWorkingWidth()
  publish()
}

export const setPreviewViewportRatio = (ratio: number) => {
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio === viewportRatio) return
  viewportRatio = ratio
  publish()
}

export const getPreviewDestSize = (): PreviewDestSize => snapshot

export const usePreviewDestSize = (): PreviewDestSize => (
  useSyncExternalStore(
    listener => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    getPreviewDestSize,
    getPreviewDestSize,
  )
)

if (typeof window !== 'undefined') {
  let media: MediaQueryList | undefined
  const syncDevicePixelRatio = () => {
    syncWorkingWidth()
    publish()
    const next = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    if (next === media) return
    media?.removeEventListener('change', syncDevicePixelRatio)
    media = next
    media.addEventListener('change', syncDevicePixelRatio)
  }
  window.addEventListener('resize', syncDevicePixelRatio)
  window.visualViewport?.addEventListener('resize', syncDevicePixelRatio)
  syncDevicePixelRatio()
}
