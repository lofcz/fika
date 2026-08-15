import { useScreenStore, useSlidesStore } from '@/store'
import { drainCommitQueue } from '@/utils/commitQueue'
import { enterFullscreen, exitFullscreen, isFullscreen } from '@/utils/fullscreen'

const requestFullscreenSoon = () => {
  requestAnimationFrame(() => enterFullscreen())
}

/** Drain live editors, then enter presentation. No fullscreen — embed/agentic. */
export function beginScreening(options?: { fromStart?: boolean }) {
  drainCommitQueue()
  if (options?.fromStart) useSlidesStore.getState().updateSlideIndex(0)
  useScreenStore.getState().setScreening(true)
}

/** Editor Present / F5: drain, screen, then request fullscreen. */
export function enterScreening(options?: { fromStart?: boolean }) {
  beginScreening(options)
  requestFullscreenSoon()
}

export function enterScreeningFromStart() {
  enterScreening({ fromStart: true })
}

export function exitScreening() {
  useScreenStore.getState().setScreening(false)
  if (isFullscreen()) exitFullscreen()
}
