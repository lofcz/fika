import type { PPTChartElement, PPTCodeElement, PPTLatexElement, PPTMermaidElement } from '@/types/slides'
import { getChartOption, expandChartThemeColors } from '@/views/components/element/ChartElement/chartOption'
import { isLightCodeTheme } from '@/configs/code'
import { LATEX_ELEMENT_FONT_SIZE, ensureMathliveReady, renderLatexElementHtml, renderMathToHtml } from '@/utils/math'
import { MATH_FONT_CHANGE_TOKEN, subscribeTextFontChanges } from '@/utils/textFit'
import { EMBED_ROOT_CLASS, MATH_PROBE_ATTR } from '@/utils/portal'
import { captureMathHostDirectSvg, hasMathliveStaticRules } from './mathSvgRaster'

type EchartsCore = typeof import('./echartsRuntime').default
let echartsLoader: Promise<EchartsCore> | null = null
const loadEcharts = (): Promise<EchartsCore> => {
  if (!echartsLoader) {
    echartsLoader = import('./echartsRuntime')
      .then(mod => mod.default)
      .catch(err => {
        echartsLoader = null
        throw err
      })
  }
  return echartsLoader
}

/** Preload the lazy ECharts canvas runtime before tight headless export deadlines. */
export const preloadEcharts = (): Promise<void> => loadEcharts().then(() => undefined)

type Raster = ImageBitmap | HTMLCanvasElement
type RasterProducer = () => Promise<Raster | null> | Raster | null

export type RasterPriority = 'export' | 'visible' | 'overscan'

type WorkItem = {
  key: string
  produce: RasterProducer
  resolve: (value: Raster | null) => void
  exportUrgent: boolean
  /** Mounted thumbnail owners currently awaiting this job. */
  owners: Set<string>
  /** True only when requested exclusively by tracked thumbnail owners (safe to drop on unmount). */
  ownerTracked: boolean
  seq: number
}

export type RasterDiagnostics = {
  completed: number
  droppedUnmounted: number
  directSvgHits: number
  snapdomFallbacks: number
  rejectEmptyDimensions: number
  rejectBounds: number
  rejectCaptureError: number
  rejectNoInk: number
  rejectRetryCapHit: number
  lastRejections: Array<{ reason: string; latex: string; width?: number; height?: number; size?: number }>
}

const RASTER_CACHE_MAX = 512
const rasters = new Map<string, Raster>()
const jobs = new Map<string, Promise<Raster | null>>()
const listeners = new Map<string, Set<() => void>>()
const workQueue: WorkItem[] = []
const ownerPriorities = new Map<string, 'visible' | 'overscan'>()
const ownerListeners = new Map<string, Map<string, () => void>>()
const scrollIdleListeners = new Set<() => void>()

const rasterDiagnostics: RasterDiagnostics = {
  completed: 0,
  droppedUnmounted: 0,
  directSvgHits: 0,
  snapdomFallbacks: 0,
  rejectEmptyDimensions: 0,
  rejectBounds: 0,
  rejectCaptureError: 0,
  rejectNoInk: 0,
  rejectRetryCapHit: 0,
  lastRejections: [],
}

const recordRejection = (reason: keyof Pick<
  RasterDiagnostics,
  'rejectEmptyDimensions' | 'rejectBounds' | 'rejectCaptureError' | 'rejectNoInk' | 'rejectRetryCapHit'
>, latex: string, detail?: { width?: number; height?: number; size?: number }) => {
  rasterDiagnostics[reason]++
  rasterDiagnostics.lastRejections.push({ reason, latex, ...detail })
  if (rasterDiagnostics.lastRejections.length > 24) rasterDiagnostics.lastRejections.shift()
}

export const readRasterDiagnostics = (): RasterDiagnostics & { queued: number; inFlight: number; scrollActive: boolean; cacheSize: number } => ({
  ...rasterDiagnostics,
  lastRejections: rasterDiagnostics.lastRejections.slice(),
  queued: workQueue.length,
  inFlight,
  scrollActive,
  cacheSize: rasters.size,
})

export const resetRasterDiagnostics = () => {
  rasterDiagnostics.completed = 0
  rasterDiagnostics.droppedUnmounted = 0
  rasterDiagnostics.directSvgHits = 0
  rasterDiagnostics.snapdomFallbacks = 0
  rasterDiagnostics.rejectEmptyDimensions = 0
  rasterDiagnostics.rejectBounds = 0
  rasterDiagnostics.rejectCaptureError = 0
  rasterDiagnostics.rejectNoInk = 0
  rasterDiagnostics.rejectRetryCapHit = 0
  rasterDiagnostics.lastRejections.length = 0
}

