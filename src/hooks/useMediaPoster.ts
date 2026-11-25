import { useState, useEffect, useRef } from 'react'
import { useSlidesStore } from '@/store'
import type { PPTAudioElement, PPTVideoElement } from '@/types/slides'

type MediaPosterElement = PPTVideoElement | PPTAudioElement

export default (element: () => MediaPosterElement, slideId?: () => string | undefined) => {
  const [synthesizing, setSynthesizing] = useState(false)
  const controllerRef = useRef<AbortController | null>(null)
  const lastKeyRef = useRef('')
  const elementGetterRef = useRef(element)
  const slideIdGetterRef = useRef(slideId)
  elementGetterRef.current = element
  slideIdGetterRef.current = slideId

  const current = element()
  const poster = current.poster || ''
  const displayPoster = poster

  const persistPoster = (next: string) => {
    const latest = elementGetterRef.current()
    if ((latest.poster || '') === next) return
    useSlidesStore.getState().updateElement({
      id: latest.id,
      slideId: slideIdGetterRef.current?.(),
      props: {
        poster: next,
      },
    })
  }

  useEffect(() => {
    let disposed = false
    const latest = elementGetterRef.current()
    const key = `${latest.id}\0${latest.src}`
    if (!latest.src) {
      setSynthesizing(false)
      return
    }
    if (lastKeyRef.current && lastKeyRef.current !== key && latest.poster) {
      persistPoster('')
    }
    const sourceChanged = lastKeyRef.current !== '' && lastKeyRef.current !== key
    lastKeyRef.current = key

    if (latest.type === 'video' || (!sourceChanged && latest.poster)) {
      setSynthesizing(false)
      return
    }

    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    const { signal } = controller
    setSynthesizing(true)

    void (async () => {
      try {
        const { synthesizeMediaPoster } = await import('@/utils/mediaPoster')
        if (disposed || signal.aborted) return
        const result = await synthesizeMediaPoster({
          kind: latest.type,
          src: latest.src,
          color: latest.type === 'audio' ? latest.color : undefined,
          signal,
        })
        if (disposed || signal.aborted) return
        if (result) persistPoster(result)
      } catch {
        // Ignore aborted or failed poster synthesis
      } finally {
        if (!disposed && controllerRef.current === controller) {
          setSynthesizing(false)
        }
      }
    })()

    return () => {
      disposed = true
      controller.abort()
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }, [current.id, current.src, current.poster])

  return {
    synthesizing,
    displayPoster,
    persistPoster,
  }
}
