import type { Slide } from '@/types/slides'
import { bitmapSrcKeys, getInternedBlob, internMediaSrc, isDataUrl, onMediaInterned } from './mediaIntern'
import { readImageSize, resizeToMaxEdge } from './imageSize'

export const PREVIEW_BITMAP_MAX_EDGE = 512
export const PREVIEW_BITMAP_CACHE_MAX = 640
export const FULL_BITMAP_CACHE_MAX = 64

export type LoadImageBitmapOptions = {
  maxEdge?: number
}

type BitmapTier = 'full' | 'thumb'

type CacheEntry = {
  src: string
  tier: BitmapTier
  maxEdge: number
  bitmap: ImageBitmap
}

const EMPTY: Promise<ImageBitmap | null> = Promise.resolve(null)
const fulls = new Map<string, CacheEntry>()
const thumbs = new Map<string, CacheEntry>()
const fullOrder: string[] = []
const thumbOrder: string[] = []
const jobs = new Map<string, Promise<ImageBitmap | null>>()
const blobJobs = new Map<string, Promise<Blob | null>>()

const jobKey = (src: string, maxEdge?: number) => (
  maxEdge ? `thumb:${maxEdge}:${src}` : `full:${src}`
)

const thumbKey = (src: string, maxEdge: number) => `${maxEdge}\n${src}`

const storeOf = (tier: BitmapTier) => (tier === 'full' ? fulls : thumbs)
const orderOf = (tier: BitmapTier) => (tier === 'full' ? fullOrder : thumbOrder)
const limitOf = (tier: BitmapTier) => (tier === 'full' ? FULL_BITMAP_CACHE_MAX : PREVIEW_BITMAP_CACHE_MAX)

const mapKey = (entry: Pick<CacheEntry, 'src' | 'tier' | 'maxEdge'>) => (
  entry.tier === 'full' ? entry.src : thumbKey(entry.src, entry.maxEdge)
)

const srcHasBitmap = (src: string) => {
  for (const key of bitmapSrcKeys(src)) {
    if (fulls.has(key)) return true
    for (const entry of thumbs.values()) {
      if (entry.src === key) return true
    }
  }
  return false
}

const bitmapHeldElsewhere = (bitmap: ImageBitmap, skip: CacheEntry) => {
  for (const entry of fulls.values()) {
    if (entry !== skip && entry.bitmap === bitmap) return true
  }
  for (const entry of thumbs.values()) {
    if (entry !== skip && entry.bitmap === bitmap) return true
  }
  return false
}

const dropEntry = (entry: CacheEntry) => {
  if (!bitmapHeldElsewhere(entry.bitmap, entry)) entry.bitmap.close()
  storeOf(entry.tier).delete(mapKey(entry))
  jobs.delete(jobKey(entry.src, entry.tier === 'full' ? undefined : entry.maxEdge))
  if (!srcHasBitmap(entry.src)) blobJobs.delete(entry.src)
  const order = orderOf(entry.tier)
  const key = mapKey(entry)
  const at = order.indexOf(key)
  if (at >= 0) order.splice(at, 1)
}

const touch = (entry: CacheEntry) => {
  const key = mapKey(entry)
  const order = orderOf(entry.tier)
  const at = order.indexOf(key)
  if (at >= 0) order.splice(at, 1)
  order.push(key)
  const store = storeOf(entry.tier)
  while (order.length > limitOf(entry.tier)) {
    const evictKey = order.shift()
    if (!evictKey || evictKey === key) break
    const evict = store.get(evictKey)
    if (evict) dropEntry(evict)
  }
}

const previewListeners = new Set<(src: string) => void>()

export const subscribePreviewBitmaps = (fn: (src: string) => void) => {
  previewListeners.add(fn)
  return () => { previewListeners.delete(fn) }
}

const notifyPreview = (src: string) => {
  for (const key of bitmapSrcKeys(src)) {
    for (const fn of previewListeners) fn(key)
  }
}