/**
 * Producers mostly await (SnapDOM serialization, SVG image decode), so up to
 * MAX_IN_FLIGHT overlap that latency. During active thumbnail scrolling we
 * pause launching new non-export captures until 150ms after the last scroll
 * event (debounced — never latched), then immediately drain visible thumbs
 * first, overscan second, and drop queued jobs for unmounted thumbs.
 */
const MAX_IN_FLIGHT = 4
const SCROLL_IDLE_MS = 150
let inFlight = 0
let scrollActive = false
let scrollIdleTimer = 0
let nextWorkSeq = 1
/** Set while a paint runs: jobs that paint is waiting for (see `collectRasterJobs`). */
let collecting: Map<string, Promise<Raster | null>> | null = null
/** Active thumbnail owner context during `paintSlideToCanvas`. */
let activeOwner: { id: string; priority: 'visible' | 'overscan' } | null = null
/** Pending raster keys per thumbnail owner (both queued and in-flight). */
const ownerPendingKeys = new Map<string, Set<string>>()

export const hasPendingRastersForOwner = (ownerId: string): boolean => {
  const keys = ownerPendingKeys.get(ownerId)
  return !!keys && keys.size > 0
}

export const isThumbnailScrolling = () => scrollActive

export const subscribeThumbnailScrollIdle = (listener: () => void) => {
  scrollIdleListeners.add(listener)
  return () => { scrollIdleListeners.delete(listener) }
}

export const notifyThumbnailScrollActivity = () => {
  if (typeof window === 'undefined') return
  scrollActive = true
  if (scrollIdleTimer) window.clearTimeout(scrollIdleTimer)
  scrollIdleTimer = window.setTimeout(() => {
    scrollIdleTimer = 0
    scrollActive = false
    for (const listener of Array.from(scrollIdleListeners)) listener()
    drain()
  }, SCROLL_IDLE_MS)
}

export const withRasterRequestContext = <T>(
  ownerId: string,
  priority: 'visible' | 'overscan',
  paint: () => T,
): T => {
  const prev = activeOwner
  ownerPriorities.set(ownerId, priority)
  activeOwner = { id: ownerId, priority }
  try {
    return paint()
  }
  finally {
    activeOwner = prev
  }
}

export const updateRasterOwnerPriority = (ownerId: string, priority: 'visible' | 'overscan') => {
  const prev = ownerPriorities.get(ownerId)
  ownerPriorities.set(ownerId, priority)
  if (prev !== priority && priority === 'visible' && !scrollActive) {
    drain()
  }
}

export const releaseRasterOwner = (ownerId: string) => {
  ownerPriorities.delete(ownerId)
  ownerPendingKeys.delete(ownerId)
  const registered = ownerListeners.get(ownerId)
  if (registered) {
    ownerListeners.delete(ownerId)
    for (const [key, fn] of registered) {
      const set = listeners.get(key)
      if (!set) continue
      set.delete(fn)
      if (set.size === 0) listeners.delete(key)
    }
  }
  for (let i = workQueue.length - 1; i >= 0; i--) {
    const item = workQueue[i]
    if (!item.owners.delete(ownerId)) continue
    if (item.ownerTracked && !item.exportUrgent && item.owners.size === 0) {
      workQueue.splice(i, 1)
      jobs.delete(item.key)
      listeners.delete(item.key)
      rasterDiagnostics.droppedUnmounted++
      item.resolve(null)
    }
  }
}

