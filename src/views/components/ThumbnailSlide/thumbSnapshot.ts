/**
 * Identity-keyed bitmap snapshots for the editor thumbnail rail.
 *
 * A snapshot is captured from the LIVE thumbnail DOM (the real ScreenSlide
 * tree) via snapdom and is only ever displayed while its key still matches
 * the store: slide object identity, theme identity, viewport geometry and
 * thumb box. Immer preserves the identity of untouched slides, so any edit,
 * theme change or resize invalidates the key and the row falls back to
 * mounting the genuine live tree — a snapshot can never outlive the reality
 * it was captured from.
 *
 * A row that has been seen once renders its bitmap on every later visit:
 * scrolling a long rail is pure <img> swaps, no remounts. The virtualizer
 * pins a leaving live row until snapdom finishes, then tears it down.
 * Snapdom embeds ONLY the font families the captured subtree actually uses
 * (unused declared families are excluded explicitly). Slides whose capture
 * measures too slow are marked hostile and skipped — worst case those rows
 * keep their live tree on every visit.
 */
import { useSyncExternalStore } from 'react'

import { useSlidesStore } from '@/store'
import type { Slide } from '@/types/slides'
import { getPreviewDestSize, isPaneDragging } from '@/views/Editor/Thumbnails/paneSize'

export type ThumbSnapshot = {
  url: string
  cssWidth: number
  cssHeight: number
}

export type ThumbSnapshotDeps = {
  slideId: string
  slide: Slide | undefined
  theme: unknown
  viewportRatio: number
  viewportSize: number
  cssWidth: number
  dpr: number
}

const MAX_SNAPSHOTS = 128
const HOSTILE_CAPTURE_MS = 1000
const RAIL_IDLE_MS = 350
const FONT_LOAD_TIMEOUT_MS = 3000

const entries = new Map<string, { entry: ThumbSnapshot; deps: ThumbSnapshotDeps }>()
const hostile = new Set<string>()
const captureFails = new Map<string, number>()
const MAX_CAPTURE_FAILS = 3

export const thumbSnapshotStats = {
  hits: 0,
  misses: 0,
  captures: 0,
  failed: 0,
  hostileSkips: 0,
  evictions: 0,
  invalidated: 0,
  captureMs: [] as number[],
}

