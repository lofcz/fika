import { collectSlidesFonts } from '@/utils/font'
import { setFikaAssetBase } from '@/utils/assetBase'
import type { FikaDocument } from './types'
import type { PresentationExportOptions, PresentationExportState } from '@/hooks/useExport'
import { useSlidesStore } from '@/store'
import { getFikaExportWatermark } from '@/configs/exportWatermark'
import { getFikaExportMediaResolver } from '@/configs/exportMediaResolver'

export interface FikaExportOptions extends Pick<PresentationExportOptions, 'mediaResolver' | 'watermark'> {
  /** Runtime assets/chunks when exporting before mounting an editor. */
  assetBaseUrl?: string
  /** PDF raster width in pixels. Default 2560, maximum 8192. */
  width?: number
  /** Resource timeout per slide in milliseconds. Default 30000. */
  timeoutMs?: number
  onProgress?: (completed: number, total: number) => void
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
  const deck = snapshot(document)
  configureAssets(options)
  const config = {
    mediaResolver: options.mediaResolver === undefined ? getFikaExportMediaResolver() : options.mediaResolver,
    watermark: options.watermark === undefined ? getFikaExportWatermark() : options.watermark,
  }
  const { createPresentationExporter } = await import('@/hooks/useExport')
  const { createJobProgress } = await import('@/utils/jobProgress')
  const job = createJobProgress()
  const unsubscribe = job.subscribe(() => options.onProgress?.(Math.min(job.current.value, deck.slides.length), deck.slides.length))
  try {
    return await createPresentationExporter(deck, config, job).exportPPTX(deck.slides)
  } finally { unsubscribe() }
}

/** High-resolution image PDF, one slide per page, using Fika's existing painter. */
export async function exportPresentationPdf(document: FikaDocument, options: FikaExportOptions = {}): Promise<Blob> {
  const deck = snapshot(document)
  configureAssets(options)
  const resolver = options.watermark === undefined ? getFikaExportWatermark() : options.watermark
  const mediaResolver = options.mediaResolver === undefined ? getFikaExportMediaResolver() : options.mediaResolver
  const rasterWidth = options.width ?? 2560
  if (!Number.isFinite(rasterWidth) || rasterWidth < 64 || rasterWidth > 8192) throw new Error('PDF raster width must be between 64 and 8192')
  if (options.timeoutMs !== undefined && (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0)) throw new Error('Invalid resource timeout')
  const [{ PDFDocument }, { renderSlideImage }, { loadWatermarkImage }, { preferredInk, resolveSlideSurfaceColors }] = await Promise.all([
    import('pdf-lib'), import('./render'), import('@/utils/pptxExportWatermark'), import('@/utils/textContrast'),
  ])
  // A saved deck may use fonts that the mounted editor has never requested.
  const fonts = collectSlidesFonts({ slides: deck.slides, theme: deck.theme })
  if (globalThis.document.fonts) {
    let timer: ReturnType<typeof setTimeout>
    try {
      await Promise.race([
        Promise.all(fonts.map(font => globalThis.document.fonts.load(`16px ${JSON.stringify(font)}`))),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('PDF font loading timed out')), options.timeoutMs ?? 30000) }),
      ])
    } finally { clearTimeout(timer!) }
  }
  const pdf = await PDFDocument.create()
  pdf.setTitle(deck.title || 'Presentation')
  pdf.setCreator('Fika')
  const watermark = await resolver?.()
  const embedMark = async (src: string) => {
    const image = await loadWatermarkImage(src)
    return image.mime === 'image/png' ? pdf.embedPng(image.bytes) : pdf.embedJpg(image.bytes)
  }
  const lightMark = watermark ? await embedMark(watermark.image) : null
  const darkMark = watermark?.imageOnDark ? await embedMark(watermark.imageOnDark) : lightMark
  // Match PPTX's 10-inch-wide layout, including custom/portrait aspect ratios.
  const width = 720
  const height = width * deck.viewportRatio
  options.onProgress?.(0, deck.slides.length)
  for (let i = 0; i < deck.slides.length; i++) {
    const slide = deck.slides[i]
    const capture = await renderSlideImage({ ...deck, slide }, {
      width: rasterWidth, format: 'image/png', fullResolutionImages: true,
      timeoutMs: options.timeoutMs ?? 30000, mediaResolver, strictResources: true,
    })
    const image = await pdf.embedPng(await capture.blob.arrayBuffer())
    const page = pdf.addPage([width, height])
    page.drawImage(image, { x: 0, y: 0, width, height })
    if (watermark && lightMark) {
      const dark = preferredInk(resolveSlideSurfaceColors(slide.background, deck.theme.backgroundColor)) === '#ffffff'
      const mark = dark ? darkMark! : lightMark
      const ratio = (value: number | undefined, fallback: number) => Number.isFinite(value) && value! > 0 && value! <= 1 ? value! : fallback
      const markWidth = width * ratio(watermark.widthRatio, 0.12)
      const markHeight = markWidth * mark.height / mark.width
      const margin = width * ratio(watermark.marginRatio, 0.02)
      const position = watermark.position ?? 'bottom-right'
      page.drawImage(mark, {
        x: position.endsWith('left') ? margin : width - markWidth - margin,
        y: position.startsWith('top') ? height - markHeight - margin : margin,
        width: markWidth, height: markHeight, opacity: ratio(watermark.opacity, 1),
      })
    }
    options.onProgress?.(i + 1, deck.slides.length)
  }
  return new Blob([new Uint8Array(await pdf.save())], { type: 'application/pdf' })
}
