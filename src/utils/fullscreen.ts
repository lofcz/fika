type VendorDocument = Document & {
  mozCancelFullScreen?: () => Promise<void> | void
  webkitExitFullscreen?: () => Promise<void> | void
  msExitFullscreen?: () => Promise<void> | void
  mozFullScreenElement?: Element | null
  webkitFullscreenElement?: Element | null
  msFullscreenElement?: Element | null
  webkitCurrentFullScreenElement?: Element | null
}

type VendorElement = HTMLElement & {
  mozRequestFullScreen?: () => Promise<void> | void
  webkitRequestFullScreen?: () => Promise<void> | void
  msRequestFullscreen?: () => Promise<void> | void
}

/**
 * Prefer the live slideshow surface so host-app chrome (sidebars, cards)
 * is not part of the fullscreen tree. `document.documentElement` is last
 * resort — fullscreening the page keeps that chrome on screen.
 */
export function getFullscreenElement(): HTMLElement {
  const screen = document.querySelector<HTMLElement>('[data-fika-screen]')
  const overlay = screen?.closest<HTMLElement>('.fika-embed-root')
  if (overlay) return overlay

  const embedPortal = document.querySelector<HTMLElement>('.fika-embed-root > .fika-embed-portal')
  if (embedPortal) return embedPortal

  return document.documentElement
}

export const enterFullscreen = () => {
  const el = getFullscreenElement() as VendorElement
  if (el.requestFullscreen) void el.requestFullscreen()
  else if (el.mozRequestFullScreen) void el.mozRequestFullScreen()
  else if (el.webkitRequestFullScreen) void el.webkitRequestFullScreen()
  else if (el.msRequestFullscreen) void el.msRequestFullscreen()
}

export const exitFullscreen = () => {
  const doc = document as VendorDocument
  if (doc.exitFullscreen) void doc.exitFullscreen()
  else if (doc.mozCancelFullScreen) void doc.mozCancelFullScreen()
  else if (doc.webkitExitFullscreen) void doc.webkitExitFullscreen()
  else if (doc.msExitFullscreen) void doc.msExitFullscreen()
}

export const isFullscreen = () => {
  const doc = document as VendorDocument
  const fullscreenElement = doc.fullscreenElement
    || doc.mozFullScreenElement
    || doc.webkitFullscreenElement
    || doc.msFullscreenElement
    || doc.webkitCurrentFullScreenElement
  return !!fullscreenElement
}
