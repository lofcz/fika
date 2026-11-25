import { useEffect, useState } from 'react'
import { useSlidesStore } from '@/store'
import {
  getCachedImageBitmap,
  getCachedPreviewImageBitmap,
  loadImageBitmap,
  loadPreviewImageBitmap,
  syncImageBitmapsToSlides,
} from '@/utils/imageBitmapCache'

export type ImageBitmapLoadStatus = 'idle' | 'loading' | 'loaded' | 'error'

export interface ImageBitmapLoadState {
  bitmap: ImageBitmap | null
  status: ImageBitmapLoadStatus
}

const cachedBitmap = (src: string) => (
  getCachedImageBitmap(src) ?? getCachedPreviewImageBitmap(src) ?? null
)

export const useImageBitmapState = (src: string): ImageBitmapLoadState => {
  const [state, setState] = useState<ImageBitmapLoadState>(() => {
    if (!src) return { bitmap: null, status: 'idle' }
    const hit = cachedBitmap(src)
    return hit ? { bitmap: hit, status: 'loaded' } : { bitmap: null, status: 'loading' }
  })

  useEffect(() => {
    const setIfChanged = (next: ImageBitmapLoadState) => {
      setState(prev => (prev.bitmap === next.bitmap && prev.status === next.status ? prev : next))
    }
    if (!src) {
      setIfChanged({ bitmap: null, status: 'idle' })
      return
    }
    const full = getCachedImageBitmap(src)
    if (full) {
      setIfChanged({ bitmap: full, status: 'loaded' })
      return
    }
    const thumb = getCachedPreviewImageBitmap(src)
    if (thumb) setIfChanged({ bitmap: thumb, status: 'loaded' })
    else setIfChanged({ bitmap: null, status: 'loading' })

    let cancelled = false
    const run = async () => {
      const preview = thumb ?? await loadPreviewImageBitmap(src)
      if (cancelled) return
      if (preview && !getCachedImageBitmap(src)) {
        setIfChanged({ bitmap: preview, status: 'loaded' })
      }
      const next = await loadImageBitmap(src)
      if (cancelled) return
      if (next) {
        setIfChanged({ bitmap: next, status: 'loaded' })
      } else if (!preview && !getCachedImageBitmap(src)) {
        setIfChanged({ bitmap: null, status: 'error' })
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [src])

  return state
}

export const useImageBitmap = (src: string): ImageBitmap | null => useImageBitmapState(src).bitmap

export const useSyncImageBitmapCache = () => {
  useEffect(() => {
    let lastSlides = useSlidesStore.getState().slides
    syncImageBitmapsToSlides(lastSlides)
    return useSlidesStore.subscribe(state => {
      if (state.slides === lastSlides) return
      lastSlides = state.slides
      syncImageBitmapsToSlides(lastSlides)
    })
  }, [])
}
