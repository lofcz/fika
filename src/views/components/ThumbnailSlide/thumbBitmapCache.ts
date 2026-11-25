import type { Slide, SlideTheme } from '@/types/slides'
import { htmlContainsMath } from '@/utils/math'
import {
  getElementFitScaleVersion,
  getScopedFontRevision,
  MATH_FONT_CHANGE_TOKEN,
  normalizeFontFamilyName,
} from '@/utils/textFit'

export type ThumbSurface = ImageBitmap | HTMLCanvasElement

type CacheEntry = {
  key: string
  surface: ThumbSurface
  bytes: number
  /** True when all async resources (images, math, charts) were ready at paint time. */
  complete: boolean
  /** Optional expiry timestamp (ms) for provisional pre-async frames; complete frames never expire. */
  expiresAt: number
  /** Optional `(slideId, pixelSize)` slot key so edited slides evict their superseded bitmap. */
  slideSizeKey?: string
}

/** 32 MB byte budget for cached thumbnail surfaces (~120–180 retina thumbnails). */
export const THUMB_BITMAP_CACHE_MAX_BYTES = 32 * 1024 * 1024

const cache = new Map<string, CacheEntry>()
const lastKeyBySlideAndSize = new Map<string, string>()
const evictionListeners = new Set<(key: string) => void>()
let totalBytes = 0
let cacheHits = 0
let cacheMisses = 0

export const subscribeThumbCacheEviction = (listener: (key: string) => void) => {
  evictionListeners.add(listener)
  return () => { evictionListeners.delete(listener) }
}

const objectIds = new WeakMap<object, number>()
let nextObjectId = 1
const idOf = (value: object | null | undefined): number => {
  if (!value || typeof value !== 'object') return 0
  let id = objectIds.get(value)
  if (!id) {
    id = nextObjectId++
    objectIds.set(value, id)
  }
  return id
}

const FONT_FAMILY_RE = /font-family\s*:\s*['"]?([^;'"<>]+)/gi

type SlidePaintMeta = {
  families: Set<string>
  hasMath: boolean
}

const slidePaintMetaCache = new WeakMap<Slide, SlidePaintMeta>()

const collectFamiliesFromHtml = (html: string | undefined, into: Set<string>) => {
  if (!html || !html.includes('font-family')) return
  FONT_FAMILY_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = FONT_FAMILY_RE.exec(html))) {
    const normalized = normalizeFontFamilyName(match[1])
    if (normalized) into.add(normalized)
  }
}

export const getSlidePaintMeta = (slide: Slide): SlidePaintMeta => {
  const cached = slidePaintMetaCache.get(slide)
  if (cached) return cached
  const families = new Set<string>()
  let hasMath = false
  for (const el of slide.elements) {
    if (el.type === 'latex') {
      hasMath = true
      continue
    }
    if (el.type === 'text') {
      const fam = normalizeFontFamilyName(el.defaultFontName)
      if (fam) families.add(fam)
      collectFamiliesFromHtml(el.content, families)
      if (!hasMath && htmlContainsMath(el.content)) hasMath = true
      continue
    }
    if (el.type === 'shape' && el.text) {
      const fam = normalizeFontFamilyName(el.text.defaultFontName)
      if (fam) families.add(fam)
      collectFamiliesFromHtml(el.text.content, families)
      if (!hasMath && htmlContainsMath(el.text.content)) hasMath = true
      continue
    }
    if (el.type === 'table') {
      for (const row of el.data) {
        for (const cell of row) {
          const fam = normalizeFontFamilyName(cell.style?.fontname)
          if (fam) families.add(fam)
          if (!hasMath && cell.text && (htmlContainsMath(cell.text) || cell.text.includes('$'))) {
            hasMath = true
          }
        }
      }
    }
  }
  const meta: SlidePaintMeta = { families, hasMath }
  slidePaintMetaCache.set(slide, meta)
  return meta
}