let version = 0
const listeners = new Set<() => void>()
const bump = () => {
  version++
  for (const listener of listeners) listener()
}
const subscribeVersion = (listener: () => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
const readVersion = () => version

/** Re-render when snapshots arrive or are cleared. */
export const useThumbSnapshotVersion = () => useSyncExternalStore(subscribeVersion, readVersion, readVersion)

const depsEqual = (a: ThumbSnapshotDeps, b: ThumbSnapshotDeps) => (
  a.slideId === b.slideId
  && a.slide === b.slide
  && a.theme === b.theme
  && a.viewportRatio === b.viewportRatio
  && a.viewportSize === b.viewportSize
  && a.cssWidth === b.cssWidth
  && a.dpr === b.dpr
)

const revokeUrl = (url: string) => {
  try { URL.revokeObjectURL(url) }
  catch { /* already gone */ }
}

const dropEntry = (slideId: string) => {
  const held = entries.get(slideId)
  if (!held) return
  entries.delete(slideId)
  revokeUrl(held.entry.url)
}

/**
 * Fresh lookup for the current render. A stored snapshot whose key no longer
 * matches is revoked on the spot — stale pixels are never handed out.
 */
export function lookupThumbSnapshot(deps: ThumbSnapshotDeps): ThumbSnapshot | null {
  const held = entries.get(deps.slideId)
  if (!held) {
    thumbSnapshotStats.misses++
    return null
  }
  if (!depsEqual(held.deps, deps)) {
    dropEntry(deps.slideId)
    thumbSnapshotStats.misses++
    thumbSnapshotStats.invalidated++
    return null
  }
  entries.delete(deps.slideId)
  entries.set(deps.slideId, held)
  thumbSnapshotStats.hits++
  return held.entry
}

function rememberThumbSnapshot(deps: ThumbSnapshotDeps, entry: ThumbSnapshot) {
  dropEntry(deps.slideId)
  entries.set(deps.slideId, { entry, deps })
  while (entries.size > MAX_SNAPSHOTS) {
    const oldest = entries.keys().next().value
    if (oldest === undefined) break
    dropEntry(oldest)
    thumbSnapshotStats.evictions++
  }
  // Rows currently showing the live tree swap to the (pixel-identical)
  // bitmap and free it; rows mount cheaply on their next visit.
  bump()
}

export function clearThumbSnapshots() {
  for (const id of [...entries.keys()]) dropEntry(id)
  captureFails.clear()
  bump()
}

// ---------------------------------------------------------------------------
// Background sweep support: pick the next slide worth capturing offscreen.
// ---------------------------------------------------------------------------

type SweepGeometry = { cssWidth: number; dpr: number }

const sweepDepsFor = (slide: Slide, dest: SweepGeometry): ThumbSnapshotDeps => {
  const state = useSlidesStore.getState()
  return {
    slideId: slide.id,
    slide,
    theme: state.theme,
    viewportRatio: state.viewportRatio,
    viewportSize: state.viewportSize,
    cssWidth: dest.cssWidth,
    dpr: dest.dpr,
  }
}

export function hasFreshSnapshotFor(slideId: string): boolean {
  const held = entries.get(slideId)
  if (!held) return false
  const slide = useSlidesStore.getState().slides.find(item => item.id === slideId)
  if (!slide) return false
  return depsEqual(held.deps, sweepDepsFor(slide, { cssWidth: held.deps.cssWidth, dpr: held.deps.dpr }))
}

export function canCaptureThumb(slideId: string): boolean {
  if (hostile.has(slideId)) return false
  return (captureFails.get(slideId) || 0) < MAX_CAPTURE_FAILS
}

// ---------------------------------------------------------------------------
// Rail scroll idleness: mid-scroll idle captures must not run.
// ---------------------------------------------------------------------------

let lastRailScrollAt = -1e9
if (typeof window !== 'undefined') {
  document.addEventListener('scroll', event => {
    const target = event.target
    if (target instanceof Element && target.closest('.thumbnail-list')) {
      lastRailScrollAt = performance.now()
    }
  }, { capture: true, passive: true })
}

export const isRailScrollIdle = () => performance.now() - lastRailScrollAt >= RAIL_IDLE_MS

// ---------------------------------------------------------------------------
// Fonts: snapdom embeds the families the subtree uses; every OTHER declared
// family is excluded explicitly so the capture stays minimal and fast.
// ---------------------------------------------------------------------------

const GENERIC_FAMILIES = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui',
  'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'math', 'emoji',
  'fangsong', 'inherit', 'initial', 'unset', 'revert',
])

function declaredFontFamilies(): string[] {
  const found = new Set<string>()
  try {
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList
      try { rules = sheet.cssRules }
      catch { continue }
      for (const rule of Array.from(rules)) {
        if (!(rule instanceof CSSFontFaceRule)) continue
        const family = rule.cssText.match(/font-family:\s*([^;}]+)/)?.[1]?.trim().replace(/^['"]|['"]$/g, '')
        if (family) found.add(family)
      }
    }
  }
  catch { /* keep what was collected */ }
  return [...found]
}

function usedFontFamilies(node: HTMLElement): Set<string> {
  const families = new Set<string>()
  const collect = (element: Element) => {
    const raw = getComputedStyle(element).fontFamily
    if (!raw) return
    for (const part of raw.split(',')) {
      const name = part.trim().replace(/^['"]|['"]$/g, '')
      if (name && !GENERIC_FAMILIES.has(name.toLowerCase())) families.add(name)
    }
  }
  collect(node)
  for (const element of node.querySelectorAll('*')) collect(element)
  return families
}

// ---------------------------------------------------------------------------
// The virtualizer enqueues a teardown capture while the leaving row is
// still pinned. The queue is single-flight so snapdom never overlaps.
// ---------------------------------------------------------------------------

const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))

