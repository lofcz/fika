import { useEffect, useState } from 'react'
import { useSlidesStore } from '@/store'
import { getCachedImageBitmap, loadImageBitmap, syncImageBitmapsToSlides } from '@/utils/imageBitmapCache'

export const useImageBitmap = (src: string): ImageBitmap | null => {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(() => (
    src ? getCachedImageBitmap(src) ?? null : null
  ))

  useEffect(() => {
    if (!src) {
      setBitmap(null)
      return
    }
    const hit = getCachedImageBitmap(src)
    if (hit) {
      setBitmap(hit)
      return
    }
    setBitmap(null)
    let cancelled = false
    loadImageBitmap(src).then(result => {
      if (!cancelled) setBitmap(result)
    })
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
