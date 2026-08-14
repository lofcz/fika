import { useState, useEffect, useRef } from 'react'
import { useSlidesStore } from '@/store'

export default (wrapRef?: { current: HTMLElement | null }) => {
  const viewportRatio = useSlidesStore(s => s.viewportRatio)
  const viewportRatioRef = useRef(viewportRatio)
  viewportRatioRef.current = viewportRatio

  const [slideWidth, setSlideWidth] = useState(0)
  const [slideHeight, setSlideHeight] = useState(0)

  useEffect(() => {
    const setSlideContentSize = () => {
      const slideWrapRef = wrapRef?.current || document.body
      const winWidth = slideWrapRef.clientWidth
      const winHeight = slideWrapRef.clientHeight
      const ratio = viewportRatioRef.current
      let width: number
      let height: number

      if (winHeight / winWidth === ratio) {
        width = winWidth
        height = winHeight
      }
      else if (winHeight / winWidth > ratio) {
        width = winWidth
        height = winWidth * ratio
      }
      else {
        width = winHeight / ratio
        height = winHeight
      }
      setSlideWidth(width)
      setSlideHeight(height)
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

  return {
    slideWidth,
    slideHeight,
  }
}
