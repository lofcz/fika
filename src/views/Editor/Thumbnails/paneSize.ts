import { useSyncExternalStore } from 'react'

export const PREVIEW_MIN_PANE = 120
export const PREVIEW_DEFAULT_PANE = 168
export const PREVIEW_MAX_PANE = 420
export const PREVIEW_THUMB_INSET = 48
export const PREVIEW_SUPER_SAMPLE = 2
export const PREVIEW_RAIL_SUPER_SAMPLE = 1
export const PREVIEW_MAX_WORKING = 1024
export const PREVIEW_RAIL_MAX_WORKING = 512
export const PREVIEW_LQ_MAX_WORKING = 80
export type PreviewWorkingQuality = 'full' | 'rail' | 'lq'
type DestPublishHandler = () => void
let destPublishHandler: DestPublishHandler | null = null
let destLiveHandler: DestPublishHandler | null = null
export const PREVIEW_PANE_RESIZE_COMMIT_MS = 120
let paneCommitTimer = 0

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

const notifyLayout = () => {
  const next = buildSnapshot()
  if (snapshotsEqual(snapshot, next)) return false
  snapshot = next
  for (const listener of listeners) listener()
  return true
}

const publish = () => {
  if (!notifyLayout()) return
  destPublishHandler?.()
}

const schedulePaneDestCommit = () => {
  destLiveHandler?.()
  if (typeof window === 'undefined') {
    destPublishHandler?.()
    return
  }
  window.clearTimeout(paneCommitTimer)
  paneCommitTimer = window.setTimeout(() => {
    paneCommitTimer = 0
    destPublishHandler?.()
  }, PREVIEW_PANE_RESIZE_COMMIT_MS)
}

const syncWorkingWidth = () => {
  workingSlideWidth = Math.min(
    PREVIEW_MAX_WORKING,
    Math.max(1, Math.ceil(destCssWidth() * readDpr() * PREVIEW_SUPER_SAMPLE)),
  )
}

export const previewWorkingWidth = (
  destWidth: number,
  pixelRatio: number,
  quality: PreviewWorkingQuality = 'full',
) => {
  if (quality === 'lq') return PREVIEW_LQ_MAX_WORKING
  const superSample = quality === 'full' ? PREVIEW_SUPER_SAMPLE : PREVIEW_RAIL_SUPER_SAMPLE
  const cap = quality === 'full' ? PREVIEW_MAX_WORKING : PREVIEW_RAIL_MAX_WORKING
  return Math.min(cap, Math.max(1, Math.ceil(destWidth * pixelRatio * superSample)))
}

export const setPreviewDestPublishHandler = (fn: DestPublishHandler | null) => {
  destPublishHandler = fn
}

export const setPreviewDestLiveHandler = (fn: DestPublishHandler | null) => {
  destLiveHandler = fn
}

export const setPreviewPaneWidth = (width: number) => {
  const next = Math.round(Math.min(PREVIEW_MAX_PANE, Math.max(PREVIEW_MIN_PANE, width)))
  if (next === paneWidth) return
  paneWidth = next
  syncWorkingWidth()
  if (!notifyLayout()) return
  schedulePaneDestCommit()
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