const remember = (src: string, bitmap: ImageBitmap, maxEdge?: number) => {
  const entry: CacheEntry = {
    src,
    tier: maxEdge ? 'thumb' : 'full',
    maxEdge: maxEdge || 0,
    bitmap,
  }
  const prev = storeOf(entry.tier).get(mapKey(entry))
  if (prev && prev.bitmap !== bitmap && !bitmapHeldElsewhere(prev.bitmap, prev)) prev.bitmap.close()
  const isNew = !prev || prev.bitmap !== bitmap
  storeOf(entry.tier).set(mapKey(entry), entry)
  touch(entry)
  if (maxEdge && isNew) notifyPreview(src)
}

const cachedEntry = (src: string, maxEdge?: number): CacheEntry | undefined => {
  for (const key of bitmapSrcKeys(src)) {
    if (maxEdge) {
      const thumb = thumbs.get(thumbKey(key, maxEdge))
      if (thumb) return thumb
      const full = fulls.get(key)
      if (full) return full
    }
    else {
      const full = fulls.get(key)
      if (full) return full
    }
  }
  return undefined
}

export const getCachedImageBitmap = (src: string, options?: LoadImageBitmapOptions): ImageBitmap | undefined => {
  if (!src) return undefined
  const entry = cachedEntry(src, options?.maxEdge)
  if (!entry) return undefined
  touch(entry)
  return entry.bitmap
}

export const previewPaintHasMedia = (painted: Set<string> | undefined, srcs: readonly string[]) => (
  !!painted && srcs.every(src => !src || bitmapSrcKeys(src).some(key => painted.has(key)))
)
const loadBlob = (src: string): Promise<Blob | null> => {
  const interned = getInternedBlob(src)
  if (interned) return Promise.resolve(interned)
  const existing = blobJobs.get(src)
  if (existing) return existing
  const job = (async () => {
    try {
      if (isDataUrl(src)) {
        const url = await internMediaSrc(src)
        return getInternedBlob(url) ?? null
      }
      const response = await fetch(src)
      if (!response.ok) {
        blobJobs.delete(src)
        return null
      }
      return await response.blob()
    }
    catch {
      blobJobs.delete(src)
      return null
    }
  })()
  blobJobs.set(src, job)
  return job
}

const pendingPreviewJobs = () => {
  const pending: Promise<ImageBitmap | null>[] = []
  for (const [key, job] of jobs) {
    if (key.startsWith('thumb:')) pending.push(job)
  }
  return pending
}

const decodeBlob = async (blob: Blob, maxEdge?: number) => {
  if (!maxEdge) return createImageBitmap(blob)
  const header = new Uint8Array(await blob.slice(0, 64 * 1024).arrayBuffer())
  const size = readImageSize(header)
  if (size) {
    const next = resizeToMaxEdge(size.width, size.height, maxEdge)
    if (next.width === size.width && next.height === size.height) return createImageBitmap(blob)
    return createImageBitmap(blob, {
      resizeWidth: next.width,
      resizeHeight: next.height,
      resizeQuality: 'low',
    })
  }
  return createImageBitmap(blob, { resizeWidth: maxEdge, resizeQuality: 'low' })
}

export const loadImageBitmap = (src: string, options?: LoadImageBitmapOptions): Promise<ImageBitmap | null> => {
  if (!src) return EMPTY
  const maxEdge = options?.maxEdge
  const hit = cachedEntry(src, maxEdge)
  if (hit) {
    touch(hit)
    if (maxEdge && hit.tier === 'full') {
      const next = resizeToMaxEdge(hit.bitmap.width, hit.bitmap.height, maxEdge)
      if (next.width === hit.bitmap.width) {
        remember(src, hit.bitmap, maxEdge)
        return Promise.resolve(hit.bitmap)
      }
    }
    else {
      return Promise.resolve(hit.bitmap)
    }
  }
  const key = jobKey(src, maxEdge)
  const existing = jobs.get(key)
  if (existing) return existing
  const job = (async () => {
    try {
      if (!maxEdge) {
        const preview = pendingPreviewJobs()
        if (preview.length) await Promise.all(preview)
      }
      if (maxEdge) {
        const full = cachedEntry(src)?.bitmap
        if (full) {
          const next = resizeToMaxEdge(full.width, full.height, maxEdge)
          const bitmap = next.width === full.width
            ? full
            : await createImageBitmap(full, {
              resizeWidth: next.width,
              resizeHeight: next.height,
              resizeQuality: 'low',
            })
          remember(src, bitmap, maxEdge)
          return bitmap
        }
      }
      const blob = await loadBlob(src)
      if (!blob) {
        jobs.delete(key)
        return null
      }
      const bitmap = await decodeBlob(blob, maxEdge)
      remember(src, bitmap, maxEdge)
      return bitmap
    }
    catch {
      jobs.delete(key)
      return null
    }
  })()
  jobs.set(key, job)
  return job
}

