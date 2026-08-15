import { useScreenStore, useSlidesStore } from '@/store'
import { enterFullscreen, exitFullscreen, isFullscreen } from '@/utils/fullscreen'
import { prefetchScreen } from '@/views/Screen/lazy'

const requestFullscreenSoon = () => {
  requestAnimationFrame(() => enterFullscreen())
}

export default () => {
  const enterScreening = () => {
    useScreenStore.getState().setScreening(true)
    requestFullscreenSoon()
  }

  const enterScreeningFromStart = () => {
    useScreenStore.getState().setScreening(true)
    useSlidesStore.getState().updateSlideIndex(0)
    requestFullscreenSoon()
  }

  const exitScreening = () => {
    useScreenStore.getState().setScreening(false)
    if (isFullscreen()) exitFullscreen()
  }

  return {
    enterScreening,
    enterScreeningFromStart,
    exitScreening,
    prefetchScreen,
  }
}
