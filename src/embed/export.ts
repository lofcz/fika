import { collectSlidesFonts } from '@/utils/font'
import { setFikaAssetBase } from '@/utils/assetBase'
import type { FikaDocument } from './types'
import type { PresentationExportOptions, PresentationExportState } from '@/hooks/useExport'
import { useSlidesStore } from '@/store'
import { getFikaExportWatermark } from '@/configs/exportWatermark'
import { getFikaExportMediaResolver } from '@/configs/exportMediaResolver'
import { createExportWorker, yieldExportTask } from '@/utils/exportWorker'

export interface FikaExportProgress {
  phase: 'preparing' | 'rendering' | 'packaging' | 'complete'
  completed: number
  total: number
  /** Normalized 0..1; reaches 1 only when downloadable bytes are ready. */
  progress: number
}

export interface FikaExportOptions extends Pick<PresentationExportOptions, 'mediaResolver' | 'watermark'> {
  /** Runtime assets/chunks when exporting before mounting an editor. */
  assetBaseUrl?: string
  /** PDF raster width in pixels. Default 2560, maximum 8192. */
  width?: number
  /** JPEG avoids PNG decode/recompression in the PDF writer. Default image/jpeg. */
  imageFormat?: 'image/jpeg' | 'image/png'
  /** JPEG quality, 0–1. Default 0.95. PNG remains available for lossless output. */
  quality?: number
  /** Resource timeout per slide in milliseconds. Default 30000. */
  timeoutMs?: number
  onProgress?: (completed: number, total: number, detail?: FikaExportProgress) => void
}

function configureAssets(options: FikaExportOptions) {
  if (options.assetBaseUrl) {
    setFikaAssetBase(options.assetBaseUrl)
    __webpack_public_path__ = options.assetBaseUrl.replace(/\/?$/, '/')
  }
}

function snapshot(document: FikaDocument): PresentationExportState {
  if (!document.slides?.length) throw new Error('Presentation has no slides')
  const viewportSize = document.viewport?.size ?? 1000
  const viewportRatio = document.viewport?.ratio ?? 0.5625
  if (!Number.isFinite(viewportSize) || viewportSize <= 0 || !Number.isFinite(viewportRatio) || viewportRatio <= 0) {
    throw new Error('Invalid presentation dimensions')
  }
  return structuredClone({
    title: document.title,
    slides: document.slides,
    theme: { ...useSlidesStore.getInitialState().theme, ...document.theme },
    viewportSize,
    viewportRatio,
  })
}

/** Editable PPTX bytes. No mount, dialog, browser download, or editor mutations. */
export async function exportPresentationPptx(document: FikaDocument, options: FikaExportOptions = {}): Promise<Blob> {
  options.onProgress?.(0, document.slides?.length ?? 0, { phase: 'preparing', completed: 0, total: document.slides?.length ?? 0, progress: 0 })
  const deck = snapshot(document)
  await yieldExportTask()
  configureAssets(options)
  const config = {
    mediaResolver: options.mediaResolver === undefined ? getFikaExportMediaResolver() : options.mediaResolver,
    watermark: options.watermark === undefined ? getFikaExportWatermark() : options.watermark,
  }
  const { createPresentationExporter } = await import('@/hooks/useExport')
  const { createJobProgress } = await import('@/utils/jobProgress')
  const job = createJobProgress()
  const total = deck.slides.length
  const unsubscribe = job.subscribe(() => {
    if (!job.running.value) return
    const completed = Math.min(job.current.value, total)
    const phase = job.current.value > total ? 'packaging' : job.progress.value < 0.1 ? 'preparing' : 'rendering'
    options.onProgress?.(completed, total, { phase, completed, total, progress: Math.min(0.99, job.progress.value) })
  })
  try {
    const blob = await createPresentationExporter(deck, config, job).exportPPTX(deck.slides)
    options.onProgress?.(total, total, { phase: 'complete', completed: total, total, progress: 1 })
    return blob
  } finally { unsubscribe() }
}