const hash = (value: string) => {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

const closeRasterIfBitmap = (raster: Raster | undefined) => {
  if (typeof ImageBitmap !== 'undefined' && raster instanceof ImageBitmap) {
    raster.close()
  }
}

const touch = (key: string, value: Raster) => {
  rasters.delete(key)
  rasters.set(key, value)
  while (rasters.size > RASTER_CACHE_MAX) {
    const oldest = rasters.keys().next().value
    if (!oldest) break
    closeRasterIfBitmap(rasters.get(oldest))
    rasters.delete(oldest)
  }
}

const notify = (key: string) => {
  for (const [ownerId, keys] of ownerPendingKeys) {
    if (keys.delete(key) && keys.size === 0) ownerPendingKeys.delete(ownerId)
  }
  const set = listeners.get(key)
  listeners.delete(key)
  if (!set) return
  for (const listener of set) listener()
}

const itemPriorityRank = (item: WorkItem): number => {
  if (item.exportUrgent) return 0
  if (!item.ownerTracked) return 1
  let best = 3
  for (const ownerId of item.owners) {
    const prio = ownerPriorities.get(ownerId)
    if (prio === 'visible') return 1
    if (prio === 'overscan' && best > 2) best = 2
  }
  return best
}

const pickNextJob = (): WorkItem | undefined => {
  if (!workQueue.length) return undefined
  let bestIdx = -1
  let bestRank = Infinity
  let bestSeq = Infinity
  for (let i = 0; i < workQueue.length; i++) {
    const item = workQueue[i]
    const rank = itemPriorityRank(item)
    if (scrollActive && rank > 0) continue
    // Strict priority: export (0) > visible (1) > overscan (2) > detached (3).
    // FIFO within each tier completes one visible slide at a time so thumbnails
    // flip to `complete: true` quickly instead of starving earlier visible rows.
    const prefer = rank < bestRank || (rank === bestRank && item.seq < bestSeq)
    if (prefer) {
      bestIdx = i
      bestRank = rank
      bestSeq = item.seq
    }
  }
  if (bestIdx < 0) return undefined
  return workQueue.splice(bestIdx, 1)[0]
}

const runWorkItem = (next: WorkItem) => {
  if (scrollActive && !next.exportUrgent) {
    inFlight--
    workQueue.push(next)
    return
  }
  Promise.resolve()
    .then(next.produce)
    .then(value => {
      if (value) {
        touch(next.key, value)
        rasterDiagnostics.completed++
      }
      next.resolve(value)
    })
    .catch(() => next.resolve(null))
    .finally(() => {
      inFlight--
      notify(next.key)
      drain()
    })
}

const drain = () => {
  while (inFlight < MAX_IN_FLIGHT && workQueue.length) {
    const next = pickNextJob()
    if (!next) return
    inFlight++
    setTimeout(() => runWorkItem(next), 0)
  }
}

export const requestRaster = (key: string, produce: RasterProducer, invalidate: () => void): Raster | undefined => {
  const hit = rasters.get(key)
  if (hit) {
    touch(key, hit)
    return hit
  }
  let set = listeners.get(key)
  if (!set) {
    set = new Set()
    listeners.set(key, set)
  }
  set.add(invalidate)
  const owner = activeOwner
  if (owner) {
    let entries = ownerListeners.get(owner.id)
    if (!entries) {
      entries = new Map()
      ownerListeners.set(owner.id, entries)
    }
    const prevFn = entries.get(key)
    if (prevFn && prevFn !== invalidate) {
      set.delete(prevFn)
    }
    entries.set(key, invalidate)
    let pending = ownerPendingKeys.get(owner.id)
    if (!pending) {
      pending = new Set()
      ownerPendingKeys.set(owner.id, pending)
    }
    pending.add(key)
  }
  const exportUrgent = collecting !== null
  let job = jobs.get(key)
  if (!job) {
    const owners = new Set<string>()
    if (owner) owners.add(owner.id)
    const ownerTracked = !!owner && !exportUrgent
    job = new Promise<Raster | null>(resolve => {
      workQueue.push({
        key,
        produce,
        resolve,
        exportUrgent,
        owners,
        ownerTracked,
        seq: nextWorkSeq++,
      })
      drain()
    })
    jobs.set(key, job)
    void job.finally(() => jobs.delete(key))
  }
  else {
    const queued = workQueue.find(item => item.key === key)
    if (queued) {
      if (exportUrgent && !queued.exportUrgent) {
        queued.exportUrgent = true
        queued.ownerTracked = false
        drain()
      }
      if (owner) {
        queued.owners.add(owner.id)
        queued.seq = nextWorkSeq++
      }
      else {
        queued.ownerTracked = false
      }
    }
  }
  collecting?.set(key, job)
  return undefined
}

/**
 * Run a paint and return the raster jobs it is missing, keyed by resource.
 * Offscreen renders wait for exactly these instead of every pending raster in
 * the page, so slides rendered side by side no longer wait for each other.
 */
export const collectRasterJobs = (paint: () => void): Map<string, Promise<Raster | null>> => {
  const outer = collecting
  const jobsForPaint = new Map<string, Promise<Raster | null>>()
  collecting = jobsForPaint
  try {
    paint()
  } finally {
    collecting = outer
    if (outer) jobsForPaint.forEach((job, key) => outer.set(key, job))
  }
  return jobsForPaint
}

const canvas = (width: number, height: number) => {
  const node = document.createElement('canvas')
  node.width = Math.max(1, Math.ceil(width))
  node.height = Math.max(1, Math.ceil(height))
  return node
}

/**
 * Decode an SVG string through an `<img>` and draw it onto a canvas.
 * `createImageBitmap` rejects SVG blobs in Chromium, so an image element is
 * the only reliable rasterization path. The source is a `data:` URL, not a
 * blob URL: Chromium taints a canvas that draws a blob-backed SVG carrying a
 * `<foreignObject>` (the code booth), which then fails `toBlob` for every
 * slide thumbnail; the same markup as a data URL stays same-origin — this is
 * the same path SnapDOM's SVG engine uses for the math booth.
 */
const svgToCanvas = async (svg: string, width: number, height: number): Promise<Raster | null> => {
  try {
    const image = new Image()
    image.decoding = 'async'
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('SVG decode failed'))
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    })
    const result = canvas(width, height)
    result.getContext('2d')?.drawImage(image, 0, 0, result.width, result.height)
    return result
  }
  catch {
    return null
  }
}

