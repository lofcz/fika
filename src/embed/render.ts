import type { Slide, SlideTheme } from '@/types/slides'
import { paintSlideToCanvas } from '@/paint/slidePainter'

/**
 * Offscreen slide rendering for hosts and agents.
 *
 * Both entry points paint Slide JSON straight to a canvas with the same
 * painter the thumbnail rail uses, so the pixels match what the user sees
 * (list markers, text-fit sizes, shapes) without cloning the live DOM.
 */

export interface FikaRenderSlideOptions {
  /** Output width in CSS px. Height follows the deck ratio. Default 1280. */
  width?: number
  /** Device pixel ratio multiplier for the backing store. Default 1. */
  dpr?: number
  /**
   * Upper bound on waiting for async resources (images, charts, LaTeX).
   * Whatever has resolved by then is painted; the rest stays blank.
   * Default 4000.
   */
  timeoutMs?: number
  /** Encoded image type. Default `image/png`. */
  format?: 'image/png' | 'image/jpeg' | 'image/webp'
  /** Encoder quality for lossy formats (0–1). Default 0.9. */
  quality?: number
}

export interface FikaDeckAtlasOptions extends Omit<FikaRenderSlideOptions, 'width'> {
  /** Width of one slide tile in CSS px. Default 640. */
  tileWidth?: number
  /** Tiles per row. Default 3. */
  columns?: number
  /** Slides per sheet; long decks split into several sheets. Default 12. */
  maxPerSheet?: number
  /** Only these slides (ids or 1-based indexes). Default: every slide. */
  slides?: Array<string | number>
  /** Paint "1", "2", … in each tile's corner so the viewer can address slides. Default true. */
  numbered?: boolean
  /** Sheet background. Default `#1F2937`. */
  gutterColor?: string
}

export interface FikaDeckAtlasTile {
  slideId: string
  /** 1-based deck position. */
  index: number
  row: number
  column: number
  /** Tile rectangle in sheet CSS px. */
  left: number
  top: number
  width: number
  height: number
}

export interface FikaDeckAtlasSheet {
  blob: Blob
  width: number
  height: number
  columns: number
  rows: number
  tiles: FikaDeckAtlasTile[]
}

interface RenderTarget {
  slide: Slide
  theme: SlideTheme
  viewportSize: number
  viewportRatio: number
}

const IDLE_WINDOW_MS = 220

/**
 * Paint until the painter stops asking for a repaint (all async resources
 * settled) or the deadline passes. `invalidate` fires once per resolved
 * resource, so an idle window after the last repaint means the frame is final.
 */
async function paintSettled(canvas: HTMLCanvasElement, target: RenderTarget, cssWidth: number, dpr: number, timeoutMs: number): Promise<void> {
  await document.fonts?.ready?.catch(() => undefined)
  const deadline = performance.now() + timeoutMs
  let pending = false
  let wake: (() => void) | null = null
  const invalidate = () => {
    pending = true
    wake?.()
  }
  for (;;) {
    pending = false
    paintSlideToCanvas(canvas, {
      slide: target.slide,
      theme: target.theme,
      viewportSize: target.viewportSize,
      viewportRatio: target.viewportRatio,
      cssWidth,
      cssHeight: cssWidth * target.viewportRatio,
      dpr,
      invalidate,
    })
    const remaining = deadline - performance.now()
    if (remaining <= 0) return
    // Wait for either a resource to resolve (repaint) or an idle window (done).
    const woke = await new Promise<boolean>(resolve => {
      const timer = window.setTimeout(() => {
        wake = null
        resolve(false)
      }, Math.min(IDLE_WINDOW_MS, remaining))
      wake = () => {
        window.clearTimeout(timer)
        wake = null
        resolve(true)
      }
      if (pending) wake()
    })
    if (!woke) return
  }
}

function encode(canvas: HTMLCanvasElement, format: NonNullable<FikaRenderSlideOptions['format']>, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('Canvas encoding failed'))
    }, format, quality)
  })
}

/** Render one slide to an encoded image. */
export async function renderSlideImage(target: RenderTarget, options: FikaRenderSlideOptions = {}): Promise<{ blob: Blob; width: number; height: number }> {
  const width = Math.max(64, Math.round(options.width ?? 1280))
  const dpr = Math.max(1, options.dpr ?? 1)
  const canvas = document.createElement('canvas')
  await paintSettled(canvas, target, width, dpr, options.timeoutMs ?? 4000)
  const blob = await encode(canvas, options.format ?? 'image/png', options.quality ?? 0.9)
  return { blob, width: canvas.width, height: canvas.height }
}