const withTimeout = (promise: Promise<unknown>, ms: number) => (
  Promise.race([promise, new Promise(resolve => setTimeout(resolve, ms))])
)

// ---------------------------------------------------------------------------
// Capture queue: single-flight, idle-scheduled, skipped while scrolling or
// dragging the pane gutter.
// ---------------------------------------------------------------------------

type CaptureJob = {
  deps: ThumbSnapshotDeps
  getNode: () => HTMLElement | null
  attempts: number
  urgent: boolean
  done?: (ok: boolean) => void
}

const queue: CaptureJob[] = []
let draining = false
let inFlight: CaptureJob | null = null

const finishJob = (job: CaptureJob, ok: boolean) => {
  const done = job.done
  job.done = undefined
  done?.(ok)
}

const enqueueCapture = (deps: ThumbSnapshotDeps, getNode: () => HTMLElement | null, urgent: boolean, done?: (ok: boolean) => void) => {
  if (typeof window === 'undefined') {
    done?.(false)
    return
  }
  if (hostile.has(deps.slideId)) {
    thumbSnapshotStats.hostileSkips++
    done?.(false)
    return
  }
  const held = entries.get(deps.slideId)
  if (held && depsEqual(held.deps, deps)) {
    done?.(true)
    return
  }
  if (inFlight && inFlight.deps.slideId === deps.slideId) {
    inFlight.deps = deps
    inFlight.getNode = getNode
    inFlight.urgent = inFlight.urgent || urgent
    if (done) {
      const prev = inFlight.done
      inFlight.done = ok => {
        prev?.(ok)
        done(ok)
      }
    }
    return
  }
  const pending = queue.find(job => job.deps.slideId === deps.slideId)
  if (pending) {
    pending.deps = deps
    pending.getNode = getNode
    pending.urgent = pending.urgent || urgent
    if (done) {
      const prev = pending.done
      pending.done = ok => {
        prev?.(ok)
        done(ok)
      }
    }
    drainQueue()
    return
  }
  const job: CaptureJob = { deps, getNode, attempts: 0, urgent, done }
  if (urgent) queue.unshift(job)
  else queue.push(job)
  drainQueue()
}

export function requestThumbCapture(deps: ThumbSnapshotDeps, getNode: () => HTMLElement | null) {
  enqueueCapture(deps, getNode, false)
}

/** Screenshot a live thumb now — used before the virtualizer tears the row down. */
export function requestTeardownCapture(deps: ThumbSnapshotDeps, getNode: () => HTMLElement | null): Promise<boolean> {
  return new Promise(resolve => enqueueCapture(deps, getNode, true, resolve))
}

export function teardownThumbSnapshot(slideId: string, getNode: () => HTMLElement | null): Promise<boolean> {
  const slide = useSlidesStore.getState().slides.find(item => item.id === slideId)
  if (!slide) return Promise.resolve(false)
  const dest = getPreviewDestSize()
  return requestTeardownCapture(sweepDepsFor(slide, dest), getNode)
}

const drainQueue = () => {
  if (draining) return
  const urgentAt = queue.findIndex(job => job.urgent)
  const job = urgentAt >= 0 ? queue.splice(urgentAt, 1)[0] : queue.shift()
  if (!job) return
  draining = true
  const run = () => {
    runCapture(job).finally(() => {
      draining = false
      drainQueue()
    })
  }
  if (job.urgent) {
    run()
    return
  }
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 1500 })
  else setTimeout(run, 200)
}