/**
 * Last good raster per chart element. When the content key misses (data or
 * size edit), the previous raster is stretched into the box while the new
 * one bakes, so the chart never degrades to the gray placeholder on screen.
 */
const staleChartRasters = new Map<string, Raster>()
const STALE_CHART_MAX = 64

export const getChartRaster = (
  element: PPTChartElement,
  colors: string[],
  textColor: string,
  lineColor: string,
  invalidate: () => void,
): Raster | undefined => {
  // Content-only key: left/top/rotate/fill/outline do not affect the baked
  // pixels, so a pure move must stay a cache hit — a miss here repaints the
  // thumbnail with a placeholder box for a few frames on drop.
  const payload = JSON.stringify({
    width: Math.ceil(element.width),
    height: Math.ceil(element.height),
    chartType: element.chartType,
    data: element.data,
    options: element.options,
    colors,
    textColor,
    lineColor,
  })
  const key = `chart:${hash(payload)}`
  const raster = requestRaster(key, async () => {
    const echarts = await loadEcharts()
    const width = Math.max(1, Math.ceil(element.width))
    const height = Math.max(1, Math.ceil(element.height))
    const source = canvas(width, height)
    const chart = echarts.init(source, null, {
      renderer: 'canvas',
      width,
      height,
      devicePixelRatio: 1,
      useDirtyRect: false,
    })
    const option = getChartOption({
      type: element.chartType,
      data: element.data,
      themeColors: expandChartThemeColors(colors),
      textColor,
      lineColor,
      lineSmooth: element.options?.lineSmooth || false,
      stack: element.options?.stack || false,
      fontSize: element.options?.fontSize,
      width,
    })
    if (!option) {
      chart.dispose()
      return null
    }
    chart.setOption({ ...option, animation: false }, true)
    const result = canvas(width, height)
    result.getContext('2d')?.drawImage(source, 0, 0)
    chart.dispose()
    return result
  }, invalidate)
  if (raster) {
    staleChartRasters.delete(element.id)
    staleChartRasters.set(element.id, raster)
    while (staleChartRasters.size > STALE_CHART_MAX) {
      const oldest = staleChartRasters.keys().next().value
      if (!oldest) break
      staleChartRasters.delete(oldest)
    }
    return raster
  }
  return staleChartRasters.get(element.id)
}

export const getMermaidRaster = (
  element: PPTMermaidElement,
  invalidate: () => void,
): Raster | undefined => {
  const key = `mermaid:${hash(`${element.code}\0${element.width}\0${element.height}`)}`
  const width = Math.max(1, Math.round(element.width))
  const height = Math.max(1, Math.round(element.height))
  return requestRaster(key, async () => {
    const { renderMermaidForImage } = await import('@/utils/mermaid')
    const raw = await renderMermaidForImage(element.code, `canvas-${hash(element.id + element.code)}`)
    // renderMermaid already emits width/height="100%"; rewrite them via the DOM
    // (string-splicing duplicates the attributes, which is unparseable XML).
    const doc = new DOMParser().parseFromString(raw, 'image/svg+xml')
    const root = doc.documentElement
    root.setAttribute('width', String(width))
    root.setAttribute('height', String(height))
    return svgToCanvas(new XMLSerializer().serializeToString(root), width, height)
  }, invalidate)
}

const escapeXml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