export const loadPreviewImageBitmap = (src: string) => (
  loadImageBitmap(src, { maxEdge: PREVIEW_BITMAP_MAX_EDGE })
)

export const getCachedPreviewImageBitmap = (src: string) => (
  getCachedImageBitmap(src, { maxEdge: PREVIEW_BITMAP_MAX_EDGE })
)

export const collectSlidePreviewSrcs = (slide: Slide): string[] => {
  const srcs: string[] = []
  if (slide.background?.type === 'image' && slide.background.image?.src) {
    srcs.push(slide.background.image.src)
  }
  for (const element of slide.elements) {
    if (element.type === 'image' && element.src) srcs.push(element.src)
    if ((element.type === 'video' || element.type === 'audio') && element.poster) {
      srcs.push(element.poster)
    }
    if (element.type === 'shape' && element.pattern) srcs.push(element.pattern)
  }
  return srcs
}

export const collectSlideImageSrcs = (slides: readonly Slide[]): string[] => {
  const srcs: string[] = []
  for (const slide of slides) {
    for (const src of collectSlidePreviewSrcs(slide)) srcs.push(src)
  }
  return srcs
}

export const prefetchPreviewImageBitmaps = (srcs: readonly string[]) => {
  for (const src of srcs) {
    if (src) void loadPreviewImageBitmap(src)
  }
}

export const revokeImageBitmapsNotIn = (keep: Iterable<string>) => {
  const retain = new Set(keep)
  for (const entry of [...fulls.values()]) {
    if (!retain.has(entry.src)) dropEntry(entry)
  }
  for (const entry of [...thumbs.values()]) {
    if (!retain.has(entry.src)) dropEntry(entry)
  }
  for (const src of blobJobs.keys()) {
    if (!retain.has(src)) blobJobs.delete(src)
  }
}

export const syncImageBitmapsToSlides = (slides: readonly Slide[]) => {
  revokeImageBitmapsNotIn(collectSlideImageSrcs(slides))
}

const rekeyEntrySrc = (from: string, to: string) => {
  if (!from || !to || from === to) return
  const full = fulls.get(from)
  if (full && !fulls.has(to)) {
    fulls.delete(from)
    full.src = to
    fulls.set(to, full)
    const at = fullOrder.indexOf(from)
    if (at >= 0) fullOrder[at] = to
    const fullJob = jobs.get(jobKey(from))
    if (fullJob && !jobs.has(jobKey(to))) {
      jobs.delete(jobKey(from))
      jobs.set(jobKey(to), fullJob)
    }
  }
  for (const entry of [...thumbs.values()]) {
    if (entry.src !== from) continue
    const oldKey = thumbKey(from, entry.maxEdge)
    const newKey = thumbKey(to, entry.maxEdge)
    if (thumbs.has(newKey)) continue
    thumbs.delete(oldKey)
    entry.src = to
    thumbs.set(newKey, entry)
    const at = thumbOrder.indexOf(oldKey)
    if (at >= 0) thumbOrder[at] = newKey
    const thumbJob = jobs.get(jobKey(from, entry.maxEdge))
    if (thumbJob && !jobs.has(jobKey(to, entry.maxEdge))) {
      jobs.delete(jobKey(from, entry.maxEdge))
      jobs.set(jobKey(to, entry.maxEdge), thumbJob)
    }
  }
  const blobJob = blobJobs.get(from)
  if (blobJob && !blobJobs.has(to)) {
    blobJobs.delete(from)
    blobJobs.set(to, blobJob)
  }
  notifyPreview(to)
}

onMediaInterned(rekeyEntrySrc)
