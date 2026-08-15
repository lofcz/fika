import type { Slide } from '@/types/slides'

const MAX_ENTRIES = 128
const EMPTY: Promise<ImageBitmap | null> = Promise.resolve(null)

const bitmaps = new Map<string, ImageBitmap>()
const jobs = new Map<string, Promise<ImageBitmap | null>>()
const order: string[] = []

const drop = (src: string) => {
  bitmaps.get(src)?.close()
  bitmaps.delete(src)
  jobs.delete(src)
  const at = order.indexOf(src)
  if (at >= 0) order.splice(at, 1)
}

const touch = (src: string) => {
  const at = order.indexOf(src)
  if (at >= 0) order.splice(at, 1)
  order.push(src)
  while (order.length > MAX_ENTRIES) {
    const evict = order.shift()
    if (!evict || evict === src) break
    drop(evict)
  }
}

export const getCachedImageBitmap = (src: string): ImageBitmap | undefined => {
  const bitmap = bitmaps.get(src)
  if (bitmap) touch(src)
  return bitmap
}

export const loadImageBitmap = (src: string): Promise<ImageBitmap | null> => {
  if (!src) return EMPTY
  const existing = jobs.get(src)
  if (existing) {
    if (bitmaps.has(src)) touch(src)
    return existing
  }
  const job = (async () => {
    try {
      const response = await fetch(src)
      if (!response.ok) {
        jobs.delete(src)
        return null
      }
      const blob = await response.blob()
      const bitmap = await createImageBitmap(blob)
      if (!jobs.has(src)) {
        bitmap.close()
        return null
      }
      bitmaps.set(src, bitmap)
      touch(src)
      return bitmap
    }
    catch {
      jobs.delete(src)
      return null
    }
  })()
  jobs.set(src, job)
  return job
}

export const collectSlideImageSrcs = (slides: readonly Slide[]): string[] => {
  const srcs: string[] = []
  for (const slide of slides) {
    if (slide.background?.type === 'image' && slide.background.image?.src) {
      srcs.push(slide.background.image.src)
    }
    for (const element of slide.elements) {
      if (element.type === 'image' && element.src) srcs.push(element.src)
      if ((element.type === 'video' || element.type === 'audio') && element.poster) {
        srcs.push(element.poster)
      }
    }
  }
  return srcs
}

export const revokeImageBitmapsNotIn = (keep: Iterable<string>) => {
  const retain = new Set(keep)
  for (const src of [...bitmaps.keys()]) {
    if (retain.has(src)) continue
    drop(src)
  }
}

export const syncImageBitmapsToSlides = (slides: readonly Slide[]) => {
  revokeImageBitmapsNotIn(collectSlideImageSrcs(slides))
}