export const getCodeRaster = (
  element: PPTCodeElement,
  invalidate: () => void,
): Raster | undefined => {
  const payload = `${element.code}\0${element.language}\0${element.theme}\0${element.fontSize}\0${element.showLineNumbers}\0${element.width}\0${element.height}`
  const key = `code:${hash(payload)}`
  const width = Math.max(1, Math.round(element.width))
  const height = Math.max(1, Math.round(element.height))
  return requestRaster(key, async () => {
    let booth: string
    try {
      // Same Shiki booth markup the export path uses: inline styles only and
      // real gutter spans, so it survives the SVG foreignObject round-trip.
      const { codeElementToBoothHtml } = await import('@/utils/codeHighlight')
      booth = await codeElementToBoothHtml(element)
    }
    catch {
      const bg = isLightCodeTheme(element.theme) ? '#ffffff' : '#0d1117'
      const fg = isLightCodeTheme(element.theme) ? '#24292f' : '#e6edf3'
      booth = `<div style="box-sizing:border-box;width:100%;height:100%;overflow:hidden;border-radius:10px;padding:12px 16px;background:${bg};color:${fg};font:${element.fontSize}px/1.5 ui-monospace,Consolas,monospace;white-space:pre">${escapeXml(element.code)}</div>`
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%">${booth}</div></foreignObject></svg>`
    return svgToCanvas(svg, width, height)
  }, invalidate)
}

let mathFontsPromise: Promise<void> | null = null
let mathFontsAllLoaded = false
let mathRasterRevision = 0
const MAX_MATH_RASTER_RETRIES = 3
const mathFailureCounts = new Map<string, number>()
const mathRetryAfter = new Map<string, number>()

const STALE_MATH_MAX = 256
const TINTED_MATH_MAX = 512
const staleMathRasters = new Map<string, Raster>()
const tintedMathRasters = new Map<string, HTMLCanvasElement>()
const HAS_LATEX_COLOR_RE = /\\(?:(?:text)?color|(?:f)?colorbox|bbox|emph)\b/

export const hasLatexColorCommand = (latex: string): boolean => HAS_LATEX_COLOR_RE.test(latex)

/**
 * 1.25× geometric size ladder for interactive thumbnail math rasters so minor
 * font-size differences share one raster captured at bucket ceiling and drawn
 * scaled down (never blurry upscaling). Exports bypass this ladder.
 */
const MATH_SIZE_LADDER_RATIO = 1.25
const MATH_SIZE_LADDER_LOG = Math.log(MATH_SIZE_LADDER_RATIO)
const MATH_SIZE_LADDER_MIN = 10
export const mathSizeBucket = (fontSize: number): number => {
  const clamped = Math.max(MATH_SIZE_LADDER_MIN, fontSize)
  const step = Math.ceil(Math.log(clamped / MATH_SIZE_LADDER_MIN) / MATH_SIZE_LADDER_LOG)
  return Math.round(MATH_SIZE_LADDER_MIN * Math.pow(MATH_SIZE_LADDER_RATIO, Math.max(0, step)) * 2) / 2
}

const rememberStaleMathRaster = (staleKey: string, raster: Raster) => {
  staleMathRasters.delete(staleKey)
  staleMathRasters.set(staleKey, raster)
  while (staleMathRasters.size > STALE_MATH_MAX) {
    const oldest = staleMathRasters.keys().next().value
    if (!oldest) break
    staleMathRasters.delete(oldest)
  }
}

const tintMonochromeRaster = (mono: Raster, monoKey: string, color: string): Raster => {
  if (typeof document === 'undefined') return mono
  const normalizedColor = color.trim().toLowerCase()
  if (normalizedColor === '#000' || normalizedColor === '#000000' || normalizedColor === 'black' || normalizedColor === 'rgb(0, 0, 0)') {
    return mono
  }
  const tintKey = `${monoKey}\0${normalizedColor}`
  const cached = tintedMathRasters.get(tintKey)
  if (cached) {
    tintedMathRasters.delete(tintKey)
    tintedMathRasters.set(tintKey, cached)
    return cached
  }
  const out = document.createElement('canvas')
  out.width = Math.max(1, mono.width)
  out.height = Math.max(1, mono.height)
  if ('style' in mono && mono.style.width && mono.style.height) {
    out.style.width = mono.style.width
    out.style.height = mono.style.height
  }
  const ctx = out.getContext('2d')
  if (!ctx) return mono
  ctx.drawImage(mono, 0, 0)
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = color
  ctx.fillRect(0, 0, out.width, out.height)
  tintedMathRasters.set(tintKey, out)
  while (tintedMathRasters.size > TINTED_MATH_MAX) {
    const oldest = tintedMathRasters.keys().next().value
    if (!oldest) break
    const evicted = tintedMathRasters.get(oldest)
    if (evicted) {
      evicted.width = 0
      evicted.height = 0
    }
    tintedMathRasters.delete(oldest)
  }
  return out
}

const clearTintedAndStaleMathRasters = () => {
  staleMathRasters.clear()
  for (const node of tintedMathRasters.values()) {
    node.width = 0
    node.height = 0
  }
  tintedMathRasters.clear()
}

const clearMathRasters = () => {
  mathRasterRevision++
  mathFailureCounts.clear()
  mathRetryAfter.clear()
  clearTintedAndStaleMathRasters()
  if (!mathFontsAllLoaded) mathFontsPromise = null
  for (const [key, raster] of rasters) {
    if (!key.startsWith('imath:') && !key.startsWith('latex:')) continue
    closeRasterIfBitmap(raster)
    rasters.delete(key)
  }
}

subscribeTextFontChanges(families => {
  if (!families || families.has(MATH_FONT_CHANGE_TOKEN)) {
    clearMathRasters()
    return
  }
  if (mathFontsAllLoaded) return
  for (const family of families) {
    if (family.includes('katex')) {
      clearMathRasters()
      return
    }
  }
})

const hasDeclaredKatexStylesheet = (): boolean => {
  if (typeof document === 'undefined') return false
  try {
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList | undefined
      try {
        rules = sheet.cssRules
      }
      catch {
        continue
      }
      if (!rules) continue
      for (const rule of Array.from(rules)) {
        if (rule.cssText && /KaTeX/i.test(rule.cssText)) return true
      }
    }
  }
  catch {
    return false
  }
  return false
}

