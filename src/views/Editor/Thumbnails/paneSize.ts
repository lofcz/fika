import { useSyncExternalStore } from 'react'

export const PREVIEW_MIN_PANE = 120
export const PREVIEW_DEFAULT_PANE = 168
export const PREVIEW_MAX_PANE = 420
export const PREVIEW_THUMB_INSET = 48
export const PREVIEW_PANE_RESIZE_COMMIT_MS = 120
export type PreviewWorkingQuality = 'full' | 'rail' | 'lq'
type DestPublishHandler = () => void
let destPublishHandler: DestPublishHandler | null = null
let destLiveHandler: DestPublishHandler | null = null

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

/**
 * A gutter drag holds the freeze for its whole duration: no debounce commits
 * mid-drag (each one flips the rail between scaled-frozen and crisp-rendered,
 * which reads as jumping). The commit happens on drag end.
 */
let paneCommitTimer = 0
let paneDragging = false
export const isPaneDragging = () => paneDragging
export const beginPaneDrag = () => {
  if (paneDragging) return
  paneDragging = true
  window.clearTimeout(paneCommitTimer)
  paneCommitTimer = 0
  notifyPaneLive()
}
export const endPaneDrag = () => {
  if (!paneDragging) return
  paneDragging = false
  window.clearTimeout(paneCommitTimer)
  paneCommitTimer = 0
  notifyPaneLive()
  destPublishHandler?.()
}

const schedulePaneDestCommit = () => {
  if (paneDragging) return
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

/**
 * Live (pre-commit) pane content width, driven per drag frame. The rail
 * freezes its React trees during a gutter drag and visually scales to this
 * width; the committed `usePreviewDestSize` lands once the drag settles.
 */
const paneLiveListeners = new Set<(contentWidth: number) => void>()
const notifyPaneLive = () => {
  const w = destCssWidth()
  for (const listener of paneLiveListeners) listener(w)
}
export const subscribePaneLive = (listener: (contentWidth: number) => void) => {
  paneLiveListeners.add(listener)
  return () => {
    paneLiveListeners.delete(listener)
  }
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
  // Chrome (row boxes, numbers, spacing) tracks the pointer LIVE via the
  // synchronous notify; the heavy thumbnail CONTENT freezes itself against
  // paneLive lets thumbnail shells resize immediately while backing canvases
  // repaint through the frame-budgeted scheduler.
  notifyPaneLive()
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
