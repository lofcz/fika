import { memo, useEffect, useMemo, useRef } from 'react'
import { useMainStore, useSlidesStore } from '@/store'
import type { Slide } from '@/types/slides'
import { getElementRange } from '@/utils/element'
import { paintSlideToCanvas } from '@/paint/slidePainter'
import { arePaintedSlideIdentitiesEqual } from '@/views/components/ThumbnailSlide/paintedSlide'

/** Off-page artwork for inactive pages; the regular thumbnail still paints the page. */
export default memo(function MynaPageOverflow({ id, x, y, scale, activate }: { id: string; x: number; y: number; scale: number; activate: (id: string) => void }) {
  const selector = useMemo(() => {
    let previous: Slide | undefined
    return (state: { slides: Slide[] }) => {
      const next = state.slides.find(page => page.id === id)
      if (!arePaintedSlideIdentitiesEqual(previous, next)) previous = next
      return previous
    }
  }, [id])
  const slide = useSlidesStore(selector)
  const width = useSlidesStore(s => s.viewportSize), ratio = useSlidesStore(s => s.viewportRatio), theme = useSlidesStore(s => s.theme)
  const canvas = useRef<HTMLCanvasElement>(null)
  const geometry = useMemo(() => {
    const items = (slide?.elements || []).map(element => ({ element, rect: getElementRange(element) }))
      .filter(({ rect }) => rect.minX < 0 || rect.minY < 0 || rect.maxX > width || rect.maxY > width * ratio)
    if (!items.length) return null
    const left = Math.min(0, ...items.map(item => item.rect.minX)) - 4
    const top = Math.min(0, ...items.map(item => item.rect.minY)) - 4
    return { items, bounds: { x: left, y: top, width: Math.max(width, ...items.map(item => item.rect.maxX)) - left + 4, height: Math.max(width * ratio, ...items.map(item => item.rect.maxY)) - top + 4 } }
  }, [slide?.elements, width, ratio])
  useEffect(() => {
    if (!geometry || !slide || !canvas.current) return
    let disposed = false, raf = 0
    const paint = () => {
      if (disposed || !canvas.current) return
      const { bounds } = geometry
      const resolution = Math.min(scale * (window.devicePixelRatio || 1), 2048 / Math.max(bounds.width, bounds.height))
      paintSlideToCanvas(canvas.current, { slide, theme, viewportSize: width, viewportRatio: ratio,
        cssWidth: bounds.width * resolution, cssHeight: bounds.height * resolution, dpr: 1,
        transparentBackground: true, workspaceBounds: bounds,
        invalidate: () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(paint) },
      })
    }
    paint()
    return () => { disposed = true; cancelAnimationFrame(raf) }
  }, [geometry, slide, scale, theme, width, ratio])
  if (!geometry) return null
  const { bounds } = geometry
  // The hole prevents this overlay from intercepting the page's thumbnail.
  const w = bounds.width * scale, h = bounds.height * scale
  const l = -bounds.x * scale, t = -bounds.y * scale, r = l + width * scale, b = t + width * ratio * scale
  return <div data-myna-page-chrome data-myna-page-overflow={id} style={{ position: 'absolute', left: x + bounds.x * scale, top: y + bounds.y * scale, width: w, height: h, pointerEvents: 'none', clipPath: `polygon(evenodd, 0 0, ${w}px 0, ${w}px ${h}px, 0 ${h}px, 0 0, ${l}px ${t}px, ${r}px ${t}px, ${r}px ${b}px, ${l}px ${b}px, ${l}px ${t}px)` }}>
    <canvas ref={canvas} style={{ width: w, height: h, display: 'block' }} />
    {geometry.items.map(({ element, rect }) => <div key={element.id} data-myna-overflow-element={element.id} style={{ position: 'absolute', left: (rect.minX - bounds.x) * scale, top: (rect.minY - bounds.y) * scale, width: (rect.maxX - rect.minX) * scale, height: (rect.maxY - rect.minY) * scale, pointerEvents: 'auto' }} onMouseDown={event => {
      if (event.button !== 0) return
      event.stopPropagation(); activate(id)
      if (!useMainStore.getState().readOnly) useMainStore.getState().setActiveElementIdList([element.id])
    }} />)}
  </div>
})
