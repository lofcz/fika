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
    if (!src) {
      setState({ bitmap: null, status: 'idle' })
      return
    }
    const full = getCachedImageBitmap(src)
    if (full) {
      setState({ bitmap: full, status: 'loaded' })
      return
    }
    const thumb = getCachedPreviewImageBitmap(src)
    if (thumb) setState({ bitmap: thumb, status: 'loaded' })
    else setState({ bitmap: null, status: 'loading' })

    let cancelled = false
    const run = async () => {
      const preview = thumb ?? await loadPreviewImageBitmap(src)
      if (cancelled) return
      if (preview && !getCachedImageBitmap(src)) {
        setState({ bitmap: preview, status: 'loaded' })
      }
      const next = await loadImageBitmap(src)
      if (cancelled) return
      if (next) {
        setState({ bitmap: next, status: 'loaded' })
      } else if (!preview && !getCachedImageBitmap(src)) {
        setState({ bitmap: null, status: 'error' })
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
  const slides = useSlidesStore(s => s.slides)
  useEffect(() => {
    syncImageBitmapsToSlides(slides)
  }, [slides])
}
