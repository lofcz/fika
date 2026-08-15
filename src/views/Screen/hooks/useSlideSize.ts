import { useState, useEffect, useRef } from 'react'
import { useSlidesStore } from '@/store'

export const measureSlideSize = (viewportRatio: number, wrap?: HTMLElement | null) => {
  const slideWrap = wrap || (typeof document === 'undefined' ? null : document.body)
  if (!slideWrap) return { slideWidth: 0, slideHeight: 0 }
  const winWidth = slideWrap.clientWidth
  const winHeight = slideWrap.clientHeight
  if (!winWidth || !winHeight) return { slideWidth: 0, slideHeight: 0 }

  if (winHeight / winWidth === viewportRatio) {
    return { slideWidth: winWidth, slideHeight: winHeight }
  }
  if (winHeight / winWidth > viewportRatio) {
    return { slideWidth: winWidth, slideHeight: winWidth * viewportRatio }
  }
  return { slideWidth: winHeight / viewportRatio, slideHeight: winHeight }
}

export default (wrapRef?: { current: HTMLElement | null }) => {
  const viewportRatio = useSlidesStore(s => s.viewportRatio)
  const viewportRatioRef = useRef(viewportRatio)
  viewportRatioRef.current = viewportRatio

  const [size, setSize] = useState(() => measureSlideSize(viewportRatio, wrapRef?.current))

  useEffect(() => {
    const setSlideContentSize = () => {
      setSize(measureSlideSize(viewportRatioRef.current, wrapRef?.current || document.body))
    }

    setSlideContentSize()
    window.addEventListener('resize', setSlideContentSize)

    const el = wrapRef?.current
    let resizeObserver: ResizeObserver | null = null
    if (el) {
      resizeObserver = new ResizeObserver(setSlideContentSize)
      resizeObserver.observe(el)
    }

    return () => {
      window.removeEventListener('resize', setSlideContentSize)
      resizeObserver?.disconnect()
    }
  }, [wrapRef, viewportRatio])

  return size
}
