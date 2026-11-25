import { useEffect, useRef } from 'react'
import { useMainStore, useSlidesStore, selectCurrentSlide } from '@/store'
import type { TextInset } from '@/types/slides'
import { flushElementSizeSync, scheduleElementSizeSync } from '@/views/Editor/Canvas/batchedHeightSync'

export function useAutoShapeTextHeight(
  enabled: boolean,
  elementId: string,
  inset: TextInset,
  contentHost?: { readonly current: HTMLElement | null },
) {
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!enabled) return
    const host = hostRef.current
    if (!host) return

    const apply = (immediate = false) => {
      // While a resize drag is active, the drag loop owns the live height
      // (it measures and paints per frame) — reacting here would fight it.
      if (useMainStore.getState().isGesturing) return
      const content = host.querySelector('.ProseMirror') as HTMLElement | null
      if (!content) return
      const next = Math.ceil(content.scrollHeight + inset[0] + inset[2])
      if (next < 1) return
      const el = selectCurrentSlide(useSlidesStore.getState())?.elements.find(item => item.id === elementId)
      if (!el || el.type !== 'shape' || Math.abs(el.height - next) < 0.5) return
      if (immediate) {
        useSlidesStore.getState().updateElement({ id: elementId, props: { height: next } })
      }
      else {
        scheduleElementSizeSync(elementId, { height: next })
      }
    }

    const observer = new ResizeObserver(() => apply(false))
    observer.observe(host)
    // `.shape-text` is absolutely pinned to the shape box, so it never resizes
    // when the text itself grows or shrinks (font size, line height, styles).
    // The stable [data-text-fit-host] wrapper tracks the painted text height
    // and survives the static ↔ live editor swap.
    const content = contentHost?.current
    if (content) observer.observe(content)
    apply(false)
    // The post-drop layout may not resize again after the gesture guards
    // swallowed the last observer fires — re-apply on gesture end to commit.
    let prevScaling = useMainStore.getState().isScaling
    const unsubscribe = useMainStore.subscribe(state => {
      const scaling = state.isScaling
      if (prevScaling && !scaling) apply(true)
      prevScaling = scaling
    })
    return () => {
      unsubscribe()
      observer.disconnect()
      flushElementSizeSync(elementId)
    }
  }, [enabled, elementId, inset[0], inset[2], contentHost])

  return hostRef
}
