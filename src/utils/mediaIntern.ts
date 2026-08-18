import type { Slide } from '@/types/slides'

const DATA_URL_RE = /^data:/i
const BLOB_URL_RE = /^blob:/i

export const isDataUrl = (src: string) => DATA_URL_RE.test(src)
export const isBlobUrl = (src: string) => BLOB_URL_RE.test(src)

const blobUrlByDataUrl = new Map<string, string>()
const dataUrlByBlob = new Map<string, string>()
const blobByUrl = new Map<string, Blob>()
const jobs = new Map<string, Promise<string>>()
const internListeners = new Set<(from: string, to: string) => void>()

export const onMediaInterned = (fn: (from: string, to: string) => void) => {
  internListeners.add(fn)
  return () => { internListeners.delete(fn) }
}

/** Data URL and its blob: alias are the same bytes. */
export const bitmapSrcKeys = (src: string): string[] => {
  if (!src) return []
  const keys = [src]
  const interned = blobUrlByDataUrl.get(src)
  if (interned && interned !== src) keys.push(interned)
  const data = dataUrlByBlob.get(src)
  if (data && data !== src) keys.push(data)
  return keys
}

const notifyInterned = (from: string, to: string) => {
  if (from === to) return
  for (const fn of internListeners) fn(from, to)
}

export const getInternedBlob = (src: string): Blob | undefined => {
  if (!src) return undefined
  const direct = blobByUrl.get(src)
  if (direct) return direct
  const interned = blobUrlByDataUrl.get(src)
  return interned ? blobByUrl.get(interned) : undefined
}

/** Live interned data URL for a blob: src, or the original if it is already persistable. */
export const persistableMediaSrc = (src: string) => {
  if (!src || !isBlobUrl(src)) return src
  return dataUrlByBlob.get(src) ?? src
}

/**
 * Record an object URL created outside the intern layer (e.g. pasted video)
 * so `getInternedBlob` can still inline its bytes during export.
 */
export const registerMediaBlob = (url: string, blob: Blob) => {
  blobByUrl.set(url, blob)
}

const rewriteSrc = (src: string, map?: Map<string, string>) => {
  if (map?.has(src)) return map.get(src) as string
  return persistableMediaSrc(src)
}

export const rewritePersistableMediaSrcs = <T extends Slide>(slides: T[]): T[] => {
  for (const slide of slides) {
    if (slide.background?.type === 'image' && slide.background.image) {
      slide.background.image.src = rewriteSrc(slide.background.image.src)
    }
    for (const element of slide.elements || []) {
      if (element.type === 'image' && element.src) element.src = rewriteSrc(element.src)
      if (element.type === 'shape' && element.pattern) element.pattern = rewriteSrc(element.pattern)
      if (element.type === 'video' || element.type === 'audio') {
        if (element.src) element.src = rewriteSrc(element.src)
        if (element.type === 'video' && element.poster) element.poster = rewriteSrc(element.poster)
      }
    }
  }
  return slides
}

export const startInternSlideMedia = (slide: Slide) => {
  visitSlideMediaSrcs(slide, src => {
    if (isDataUrl(src)) void internMediaSrc(src)
  })
}

export const internMediaSrc = async (src: string): Promise<string> => {
  if (!src || !isDataUrl(src)) return src
  const hit = blobUrlByDataUrl.get(src)
  if (hit) return hit
  const existing = jobs.get(src)
  if (existing) return existing
  const job = (async () => {
    const response = await fetch(src)
    if (!response.ok) throw new Error(`intern media failed: ${response.status}`)
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    blobUrlByDataUrl.set(src, url)
    dataUrlByBlob.set(url, src)
    blobByUrl.set(url, blob)
    notifyInterned(src, url)
    return url
  })()
  jobs.set(src, job)
  try {
    return await job
  }
  finally {
    jobs.delete(src)
  }
}

export const visitSlideMediaSrcs = (slide: Slide, visit: (src: string) => void) => {
  if (slide.background?.type === 'image' && slide.background.image?.src) {
    visit(slide.background.image.src)
  }
  for (const element of slide.elements) {
    if (element.type === 'image' && element.src) visit(element.src)
    if (element.type === 'shape' && element.pattern) visit(element.pattern)
    if (element.type === 'video' || element.type === 'audio') {
      if (element.src) visit(element.src)
      if (element.poster) visit(element.poster)
    }
  }
}

export const collectSlideMediaSrcs = (slides: readonly Slide[]): string[] => {
  const srcs: string[] = []
  for (const slide of slides) visitSlideMediaSrcs(slide, src => srcs.push(src))
  return srcs
}

export const internSlidesMedia = async (slides: Slide[]) => {
  const unique = new Set<string>()
  for (const slide of slides) {
    visitSlideMediaSrcs(slide, src => {
      if (isDataUrl(src)) unique.add(src)
    })
  }
  if (!unique.size) return
  await Promise.all([...unique].map(src => internMediaSrc(src)))
}

export const resetMediaInternForTests = () => {
  for (const url of blobByUrl.keys()) URL.revokeObjectURL(url)
  blobUrlByDataUrl.clear()
  dataUrlByBlob.clear()
  blobByUrl.clear()
  jobs.clear()
}