const getKatexFontFaces = (fonts: FontFaceSet): FontFace[] => (
  Array.from(fonts as unknown as Iterable<FontFace>).filter(face => /KaTeX/i.test(face.family))
)

/**
 * Ensure KaTeX webfonts used by MathLive are loaded before SnapDOM captures.
 * Never resolves as "ready" while KaTeX `@font-face` rules are still unloaded,
 * and retries cleanly if the embed stylesheet arrives after initial boot.
 */
const ensureMathFontsLoaded = (): Promise<void> => {
  if (mathFontsPromise) return mathFontsPromise
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined
  if (!fonts) return Promise.resolve()
  const promise = fonts.ready.then(async () => {
    let faces = getKatexFontFaces(fonts)
    if (!faces.length && hasDeclaredKatexStylesheet()) {
      // Stylesheet declared KaTeX faces but the FontFaceSet has not registered them yet.
      await new Promise<void>(resolve => setTimeout(resolve, 32))
      await fonts.ready
      faces = getKatexFontFaces(fonts)
    }
    if (!faces.length) {
      // No KaTeX @font-face in this document yet — retry on the next capture.
      mathFontsPromise = null
      return
    }
    await Promise.all(faces.map(face => face.load().catch(() => undefined)))
    const loadedCount = faces.filter(face => face.status === 'loaded').length
    if (loadedCount === 0) {
      mathFontsPromise = null
    }
    else if (loadedCount === faces.length) {
      mathFontsAllLoaded = true
    }
  })
  mathFontsPromise = promise.catch(() => {
    mathFontsPromise = null
  })
  return mathFontsPromise
}

const MATH_RASTER_BOOTH_ID = 'fika-math-raster-booth'

/**
 * Offscreen stage classed as the embed root so scoped `.fika-embed-root .ML__*`
 * rules match. A node hung off `document.body` without that class typesets
 * as a flat run (no fraction bars, no KaTeX metrics).
 */
const ensureMathRasterBooth = (): HTMLElement => {
  const existing = document.getElementById(MATH_RASTER_BOOTH_ID)
  if (existing instanceof HTMLElement) return existing
  const booth = document.createElement('div')
  booth.id = MATH_RASTER_BOOTH_ID
  booth.className = EMBED_ROOT_CLASS
  booth.setAttribute(MATH_PROBE_ATTR, 'true')
  booth.setAttribute('aria-hidden', 'true')
  booth.style.cssText = [
    'position:fixed',
    'left:-10000px',
    'top:0',
    'width:max-content',
    'height:max-content',
    'pointer-events:none',
    'overflow:visible',
    'background:transparent',
  ].join(';')
  document.documentElement.appendChild(booth)
  return booth
}

/**
 * Verify a transparent math capture contains visible pixels.
 * Checks alpha only — white/light math ink on dark slides has RGB > 248 and
 * MUST count as valid ink rather than degrading to fallback text.
 *
 * Catches `SecurityError` when Safari/WebKit taints a `<foreignObject>` SVG
 * canvas: defaults to `false` so direct-SVG cleanly falls back to SnapDOM,
 * while callers on the SnapDOM fallback pass `{ onTainted: true }` so WebKit
 * never drops a valid rendered formula.
 */
export const canvasHasInk = (
  node: HTMLCanvasElement,
  options?: { onTainted?: boolean },
): boolean => {
  const ctx = node.getContext('2d', { willReadFrequently: true })
  if (!ctx) return false
  const { width, height } = node
  if (!(width > 0) || !(height > 0)) return false
  let data: Uint8ClampedArray
  try {
    data = ctx.getImageData(0, 0, width, height).data
  }
  catch {
    return options?.onTainted ?? false
  }
  let ink = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 12) continue
    ink++
    if (ink > 8) return true
  }
  return ink > 0
}

/**
 * Quantize inline math capture font sizes to 0.5px buckets so minor fit-scale
 * jitter hits the same SnapDOM raster instead of spawning repeated captures.
 */
export const quantizeMathFontSize = (fontSize: number): number => (
  Math.max(1, Math.round(fontSize * 2) / 2)
)

