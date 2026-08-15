import { useEffect, useRef } from 'react'
import { useMainStore, useSlidesStore, selectCurrentSlide } from '@/store'
import type { TextInset } from '@/types/slides'

export function useAutoShapeTextHeight(enabled: boolean, elementId: string, inset: TextInset) {
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!enabled) return
    const host = hostRef.current
    if (!host) return

    const apply = () => {
      if (useMainStore.getState().isScaling) return
      const content = host.querySelector('.ProseMirror') as HTMLElement | null
      if (!content) return
      const next = Math.ceil(content.scrollHeight + inset[0] + inset[2])
      if (next < 1) return
      const el = selectCurrentSlide(useSlidesStore.getState())?.elements.find(item => item.id === elementId)
      if (!el || el.type !== 'shape' || Math.abs(el.height - next) < 0.5) return
      useSlidesStore.getState().updateElement({ id: elementId, props: { height: next } })
    }

    const observer = new ResizeObserver(apply)
    observer.observe(host)
    apply()
    return () => observer.disconnect()
  }, [enabled, elementId, inset[0], inset[2]])

  return hostRef
}