function resolveAtlasSlides(slides: Slide[], wanted: Array<string | number> | undefined): Array<{ slide: Slide; index: number }> {
  if (!wanted?.length) return slides.map((slide, i) => ({ slide, index: i + 1 }))
  const picked: Array<{ slide: Slide; index: number }> = []
  for (const ref of wanted) {
    const i = typeof ref === 'number' ? ref - 1 : slides.findIndex(s => s.id === ref)
    const slide = slides[i]
    if (slide && !picked.some(p => p.slide.id === slide.id)) picked.push({ slide, index: i + 1 })
  }
  return picked
}

/** Slide number in the gutter strip above a tile, never over slide pixels. */
function paintTileNumber(ctx: CanvasRenderingContext2D, label: string, left: number, top: number, labelHeight: number) {
  const size = Math.round(labelHeight * 0.7)
  ctx.save()
  ctx.font = `700 ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
  ctx.textBaseline = 'middle'
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)'
  ctx.fillText(label, left, top + labelHeight / 2)
  ctx.restore()
}

/**
 * Render the deck as one or more contact sheets: numbered slide tiles on a
 * neutral gutter, in reading order. One sheet holds up to `maxPerSheet`
 * slides so a 30-slide deck yields three images rather than one unreadable one.
 */
export async function renderDeckAtlas(deck: {
  slides: Slide[]
  theme: SlideTheme
  viewportSize: number
  viewportRatio: number
}, options: FikaDeckAtlasOptions = {}): Promise<FikaDeckAtlasSheet[]> {
  const tileWidth = Math.max(160, Math.round(options.tileWidth ?? 640))
  const columns = Math.max(1, Math.round(options.columns ?? 3))
  const maxPerSheet = Math.max(1, Math.round(options.maxPerSheet ?? 12))
  const dpr = Math.max(1, options.dpr ?? 1)
  const numbered = options.numbered ?? true
  const gutter = Math.round(tileWidth * 0.04)
  const labelHeight = numbered ? Math.max(18, Math.round(tileWidth * 0.06)) : 0
  const ratio = deck.viewportRatio
  const tileHeight = Math.round(tileWidth * ratio)
  const rowHeight = labelHeight + tileHeight + gutter
  const format = options.format ?? 'image/png'
  const quality = options.quality ?? 0.9
  const timeoutMs = options.timeoutMs ?? 4000

  const targets = resolveAtlasSlides(deck.slides, options.slides)
  const sheets: FikaDeckAtlasSheet[] = []
  for (let start = 0; start < targets.length; start += maxPerSheet) {
    const batch = targets.slice(start, start + maxPerSheet)
    const cols = Math.min(columns, batch.length)
    const rows = Math.ceil(batch.length / cols)
    const width = gutter + cols * (tileWidth + gutter)
    const height = gutter + rows * rowHeight
    const sheet = document.createElement('canvas')
    sheet.width = Math.round(width * dpr)
    sheet.height = Math.round(height * dpr)
    const ctx = sheet.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = options.gutterColor ?? '#1F2937'
    ctx.fillRect(0, 0, width, height)

    const tiles: FikaDeckAtlasTile[] = []
    // Settle every tile concurrently: the wait is dominated by idle windows
    // and resource loads, not paint time, so the sheet costs one slide's wait.
    const painted = await Promise.all(batch.map(async ({ slide }) => {
      const tile = document.createElement('canvas')
      await paintSettled(tile, {
        slide,
        theme: deck.theme,
        viewportSize: deck.viewportSize,
        viewportRatio: ratio,
      }, tileWidth, dpr, timeoutMs)
      return tile
    }))
    for (let i = 0; i < batch.length; i++) {
      const { slide, index } = batch[i]
      const row = Math.floor(i / cols)
      const column = i % cols
      const left = gutter + column * (tileWidth + gutter)
      const top = gutter + row * rowHeight + labelHeight
      ctx.drawImage(painted[i], left, top, tileWidth, tileHeight)
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'
      ctx.lineWidth = 1
      ctx.strokeRect(left + 0.5, top + 0.5, tileWidth - 1, tileHeight - 1)
      if (numbered) paintTileNumber(ctx, String(index), left, top - labelHeight, labelHeight)
      tiles.push({ slideId: slide.id, index, row, column, left, top, width: tileWidth, height: tileHeight })
    }
    sheets.push({
      blob: await encode(sheet, format, quality),
      width: sheet.width,
      height: sheet.height,
      columns: cols,
      rows,
      tiles,
    })
  }
  return sheets
}