const requestMathRaster = (
  key: string,
  latex: string,
  produce: RasterProducer,
  invalidate: () => void,
): Raster | undefined => {
  const hit = rasters.get(key)
  if (hit) {
    touch(key, hit)
    return hit
  }
  const failKey = `${mathRasterRevision}\0${key}`
  const failures = mathFailureCounts.get(failKey) ?? 0
  if (failures >= MAX_MATH_RASTER_RETRIES) {
    recordRejection('rejectRetryCapHit', latex)
    return undefined
  }
  const retryAt = mathRetryAfter.get(failKey) ?? 0
  if (retryAt && performance.now() < retryAt) return undefined

  return requestRaster(key, async () => {
    const result = await produce()
    if (result) {
      mathFailureCounts.delete(failKey)
      mathRetryAfter.delete(failKey)
      return result
    }
    const nextFailures = (mathFailureCounts.get(failKey) ?? 0) + 1
    mathFailureCounts.set(failKey, nextFailures)
    if (nextFailures < MAX_MATH_RASTER_RETRIES) {
      const delayMs = 150 * nextFailures
      mathRetryAfter.set(failKey, performance.now() + delayMs)
      window.setTimeout(() => invalidate(), delayMs)
    }
    return null
  }, invalidate)
}

/** Above this many raster pixels the formula snapshot drops back to 1x. */
const LATEX_RASTER_HIDPI_BUDGET = 1_500_000

/**
 * Tight MathLive snapshot of a formula — same nowrap, max-content stage as
 * `LatexContent`. Captures single-color formulas once in monochrome black and
 * tints via `source-in` so light/dark slides share one raster. Never caches
 * fallback rasters so transient CSS/font races retry cleanly.
 */
export const getLatexRaster = (
  element: PPTLatexElement,
  invalidate: () => void,
): Raster | undefined => {
  const boxW = Math.max(1, Math.round(element.width))
  const boxH = Math.max(1, Math.round(element.height))
  const monochrome = !hasLatexColorCommand(element.latex)
  const captureColor = monochrome ? '#000000' : element.color
  const key = `latex:${hash(`${mathRasterRevision}\0${element.latex}\0${boxW}\0${boxH}\0${captureColor}`)}`
  const base = requestMathRaster(key, element.latex, async () => {
    await ensureMathliveReady()
    if (!hasMathliveStaticRules()) {
      recordRejection('rejectCaptureError', element.latex)
      return null
    }
    await ensureMathFontsLoaded()
    const host = document.createElement('div')
    host.className = EMBED_ROOT_CLASS
    host.style.cssText = [
      'display:inline-block',
      'width:max-content',
      'max-width:none',
      'flex-shrink:0',
      'white-space:nowrap',
      'line-height:normal',
      `font-size:${LATEX_ELEMENT_FONT_SIZE}px`,
      `color:${captureColor}`,
      'pointer-events:none',
      'background:transparent',
    ].join(';')
    host.innerHTML = renderLatexElementHtml(element.latex)
    const formula = host.firstElementChild as HTMLElement | null
    if (formula) {
      formula.style.display = 'block'
      formula.style.margin = '0'
      formula.style.color = 'inherit'
      formula.style.whiteSpace = 'nowrap'
    }
    const booth = ensureMathRasterBooth()
    booth.appendChild(host)
    try {
      void host.offsetWidth
      const naturalWidth = host.offsetWidth
      const naturalHeight = host.offsetHeight
      if (!(naturalWidth > 0) || !(naturalHeight > 0)) {
        recordRejection('rejectEmptyDimensions', element.latex, { width: naturalWidth, height: naturalHeight })
        return null
      }
      const fit = Math.min(boxW / naturalWidth, boxH / naturalHeight)
      host.style.fontSize = `${LATEX_ELEMENT_FONT_SIZE * fit}px`
      void host.offsetWidth
      const width = Math.max(1, Math.ceil(host.offsetWidth))
      const height = Math.max(1, Math.ceil(host.offsetHeight))
      const dpr = width * height * 4 <= LATEX_RASTER_HIDPI_BUDGET ? 2 : 1
      const direct = await captureMathHostDirectSvg(host, width, height, dpr)
      if (direct && canvasHasInk(direct)) {
        rasterDiagnostics.directSvgHits++
        return direct
      }
      rasterDiagnostics.snapdomFallbacks++
      const { captureToCanvas } = await import('@/utils/snapdomCapture')
      const captured = await captureToCanvas(host, {
        dpr,
        embedFonts: true,
        reconcile: true,
      })
      if (captured && canvasHasInk(captured, { onTainted: true })) return captured
      recordRejection('rejectNoInk', element.latex, { width, height })
      return null
    }
    catch {
      recordRejection('rejectCaptureError', element.latex)
      return null
    }
    finally {
      host.remove()
    }
  }, invalidate)
  if (!base) return undefined
  return monochrome ? tintMonochromeRaster(base, key, element.color) : base
}

/**
 * Typeset inline/display math and snapshot it. Interactive thumbnails use a
 * 1.25× size ladder (drawing stale rasters while a new bucket renders) and
 * monochrome capture + `source-in` tinting so light/dark cards share one
 * capture. Exports (`collecting !== null`) bypass bucketing for exact size.
 */
