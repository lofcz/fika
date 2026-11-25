import { memo, useEffect, useMemo, useState, type RefObject } from 'react'
import { bindStyles } from '@/utils/cssm'
import { useMainStore } from '@/store'
import type { PPTElement, PPTImageElement } from '@/types/slides'
import { elementVisualHitRect, pointInVisualHitRect } from '@/utils/canvasHitTest'
import {
  toggleAnimatedImagePlayback,
  useAnimatedElementsForSlide,
  useAnimatedImagePaused,
} from '@/utils/animatedImagePlayback'
import AnimatedImageControl from '@/views/components/element/ImageElement/AnimatedImageControl'
import styles from './AnimatedImageControlsLayer.module.scss'

const cx = bindStyles(styles)

export type IAnimatedImageControlsLayerProps = {
  slideId: string
  elementList: PPTElement[]
  canvasScale: number
  hiddenIdSet: ReadonlySet<string> | null
  wrapperRef: RefObject<HTMLDivElement | null>
  disabled?: boolean
}

const AnimatedImageOverlayItem = memo(({
  slideId,
  element,
  canvasScale,
  hovered,
  onControlHoverChange,
}: {
  slideId: string
  element: PPTImageElement
  canvasScale: number
  hovered: boolean
  onControlHoverChange: (id: string | null) => void
}) => {
  const paused = useAnimatedImagePaused(slideId, element.id)
  const scaleWidth = element.width * canvasScale
  const scaleHeight = element.height * canvasScale
  const compact = Math.min(scaleWidth, scaleHeight) < 96

  return (
    <div
      className={cx('box')}
      style={{
        left: element.left * canvasScale + 'px',
        top: element.top * canvasScale + 'px',
        width: scaleWidth + 'px',
        height: scaleHeight + 'px',
        transform: element.rotate ? `rotate(${element.rotate}deg)` : undefined,
        transformOrigin: `${scaleWidth / 2}px ${scaleHeight / 2}px`,
      }}
    >
      <AnimatedImageControl
        elementId={element.id}
        paused={paused}
        visible={hovered}
        compact={compact}
        onToggle={() => toggleAnimatedImagePlayback(slideId, element.id)}
        onPointerEnter={() => onControlHoverChange(element.id)}
        onPointerLeave={() => onControlHoverChange(null)}
      />
    </div>
  )
})

AnimatedImageOverlayItem.displayName = 'AnimatedImageOverlayItem'

/**
 * Hover playback controls for animated images on the current editor slide.
 * Mounted inside `.operates` (above both HitLayer and Operate drag surfaces),
 * and completely inert (0 listeners, 0 DOM nodes) when the slide has no animated images.
 */
const AnimatedImageControlsLayer = memo((props: IAnimatedImageControlsLayerProps) => {
  const { slideId, elementList, canvasScale, hiddenIdSet, wrapperRef, disabled = false } = props
  const isGesturing = useMainStore(s => s.isGesturing)
  const clipingImageElementId = useMainStore(s => s.clipingImageElementId)
  const animatedEntries = useAnimatedElementsForSlide(slideId)
  const [hoveredBoxId, setHoveredBoxId] = useState<string | null>(null)
  const [hoveredControlId, setHoveredControlId] = useState<string | null>(null)

  const animatedElements = useMemo(() => {
    if (!animatedEntries.length) return [] as PPTImageElement[]
    const ids = new Set(animatedEntries.map(entry => entry.elementId))
    const list: PPTImageElement[] = []
    for (const el of elementList) {
      if (el.type !== 'image' || !ids.has(el.id)) continue
      if (hiddenIdSet?.has(el.id)) continue
      if (el.id === clipingImageElementId) continue
      list.push(el)
    }
    return list
  }, [animatedEntries, elementList, hiddenIdSet, clipingImageElementId])

  useEffect(() => {
    if (disabled || isGesturing || !animatedElements.length) {
      setHoveredBoxId(null)
      setHoveredControlId(null)
      return
    }
    const wrapper = wrapperRef.current
    if (!wrapper) return

    const rects = animatedElements.map((el, index) => ({
      id: el.id,
      rect: elementVisualHitRect(el, canvasScale, index + 1),
    }))

    const onPointerMove = (e: PointerEvent) => {
      const bounds = wrapper.getBoundingClientRect()
      const x = e.clientX - bounds.left
      const y = e.clientY - bounds.top
      let hitId: string | null = null
      // Highest z-order wins when animated images overlap.
      for (let i = rects.length - 1; i >= 0; i--) {
        if (pointInVisualHitRect(x, y, rects[i].rect)) {
          hitId = rects[i].id
          break
        }
      }
      setHoveredBoxId(prev => (prev === hitId ? prev : hitId))
    }

    const onPointerLeave = () => {
      setHoveredBoxId(null)
    }

    wrapper.addEventListener('pointermove', onPointerMove, { passive: true })
    wrapper.addEventListener('pointerleave', onPointerLeave, { passive: true })
    return () => {
      wrapper.removeEventListener('pointermove', onPointerMove)
      wrapper.removeEventListener('pointerleave', onPointerLeave)
    }
  }, [disabled, isGesturing, animatedElements, canvasScale, wrapperRef])

  if (disabled || isGesturing || !animatedElements.length) return null

  return (
    <div className={cx('layer')}>
      {animatedElements.map(element => (
        <AnimatedImageOverlayItem
          key={element.id}
          slideId={slideId}
          element={element}
          canvasScale={canvasScale}
          hovered={hoveredBoxId === element.id || hoveredControlId === element.id}
          onControlHoverChange={setHoveredControlId}
        />
      ))}
    </div>
  )
})

AnimatedImageControlsLayer.displayName = 'AnimatedImageControlsLayer'

export default AnimatedImageControlsLayer