/** High-resolution image PDF, one slide per page, using Fika's existing painter. */
export async function exportPresentationPdf(document: FikaDocument, options: FikaExportOptions = {}): Promise<Blob> {
  options.onProgress?.(0, document.slides?.length ?? 0, { phase: 'preparing', completed: 0, total: document.slides?.length ?? 0, progress: 0 })
  const deck = snapshot(document)
  await yieldExportTask()
  configureAssets(options)
  const resolver = options.watermark === undefined ? getFikaExportWatermark() : options.watermark
  const mediaResolver = options.mediaResolver === undefined ? getFikaExportMediaResolver() : options.mediaResolver
  const rasterWidth = options.width ?? 2560
  const format = options.imageFormat ?? 'image/jpeg'
  const quality = options.quality ?? 0.95
  if (format !== 'image/jpeg' && format !== 'image/png') throw new Error('Invalid PDF image format')
  if (!Number.isFinite(quality) || quality < 0 || quality > 1) throw new Error('PDF quality must be between 0 and 1')
  if (!Number.isFinite(rasterWidth) || rasterWidth < 64 || rasterWidth > 8192) throw new Error('PDF raster width must be between 64 and 8192')
  if (options.timeoutMs !== undefined && (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0)) throw new Error('Invalid resource timeout')
  const [{ renderSlideImage }, { loadWatermarkImage }, { preferredInk, resolveSlideSurfaceColors }] = await Promise.all([
    import('./render'), import('@/utils/pptxExportWatermark'), import('@/utils/textContrast'),
  ])
  // A saved deck may use fonts that the mounted editor has never requested.
  const fonts = collectSlidesFonts({ slides: deck.slides, theme: deck.theme })
  if (globalThis.document.fonts) {
    let timer: ReturnType<typeof setTimeout>
    try {
      await Promise.race([
        Promise.all(fonts.flatMap(font => ['400', '700', 'italic 400', 'italic 700'].map(style => globalThis.document.fonts.load(`${style} 16px ${JSON.stringify(font)}`)))),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('PDF font loading timed out')), options.timeoutMs ?? 30000) }),
      ])
    } finally { clearTimeout(timer!) }
  }
  const watermark = await resolver?.()
  const light = watermark ? await loadWatermarkImage(watermark.image) : null
  const dark = watermark?.imageOnDark ? await loadWatermarkImage(watermark.imageOnDark) : null
  const worker = createExportWorker()
  try {
    await worker.request('pdf-start', { title: deck.title, watermark, light, dark })
    // Match PPTX's 10-inch-wide layout, including custom/portrait aspect ratios.
    const width = 720
    const height = width * deck.viewportRatio
    options.onProgress?.(0, deck.slides.length, { phase: 'rendering', completed: 0, total: deck.slides.length, progress: 0.05 })
    // Bound canvas memory (~128 MiB, except a single oversized slide) while overlapping image loads and native
    // encoding. A sliding window keeps that many renders in flight, so slides finish (and report) one by one
    // instead of in lockstep batches. Pages are still written in deck order.
    const concurrency = Math.max(1, Math.min(4, Math.floor(128 * 1024 * 1024 / (rasterWidth * rasterWidth * deck.viewportRatio * 8))))
    const total = deck.slides.length
    type Capture = Awaited<ReturnType<typeof renderSlideImage>>
    const captures: Array<Promise<PromiseSettledResult<Capture>>> = []
    let launched = 0
    let rendered = 0
    let failed = false
    /** Rasters landed per in-flight slide: math-heavy slides report between completions too. */
    const partial = new Map<number, number>()
    let reported = 0.05
    const reportRendering = () => {
      let inFlight = 0
      partial.forEach(fraction => { inFlight += 0.9 * fraction })
      const progress = 0.05 + 0.85 * (rendered + inFlight) / total
      if (progress <= reported) return
      reported = progress
      options.onProgress?.(rendered, total, { phase: 'rendering', completed: rendered, total, progress })
    }
    const launch = () => {
      const index = launched++
      const slide = deck.slides[index]
      captures.push(renderSlideImage({ ...deck, slide }, {
        width: rasterWidth, format, quality, fullResolutionImages: true,
        timeoutMs: options.timeoutMs ?? 30000, mediaResolver, strictResources: true,
        onResourceProgress: fraction => { partial.set(index, fraction); reportRendering() },
      }).then(
        value => ({ status: 'fulfilled' as const, value }),
        (reason: unknown) => ({ status: 'rejected' as const, reason }),
      ).then(result => {
        rendered++
        partial.delete(index)
        if (result.status === 'rejected') failed = true
        else reportRendering()
        if (!failed && launched < total) launch()
        return result
      }))
    }
    while (launched < Math.min(concurrency, total)) launch()
    for (let index = 0; index < total; index++) {
      const capture = await captures[index]
      if (capture.status === 'rejected') {
        // Let in-flight renders release their canvases before rejecting (no unhandled background jobs).
        await Promise.all(captures)
        throw capture.reason
      }
      const bytes = await capture.value.blob.arrayBuffer()
      const dark = preferredInk(resolveSlideSurfaceColors(deck.slides[index].background, deck.theme.backgroundColor)) === '#ffffff'
      await worker.request('pdf-page', { bytes, format, width, height, dark }, [bytes])
      if (index % concurrency === concurrency - 1) await yieldExportTask()
    }
    options.onProgress?.(deck.slides.length, deck.slides.length, { phase: 'packaging', completed: deck.slides.length, total: deck.slides.length, progress: 0.92 })
    const bytes = await worker.request<ArrayBuffer>('pdf-save', null)
    const blob = new Blob([bytes], { type: 'application/pdf' })
    options.onProgress?.(deck.slides.length, deck.slides.length, { phase: 'complete', completed: deck.slides.length, total: deck.slides.length, progress: 1 })
    return blob
  } finally { worker.close() }
}