export const slideAffectedByFontChanges = (
  slide: Slide,
  themeFontName: string | undefined,
  changedFamilies: ReadonlySet<string> | undefined,
): boolean => {
  if (!changedFamilies || changedFamilies.size === 0) return true
  const meta = getSlidePaintMeta(slide)
  if (meta.hasMath) {
    if (changedFamilies.has(MATH_FONT_CHANGE_TOKEN)) return true
    for (const family of changedFamilies) {
      if (family.includes('katex')) return true
    }
  }
  const themeFamily = normalizeFontFamilyName(themeFontName)
  if (themeFamily && changedFamilies.has(themeFamily)) return true
  for (const family of meta.families) {
    if (changedFamilies.has(family)) return true
  }
  return false
}

const releaseSurface = (surface: ThumbSurface) => {
  if (typeof ImageBitmap !== 'undefined' && surface instanceof ImageBitmap) {
    surface.close()
  }
  else if ('width' in surface && 'height' in surface) {
    ;(surface as HTMLCanvasElement).width = 0
    ;(surface as HTMLCanvasElement).height = 0
  }
}

const deleteEntryQuietly = (key: string) => {
  const existing = cache.get(key)
  if (!existing) return
  cache.delete(key)
  if (existing.slideSizeKey && lastKeyBySlideAndSize.get(existing.slideSizeKey) === key) {
    lastKeyBySlideAndSize.delete(existing.slideSizeKey)
  }
  totalBytes = Math.max(0, totalBytes - existing.bytes)
  releaseSurface(existing.surface)
}

const evictOldestUntilFit = (incomingBytes: number, maxBytes: number) => {
  while (cache.size > 0 && totalBytes + incomingBytes > maxBytes) {
    const oldestKey = cache.keys().next().value
    if (oldestKey === undefined) break
    deleteEntryQuietly(oldestKey)
  }
}

export type ThumbPaintKeyInput = {
  slide: Slide
  theme: SlideTheme
  viewportSize: number
  viewportRatio: number
  pixelWidth: number
  pixelHeight: number
  showPlaceholders: boolean
}

export const buildThumbPaintKey = (input: ThumbPaintKeyInput): string => {
  const { slide, theme, viewportSize, viewportRatio, pixelWidth, pixelHeight, showPlaceholders } = input
  const meta = getSlidePaintMeta(slide)
  const themeFamily = normalizeFontFamilyName(theme.fontName)
  const families = themeFamily ? [themeFamily, ...meta.families] : meta.families
  const scopedFontRev = getScopedFontRevision(families, meta.hasMath)
  let fitSig = ''
  for (const el of slide.elements) {
    const ver = getElementFitScaleVersion(el.id)
    if (ver) fitSig += `${el.id}:${ver},`
  }
  return [
    slide.id,
    idOf(slide.elements),
    idOf(slide.background),
    slide.type ?? '',
    slide.skeleton ? 1 : 0,
    slide.aiRequestId ?? '',
    idOf(theme),
    viewportSize,
    viewportRatio,
    pixelWidth,
    pixelHeight,
    showPlaceholders ? 1 : 0,
    scopedFontRev,
    fitSig,
  ].join('\0')
}

export const getCachedThumbEntry = (key: string): { surface: ThumbSurface; complete: boolean } | undefined => {
  const entry = cache.get(key)
  if (!entry) {
    cacheMisses++
    return undefined
  }
  if (entry.expiresAt > 0 && performance.now() >= entry.expiresAt) {
    cache.delete(key)
    totalBytes = Math.max(0, totalBytes - entry.bytes)
    releaseSurface(entry.surface)
    cacheMisses++
    return undefined
  }
  cacheHits++
  cache.delete(key)
  cache.set(key, entry)
  return { surface: entry.surface, complete: entry.complete }
}

export const getCachedThumbSurface = (key: string): ThumbSurface | undefined => (
  getCachedThumbEntry(key)?.surface
)

