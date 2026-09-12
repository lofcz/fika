/**
 * Host-mandated watermark for PPTX exports.
 *
 * The resolver runs at the start of every PPTX export, so entitlement changes
 * on the host side (a user upgrading mid-session) take effect on the next
 * download without remounting. Returning null/undefined exports a clean deck.
 * A resolver that throws, or an image that cannot be loaded, fails the export
 * — the engine never silently drops a mark the host asked for.
 */
export type FikaExportWatermarkPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'

export interface FikaExportWatermark {
  /** PNG or JPEG as a `data:` URL or a URL the browser can fetch. */
  image: string
  /** Corner of the slide. @default 'bottom-right' */
  position?: FikaExportWatermarkPosition
  /** Mark width as a fraction of the slide width (0–1]. @default 0.12 */
  widthRatio?: number
  /** Gap to the slide edges as a fraction of the slide width (0–1]. @default 0.02 */
  marginRatio?: number
  /** Extra opacity applied on top of the image's own alpha (0–1]. @default 1 */
  opacity?: number
  /** Shape name shown by presentation apps. @default 'Watermark' */
  name?: string
}

export type FikaExportWatermarkResolver = () =>
  | FikaExportWatermark
  | null
  | undefined
  | Promise<FikaExportWatermark | null | undefined>

let exportWatermarkResolver: FikaExportWatermarkResolver | null = null

export function setFikaExportWatermark(resolver?: FikaExportWatermarkResolver | null) {
  exportWatermarkResolver = resolver ?? null
}

export function getFikaExportWatermark(): FikaExportWatermarkResolver | null {
  return exportWatermarkResolver
}