export const getInlineMathRaster = (
  latex: string,
  fontSize: number,
  color: string,
  display: boolean,
  invalidate: () => void,
  onStale?: () => void,
): Raster | undefined => {
  const isExport = collecting !== null
  const size = isExport ? quantizeMathFontSize(fontSize) : mathSizeBucket(fontSize)
  const monochrome = !hasLatexColorCommand(latex)
  const captureColor = monochrome ? '#000000' : color
  const key = `imath:${hash(`${mathRasterRevision}\0${latex}\0${size}\0${captureColor}\0${display ? 1 : 0}`)}`
  const staleKey = `${mathRasterRevision}\0${latex}\0${display ? 1 : 0}\0${captureColor}`
  const base = requestMathRaster(key, latex, async () => {
    await ensureMathliveReady()
    if (!hasMathliveStaticRules()) {
      recordRejection('rejectCaptureError', latex, { size })
      return null
    }
    await ensureMathFontsLoaded()
    const host = document.createElement('div')
    host.className = EMBED_ROOT_CLASS
    host.style.cssText = [
      'display:inline-block',
      'width:max-content',
      'max-width:none',
      'flex-shrink:0',
      'white-space:nowrap',
      'line-height:normal',
      `font-size:${size}px`,
      `color:${captureColor}`,
      'background:transparent',
    ].join(';')
    host.innerHTML = renderMathToHtml(latex, display)
    const booth = ensureMathRasterBooth()
    booth.appendChild(host)
    try {
      void host.offsetWidth
      const rect = host.getBoundingClientRect()
      const childRect = host.firstElementChild?.getBoundingClientRect?.()
      const rawWidth = Math.ceil(Math.max(host.offsetWidth || 0, host.scrollWidth || 0, rect.width || 0, childRect?.width || 0))
      const rawHeight = Math.ceil(Math.max(host.offsetHeight || 0, host.scrollHeight || 0, rect.height || 0, childRect?.height || 0))
      const trimmed = latex.trim()
      if (!(rawWidth > 0) || !(rawHeight > 0)) {
        recordRejection('rejectEmptyDimensions', latex, { width: rawWidth, height: rawHeight, size })
        return null
      }
      // Reject unstyled collapsed slivers while permitting narrow symbols (`1`, `i`, `|`) and tall display formulas.
      if ((trimmed.length > 2 && rawWidth < size * 0.2) || rawHeight > size * 8) {
        recordRejection('rejectBounds', latex, { width: rawWidth, height: rawHeight, size })
        return null
      }
      // Add right-edge breathing room so italic overhangs and `\text{...}` glyphs
      // inside SVG `<foreignObject>` never clip at the strict SVG viewport edge.
      const padX = Math.max(4, Math.ceil(size * 0.2))
      const width = rawWidth + padX
      const height = rawHeight + 2
      const direct = await captureMathHostDirectSvg(host, width, height, 2)
      if (direct && canvasHasInk(direct)) {
        rasterDiagnostics.directSvgHits++
        return direct
      }
      rasterDiagnostics.snapdomFallbacks++
      const { captureToCanvas } = await import('@/utils/snapdomCapture')
      const captured = await captureToCanvas(host, {
        width,
        height,
        dpr: 2,
        embedFonts: true,
        reconcile: true,
      })
      if (captured && canvasHasInk(captured, { onTainted: true })) return captured
      recordRejection('rejectNoInk', latex, { width, height, size })
      return null
    }
    catch {
      recordRejection('rejectCaptureError', latex, { size })
      return null
    }
    finally {
      host.remove()
    }
  }, invalidate)
  if (base) {
    if (!isExport) rememberStaleMathRaster(staleKey, base)
    return monochrome ? tintMonochromeRaster(base, key, color) : base
  }
  if (!isExport) {
    const stale = staleMathRasters.get(staleKey)
    if (stale) {
      onStale?.()
      return monochrome ? tintMonochromeRaster(stale, `stale:${staleKey}`, color) : stale
    }
  }
  return undefined
}

if (typeof window !== 'undefined') {
  ;(window as unknown as { __FIKA_RASTER_DIAG__?: () => ReturnType<typeof readRasterDiagnostics> }).__FIKA_RASTER_DIAG__ = readRasterDiagnostics
}

export const hasPendingRasters = () => jobs.size > 0 || workQueue.length > 0

export const clearSlideRasterResources = () => {
  for (const raster of rasters.values()) {
    closeRasterIfBitmap(raster)
  }
  rasters.clear()
  listeners.clear()
  ownerPriorities.clear()
  ownerListeners.clear()
  ownerPendingKeys.clear()
  staleChartRasters.clear()
  clearTintedAndStaleMathRasters()
  mathFailureCounts.clear()
  mathRetryAfter.clear()
}
