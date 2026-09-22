import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useMainStore, useSlidesStore } from '@/store'
import { FIT_CANVAS_BOUNDS_EVENT, calculateCanvasFit, type CanvasFitRequest } from '@/utils/canvasFit'
import { occupancyForTargetZoom, setPendingZoom } from '@/utils/canvasZoom'

export default (canvasRef: { current: HTMLElement | null }) => {
  const [viewportLeft, setViewportLeft] = useState(0)
  const [viewportTop, setViewportTop] = useState(0)
  const viewportLeftRef = useRef(0)
  const viewportTopRef = useRef(0)
  // The refs are the current camera, including input coalesced before the next render.
  const panFrame = useRef(0)
  const publishPan = useCallback(() => {
    if (panFrame.current) return
    panFrame.current = requestAnimationFrame(() => {
      panFrame.current = 0
      setViewportLeft(viewportLeftRef.current)
      setViewportTop(viewportTopRef.current)
    })
  }, [])
  useEffect(() => () => cancelAnimationFrame(panFrame.current), [])

  const canvasPercentage = useMainStore(s => s.canvasPercentage)
  const canvasDragged = useMainStore(s => s.canvasDragged)
  const viewportRatio = useSlidesStore(s => s.viewportRatio)
  const viewportSize = useSlidesStore(s => s.viewportSize)
  const prevPercentageRef = useRef(canvasPercentage)

  const lastCanvasWidthRef = useRef(0)
  const lastCanvasHeightRef = useRef(0)
  const rafRef = useRef(0)
  const observedCanvasRef = useRef<HTMLElement | null>(null)
  const lastHostRef = useRef<HTMLElement | null>(null)
  const scheduleViewportRef = useRef<(force?: boolean) => void>(() => {})
  const setViewportPositionRef = useRef<(newValue: number, oldValue: number) => void>(() => {})
  const observeHostsRef = useRef<() => void>(() => {})
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  if (!resizeObserverRef.current) {
    resizeObserverRef.current = new ResizeObserver(() => {
      scheduleViewportRef.current()
    })
  }

  const setScaleIfChanged = (next: number) => {
    const { canvasScale, setCanvasScale } = useMainStore.getState()
    if (Math.abs(next - canvasScale) < 0.0005) return
    setCanvasScale(next)
  }

  const initViewportPosition = (force = false) => {
    if (!canvasRef.current) return
    const canvasWidth = canvasRef.current.clientWidth
    const canvasHeight = canvasRef.current.clientHeight
    if (
      !force &&
      lastCanvasWidthRef.current > 0 &&
      Math.abs(canvasWidth - lastCanvasWidthRef.current) < 1 &&
      Math.abs(canvasHeight - lastCanvasHeightRef.current) < 1
    ) return
    lastCanvasWidthRef.current = canvasWidth
    lastCanvasHeightRef.current = canvasHeight

    const { canvasPercentage: pct } = useMainStore.getState()
    const { viewportRatio: ratio, viewportSize: size } = useSlidesStore.getState()

    if (canvasHeight / canvasWidth > ratio) {
      const viewportActualWidth = canvasWidth * (pct / 100)
      setScaleIfChanged(viewportActualWidth / size)
      const left = (canvasWidth - viewportActualWidth) / 2
      const top = (canvasHeight - viewportActualWidth * ratio) / 2
      viewportLeftRef.current = left
      viewportTopRef.current = top
      setViewportLeft(left)
      setViewportTop(top)
    }
    else {
      const viewportActualHeight = canvasHeight * (pct / 100)
      setScaleIfChanged(viewportActualHeight / (size * ratio))
      const left = (canvasWidth - viewportActualHeight / ratio) / 2
      const top = (canvasHeight - viewportActualHeight) / 2
      viewportLeftRef.current = left
      viewportTopRef.current = top
      setViewportLeft(left)
      setViewportTop(top)
    }
  }

  const scheduleViewport = (force = false) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      initViewportPosition(force)
    })
  }
  scheduleViewportRef.current = scheduleViewport

  const setViewportPosition = (newValue: number, oldValue: number) => {
    if (!canvasRef.current) return
    const canvasWidth = canvasRef.current.clientWidth
    const canvasHeight = canvasRef.current.clientHeight
    const { viewportRatio: ratio, viewportSize: size } = useSlidesStore.getState()

    if (canvasHeight / canvasWidth > ratio) {
      const newViewportActualWidth = canvasWidth * (newValue / 100)
      const oldViewportActualWidth = canvasWidth * (oldValue / 100)
      const newViewportActualHeight = newViewportActualWidth * ratio
      const oldViewportActualHeight = oldViewportActualWidth * ratio

      setScaleIfChanged(newViewportActualWidth / size)

      const left = viewportLeftRef.current - (newViewportActualWidth - oldViewportActualWidth) / 2
      const top = viewportTopRef.current - (newViewportActualHeight - oldViewportActualHeight) / 2
      viewportLeftRef.current = left
      viewportTopRef.current = top
      setViewportLeft(left)
      setViewportTop(top)
    }
    else {
      const newViewportActualHeight = canvasHeight * (newValue / 100)
      const oldViewportActualHeight = canvasHeight * (oldValue / 100)
      const newViewportActualWidth = newViewportActualHeight / ratio
      const oldViewportActualWidth = oldViewportActualHeight / ratio

      setScaleIfChanged(newViewportActualHeight / (size * ratio))

      const left = viewportLeftRef.current - (newViewportActualWidth - oldViewportActualWidth) / 2
      const top = viewportTopRef.current - (newViewportActualHeight - oldViewportActualHeight) / 2
      viewportLeftRef.current = left
      viewportTopRef.current = top
      setViewportLeft(left)
      setViewportTop(top)
    }
  }
  setViewportPositionRef.current = setViewportPosition

  useEffect(() => {
    const oldValue = prevPercentageRef.current
    if (oldValue === canvasPercentage) return
    prevPercentageRef.current = canvasPercentage
    setViewportPositionRef.current(canvasPercentage, oldValue)
  }, [canvasPercentage])

  const skipRatioMount = useRef(true)
  useEffect(() => {
    if (skipRatioMount.current) {
      skipRatioMount.current = false
      return
    }
    scheduleViewportRef.current(true)
  }, [viewportRatio])

  const skipSizeMount = useRef(true)
  useEffect(() => {
    if (skipSizeMount.current) {
      skipSizeMount.current = false
      return
    }
    scheduleViewportRef.current(true)
  }, [viewportSize])

  const skipDraggedMount = useRef(true)
  useEffect(() => {
    if (skipDraggedMount.current) {
      skipDraggedMount.current = false
      return
    }
    if (!canvasDragged) scheduleViewportRef.current(true)
  }, [canvasDragged])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const fitBounds = (event: Event) => {
      const next = calculateCanvasFit((event as CustomEvent<CanvasFitRequest>).detail, canvas.clientWidth, canvas.clientHeight)
      if (!next) return
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
      const main = useMainStore.getState()
      const slides = useSlidesStore.getState()
      const percentage = occupancyForTargetZoom(next.scale * 100, canvas.clientWidth, canvas.clientHeight, slides.viewportSize, slides.viewportRatio)
      // Mark the occupancy as consumed so the normal zoom effect cannot recenter this fit.
      prevPercentageRef.current = percentage
      setPendingZoom(null)
      main.setCanvasDragged(true)
      main.setCanvasPercentage(percentage)
      main.setCanvasScale(next.scale)
      viewportLeftRef.current = next.left
      viewportTopRef.current = next.top
      setViewportLeft(next.left)
      setViewportTop(next.top)
    }
    canvas.addEventListener(FIT_CANVAS_BOUNDS_EVENT, fitBounds)
    return () => canvas.removeEventListener(FIT_CANVAS_BOUNDS_EVENT, fitBounds)
  }, [canvasRef])

  const viewportStyles = useMemo(() => ({
    width: viewportSize,
    height: viewportSize * viewportRatio,
    left: viewportLeft,
    top: viewportTop,
  }), [viewportSize, viewportRatio, viewportLeft, viewportTop])

  const observeHosts = () => {
    const canvas = canvasRef.current
    const resizeObserver = resizeObserverRef.current!
    if (canvas && canvas !== observedCanvasRef.current) {
      if (observedCanvasRef.current) resizeObserver.unobserve(observedCanvasRef.current)
      resizeObserver.observe(canvas)
      observedCanvasRef.current = canvas
    }
  }
  observeHostsRef.current = observeHosts

  const onWindowResize = () => scheduleViewportRef.current(true)

  useEffect(() => {
    const canvas = canvasRef.current
    if (lastHostRef.current === canvas) return
    lastHostRef.current = canvas
    observeHostsRef.current()
    scheduleViewportRef.current(true)
  })

  useEffect(() => {
    observeHostsRef.current()
    scheduleViewportRef.current(true)
    window.addEventListener('resize', onWindowResize)
    window.visualViewport?.addEventListener('resize', onWindowResize)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      resizeObserverRef.current?.disconnect()
      observedCanvasRef.current = null
      lastHostRef.current = null
      window.removeEventListener('resize', onWindowResize)
      window.visualViewport?.removeEventListener('resize', onWindowResize)
    }
  }, [])

  const panViewport = useCallback((dx: number, dy: number) => {
    const left = viewportLeftRef.current + dx
    const top = viewportTopRef.current + dy
    viewportLeftRef.current = left
    viewportTopRef.current = top
    publishPan()
    useMainStore.getState().setCanvasDragged(true)
  }, [publishPan])

  // A page-origin change is a coordinate rebase, not user camera input.
  // Publish in the caller's layout effect so the new origin and its compensating
  // offset reach the screen together, without a frame of workspace movement.
  const rebaseViewport = useCallback((dx: number, dy: number) => {
    viewportLeftRef.current += dx
    viewportTopRef.current += dy
    cancelAnimationFrame(panFrame.current)
    panFrame.current = 0
    setViewportLeft(viewportLeftRef.current)
    setViewportTop(viewportTopRef.current)
    useMainStore.getState().setCanvasDragged(true)
  }, [])

  const dragViewport = useCallback((e: MouseEvent) => {
    let isMouseDown = true

    const startClientX = e.clientX
    const startClientY = e.clientY

    const originLeft = viewportLeftRef.current
    const originTop = viewportTopRef.current

    document.onmousemove = moveEvent => {
      if (!isMouseDown) return

      const left = originLeft + (moveEvent.clientX - startClientX)
      const top = originTop + (moveEvent.clientY - startClientY)
      viewportLeftRef.current = left
      viewportTopRef.current = top
      publishPan()
    }

    document.onmouseup = () => {
      isMouseDown = false
      document.onmousemove = null
      document.onmouseup = null

      useMainStore.getState().setCanvasDragged(true)
    }
  }, [publishPan])

  return {
    viewportStyles,
    dragViewport,
    panViewport,
    rebaseViewport,
  }
}