const runCapture = async (job: CaptureJob) => {
  inFlight = job
  let ok = false
  let recycled = false
  try {
    const node = job.getNode()
    if (!node || !node.isConnected) return
    if (!job.urgent && (isPaneDragging() || !isRailScrollIdle())) {
      recycled = true
      queue.push(job)
      return
    }

    if (!job.urgent && document.fonts) {
      await withTimeout(document.fonts.ready, FONT_LOAD_TIMEOUT_MS)
      const declared = declaredFontFamilies()
      const used = usedFontFamilies(node)
      const declaredUsed = [...used].filter(family => declared.some(d => d.toLowerCase() === family.toLowerCase()))
      await Promise.all(declaredUsed.map(family => (
        withTimeout(document.fonts.load(`16px "${family}"`).catch(() => {}), FONT_LOAD_TIMEOUT_MS)
      )))
    }
    await nextFrame()
    await nextFrame()

    if (!node.isConnected) return
    const declared = declaredFontFamilies()
    const used = usedFontFamilies(node)
    const unusedFamilies = declared.filter(family => (
      ![...used].some(u => u.toLowerCase() === family.toLowerCase())
    ))
    const { snapdom } = await import('@zumer/snapdom')
    const captureStart = performance.now()
    const blob = await snapdom.toBlob(node, {
      type: 'png',
      dpr: Math.min(window.devicePixelRatio || 1, 2),
      embedFonts: true,
      excludeFonts: unusedFamilies.length ? { families: unusedFamilies } : undefined,
      compress: true,
      fast: true,
    })
    const captureMs = Math.round(performance.now() - captureStart)
    thumbSnapshotStats.captureMs.push(captureMs)
    if (thumbSnapshotStats.captureMs.length > 200) thumbSnapshotStats.captureMs.shift()
    if (!blob || !blob.size) {
      if (import.meta.env.MODE === 'development') {
        console.warn('[thumbSnapshot] snapdom produced nothing', { slideId: job.deps.slideId, connected: node.isConnected, w: node.clientWidth, h: node.clientHeight })
      }
      thumbSnapshotStats.failed++
      captureFails.set(job.deps.slideId, (captureFails.get(job.deps.slideId) || 0) + 1)
      return
    }
    if (captureMs > HOSTILE_CAPTURE_MS) hostile.add(job.deps.slideId)
    captureFails.delete(job.deps.slideId)
    thumbSnapshotStats.captures++
    rememberThumbSnapshot(job.deps, {
      url: URL.createObjectURL(blob),
      cssWidth: node.clientWidth,
      cssHeight: node.clientHeight,
    })
    ok = true
  }
  catch (error) {
    if (import.meta.env.MODE === 'development') console.warn('[thumbSnapshot] capture failed:', error)
    thumbSnapshotStats.failed++
    captureFails.set(job.deps.slideId, (captureFails.get(job.deps.slideId) || 0) + 1)
  }
  finally {
    if (inFlight === job) inFlight = null
    if (!recycled) finishJob(job, ok)
  }
}

export const readThumbSnapshotReport = () => {
  const ms = thumbSnapshotStats.captureMs
  return {
    ...thumbSnapshotStats,
    captureMs: [...ms],
    captureMsAvg: ms.length ? Math.round(ms.reduce((sum, value) => sum + value, 0) / ms.length) : 0,
    captureMsMax: ms.length ? Math.max(...ms) : 0,
    cached: entries.size,
    hostile: hostile.size,
  }
}

if (typeof window !== 'undefined' && import.meta.env.MODE === 'development') {
    Object.assign(window, {
      __FIKA_THUMB_SNAP__: {
        read: readThumbSnapshotReport,
        clear: () => {
          clearThumbSnapshots()
          hostile.clear()
        },
        debug: () => ({ version, listenerCount: listeners.size, queue: queue.length, draining, keys: [...entries.keys()] }),
        poke: () => bump(),
      },
    })
}
