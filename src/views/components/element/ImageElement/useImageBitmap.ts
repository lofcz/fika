import { useEffect, useState } from 'react'
import { useSlidesStore } from '@/store'
import {
  getCachedImageBitmap,
  getCachedPreviewImageBitmap,
  loadImageBitmap,
  loadPreviewImageBitmap,
  syncImageBitmapsToSlides,
} from '@/utils/imageBitmapCache'

const cachedBitmap = (src: string) => (
  getCachedImageBitmap(src) ?? getCachedPreviewImageBitmap(src) ?? null
)

export const useImageBitmap = (src: string): ImageBitmap | null => {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(() => (
    src ? cachedBitmap(src) : null
  ))

  useEffect(() => {
    if (!src) {
      setBitmap(null)
      return
    }
    const full = getCachedImageBitmap(src)
    if (full) {
      setBitmap(full)
      return
    }
    const thumb = getCachedPreviewImageBitmap(src)
    if (thumb) setBitmap(thumb)
    else setBitmap(null)

    let cancelled = false
    const run = async () => {
      const preview = thumb ?? await loadPreviewImageBitmap(src)
      if (cancelled) return
      if (preview && !getCachedImageBitmap(src)) setBitmap(preview)
      const next = await loadImageBitmap(src)
      if (!cancelled && next) setBitmap(next)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [src])

  return bitmap
}

export const useSyncImageBitmapCache = () => {
  const slides = useSlidesStore(s => s.slides)
  useEffect(() => {
    syncImageBitmapsToSlides(slides)
  }, [slides])
}