export const putCachedThumbSurface = (
  key: string,
  surface: ThumbSurface,
  maxBytes = THUMB_BITMAP_CACHE_MAX_BYTES,
  ttlMs = 0,
  slideId?: string,
): boolean => {
  const width = surface.width
  const height = surface.height
  if (!(width > 0) || !(height > 0)) return false
  const bytes = width * height * 4
  if (bytes > maxBytes) {
    releaseSurface(surface)
    return false
  }
  const slideSizeKey = slideId ? `${slideId}\0${width}x${height}` : undefined
  if (slideSizeKey) {
    const supersededKey = lastKeyBySlideAndSize.get(slideSizeKey)
    if (supersededKey && supersededKey !== key) {
      deleteEntryQuietly(supersededKey)
    }
  }
  const existing = cache.get(key)
  if (existing) {
    cache.delete(key)
    totalBytes = Math.max(0, totalBytes - existing.bytes)
    if (existing.surface !== surface) releaseSurface(existing.surface)
  }
  evictOldestUntilFit(bytes, maxBytes)
  const expiresAt = ttlMs > 0 ? performance.now() + ttlMs : 0
  cache.set(key, { key, surface, bytes, complete: ttlMs === 0, expiresAt, slideSizeKey })
  if (slideSizeKey) lastKeyBySlideAndSize.set(slideSizeKey, key)
  totalBytes += bytes
  return true
}

/**
 * Snapshot a painted canvas into the byte-bounded LRU cache. Stores a detached
 * canvas synchronously (so immediate scroll remounts hit on the same frame),
 * then upgrades to an `ImageBitmap` on idle when supported. Incomplete frames
 * pass a short `ttlMs` so an errored async resource can never stay cached.
 */
export const putCachedThumbFromCanvas = (
  key: string,
  source: HTMLCanvasElement,
  ttlMs = 0,
  slideId?: string,
): void => {
  const width = source.width
  const height = source.height
  if (!(width > 0) || !(height > 0)) return
  const bytes = width * height * 4
  if (bytes > THUMB_BITMAP_CACHE_MAX_BYTES) return
  const copy = document.createElement('canvas')
  copy.width = width
  copy.height = height
  const ctx = copy.getContext('2d')
  if (!ctx) return
  ctx.drawImage(source, 0, 0)
  if (!putCachedThumbSurface(key, copy, THUMB_BITMAP_CACHE_MAX_BYTES, ttlMs, slideId)) return
  if (ttlMs === 0 && typeof createImageBitmap === 'function') {
    const upgrade = () => {
      const current = cache.get(key)
      if (!current || current.surface !== copy) return
      void createImageBitmap(copy).then(bitmap => {
        const latest = cache.get(key)
        if (!latest || latest.surface !== copy) {
          bitmap.close()
          return
        }
        latest.surface = bitmap
        copy.width = 0
        copy.height = 0
      }).catch(() => {})
    }
    if (typeof requestIdleCallback === 'function') requestIdleCallback(upgrade, { timeout: 150 })
    else setTimeout(upgrade, 32)
  }
}

export const blitCachedThumb = (
  target: HTMLCanvasElement,
  surface: ThumbSurface,
  pixelWidth: number,
  pixelHeight: number,
): boolean => {
  if (!(pixelWidth > 0) || !(pixelHeight > 0)) return false
  if (target.width !== pixelWidth) target.width = pixelWidth
  if (target.height !== pixelHeight) target.height = pixelHeight
  const ctx = target.getContext('2d', { alpha: false })
  if (!ctx) return false
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.drawImage(surface, 0, 0, pixelWidth, pixelHeight)
  return true
}

export const evictCachedThumb = (key: string): void => {
  deleteEntryQuietly(key)
  for (const listener of evictionListeners) listener(key)
}

export const clearThumbBitmapCache = (): void => {
  for (const entry of cache.values()) releaseSurface(entry.surface)
  cache.clear()
  lastKeyBySlideAndSize.clear()
  totalBytes = 0
  cacheHits = 0
  cacheMisses = 0
}

export const readThumbBitmapCacheStats = () => ({
  entries: cache.size,
  bytes: totalBytes,
  maxBytes: THUMB_BITMAP_CACHE_MAX_BYTES,
  hits: cacheHits,
  misses: cacheMisses,
})
