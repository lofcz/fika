import {
  materializeRichInlineLineRange,
} from '@chenglou/pretext/rich-inline'

import type { TextAlign, TextAlignVertical } from '@/types/slides'
import { serializeRichTextHtml, normalizeFittedFontSizes } from '@/utils/prosemirror'
import { getInlineMathRaster } from '@/paint/rasterResources'
import { latexFallbackText } from '@/utils/inlineMathBox'
import { measureInlineMathBox } from '@/utils/math'
import {
  DEFAULT_TEXT_FONT_FAMILY,
  DEFAULT_TEXT_FONT_SIZE,
  LIST_MARKER_GAP_EM,
  applyMeasuredMathBoxes,
  walkEditorTextLines,
  extractBlocksCached,
  normalizeFontFamilyName,
  prepareRichInlineCached,
  blockLineBoxHeight,
  fixedLineMetrics,
  listColumnInset,
  paragraphGap,
  pickSpaceRun,
  richInlineFromRun,
  runVisualSize,
  textFitScaleForHtml,
  type TextFitBlock,
  type TextFitRun,
} from '@/utils/textFit'

export type CanvasTextPaintOptions = {
  html: string
  x: number
  y: number
  width: number
  height: number
  defaultFontFamily: string
  defaultColor: string
  defaultSize?: number
  defaultWeight?: number
  defaultItalic?: boolean
  lineHeight?: number
  letterSpacing?: number
  paragraphSpace?: number
  inset?: [number, number, number, number]
  vAlign?: TextAlignVertical
  align?: TextAlign
  fit?: boolean
  minFontSize?: number
  opacity?: number
  vertical?: boolean
  shadow?: { h: number; v: number; blur: number; color: string }
  invalidate?: () => void
  onIncomplete?: () => void
}

type PreparedLine = {
  block: TextFitBlock
  items: TextFitRun[]
  fragments: ReturnType<typeof materializeRichInlineLineRange>['fragments']
  width: number
  height: number
}

const quoteFamily = (family: string) => {
  const value = (family || '').trim()
  if (!value) return DEFAULT_TEXT_FONT_FAMILY
  if (value.includes(',')) return value
  const unquoted = value.replace(/^['"]+|['"]+$/g, '')
  return /\s/.test(unquoted) ? `"${unquoted.replace(/"/g, '\\"')}"` : unquoted
}

const fontOf = (run: TextFitRun, fallbackFamily: string, scale: number) => {
  const style = run.italic ? 'italic' : 'normal'
  const weight = run.bold ? '700' : String(run.fontWeight || 400)
  return `${style} ${weight} ${Math.max(0.1, run.size * scale)}px ${quoteFamily(run.fontFamily || fallbackFamily)}`
}

const requestedFonts = new Set<string>()
const GENERIC_FONT_FAMILIES = new Set([
  'sans-serif',
  'serif',
  'monospace',
  'system-ui',
  'ui-sans-serif',
  'ui-serif',
  'ui-monospace',
  '-apple-system',
  'blinkmacsystemfont',
  'cursive',
  'fantasy',
  'emoji',
])

/**
 * Lightweight fallback for faces declared via `@font-face` that were not yet
 * preloaded at deck load time. Skips generic stacks and undeclared system fonts,
 * and relies on the coalesced `document.fonts` `loadingdone` handler instead of
 * triggering per-run invalidations.
 */
const ensurePaintFontLoaded = (
  run: Pick<TextFitRun, 'italic' | 'bold' | 'fontWeight' | 'fontFamily'>,
  fallbackFamily: string,
  invalidate?: () => void,
) => {
  if (typeof document === 'undefined' || !document.fonts?.load) return
  const rawFamily = run.fontFamily || fallbackFamily
  const primary = normalizeFontFamilyName(rawFamily)
  if (!primary || GENERIC_FONT_FAMILIES.has(primary)) return
  const style = run.italic ? 'italic' : 'normal'
  const weight = run.bold ? '700' : String(run.fontWeight || 400)
  const faceKey = `${style} ${weight} 16px ${primary}`
  if (requestedFonts.has(faceKey)) return
  requestedFonts.add(faceKey)
  // Only load if a matching `@font-face` exists in `document.fonts` and is still unloaded.
  let hasUnloadedDeclaredFace = false
  try {
    for (const face of document.fonts as unknown as Iterable<FontFace>) {
      if (face.status === 'unloaded' && normalizeFontFamilyName(face.family) === primary) {
        hasUnloadedDeclaredFace = true
        break
      }
    }
  }
  catch {
    return
  }
  if (!hasUnloadedDeclaredFace) return
  void document.fonts.load(`${style} ${weight} 16px ${quoteFamily(rawFamily)}`).then(faces => {
    // Only invalidate if no global loadingdone event will cover it (e.g. mocked fonts).
    if (faces.some(face => face.status === 'loaded') && typeof document.fonts.addEventListener !== 'function') {
      invalidate?.()
    }
  }).catch(() => {})
}

const graphemeCount = (text: string) => {
  if (typeof Intl.Segmenter !== 'function') return text.length
  let count = 0
  for (const _part of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)) count++
  return count
}

const textRunOf = (items: TextFitRun[]) => items.find(run => !run.mathLatex) || items[0]

/**
 * One baseline per line, from the *font* metrics of its largest text run. Ink
 * bounds (`actualBoundingBox*`) differ per fragment — a trailing "." after a
 * bold or math run has almost no ascent, and centring it by its own ink would
 * float it to the middle of the line.
 */
const lineBaseline = (
  ctx: CanvasRenderingContext2D,
  line: { block: TextFitBlock; height: number; items: TextFitRun[]; fragments: { itemIndex: number; text?: string }[] },
  y: number,
  fallbackFamily: string,
  scale: number,
) => {
  if (line.block.lineHeightPx != null) {
    const runs = line.fragments.map(fragment => line.items[fragment.itemIndex]).filter(Boolean)
    return y + fixedLineMetrics(line.block, runs.length ? runs : line.items, scale).ascent
  }
  let anchor: TextFitRun | undefined
  for (const fragment of line.fragments) {
    const run = line.items[fragment.itemIndex]
    if (!run || run.mathLatex || !fragment.text) continue
    if (!anchor || run.size > anchor.size) anchor = run
  }
  anchor ??= textRunOf(line.items)
  const size = (anchor?.size || DEFAULT_TEXT_FONT_SIZE) * scale
  if (anchor) ctx.font = fontOf({ ...anchor, italic: false }, fallbackFamily, scale)
  const metrics = ctx.measureText('Hg')
  const ascent = metrics.fontBoundingBoxAscent || metrics.actualBoundingBoxAscent || size * 0.8
  const descent = metrics.fontBoundingBoxDescent || metrics.actualBoundingBoxDescent || size * 0.2
  // Half-leading may go negative: with line-height below the font's own box
  // (e.g. `1` on a badge digit) CSS still centres the content area, so the
  // canvas must too — clamping at 0 sat the glyph a few px low.
  return y + (line.height - ascent - descent) / 2 + ascent
}

const paintText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  baseline: number,
  run: TextFitRun,
  family: string,
  scale: number,
  letterSpacing: number,
) => {
  ctx.font = fontOf(run, family, scale)
  ctx.fillStyle = run.color || '#333'
  const canvasText = ctx as CanvasRenderingContext2D & { letterSpacing?: string }
  if ('letterSpacing' in canvasText) canvasText.letterSpacing = `${letterSpacing}px`
  ctx.fillText(text, x, baseline)
  const metrics = ctx.measureText(text)
  const width = metrics.width + Math.max(0, graphemeCount(text) - 1) * letterSpacing
  const size = run.size * scale
  ctx.lineWidth = Math.max(0.75, size * 0.055)
  ctx.strokeStyle = run.color || '#333'
  if (run.underline) {
    ctx.beginPath()
    ctx.moveTo(x, baseline + Math.max(1, size * 0.08))
    ctx.lineTo(x + width, baseline + Math.max(1, size * 0.08))
    ctx.stroke()
  }
  if (run.strikethrough) {
    ctx.beginPath()
    ctx.moveTo(x, baseline - size * 0.3)
    ctx.lineTo(x + width, baseline - size * 0.3)
    ctx.stroke()
  }
}

const prepareLines = (
  blocks: TextFitBlock[],
  width: number,
  family: string,
  scale: number,
  lineHeight: number,
  letterSpacing: number,
): PreparedLine[] => {
  const lines: PreparedLine[] = []
  for (const block of blocks) {
    const sourceRuns = block.runs?.length
      ? block.runs
      : [{
          text: block.text,
          size: block.size || DEFAULT_TEXT_FONT_SIZE,
          bold: block.bold,
          fontWeight: block.fontWeight,
          italic: block.italic,
          fontFamily: block.fontFamily,
        }]
    const items = sourceRuns.map(run => ({
      ...run,
      color: run.color,
      fontFamily: run.fontFamily || block.fontFamily || family,
    }))
    const prepared = prepareRichInlineCached(items.map(run => (
      richInlineFromRun(run, fontOf(run, family, scale), scale, letterSpacing || undefined)
    )), block.whiteSpace, letterSpacing || undefined)
    const firstLine = lines.length
    const lineWidth = Math.max(1, width - listColumnInset(block, scale))
    const spaceRun = pickSpaceRun(items)
    walkEditorTextLines(prepared, lineWidth, fontOf(spaceRun, family, scale), range => {
      const line = materializeRichInlineLineRange(prepared, range)
      const lineRuns: TextFitRun[] = []
      for (const fragment of line.fragments) {
        const run = items[fragment.itemIndex]
        if (run) lineRuns.push(run)
      }
      if (!lineRuns.length) lineRuns.push(...items)
      lines.push({
        block,
        items,
        fragments: line.fragments,
        width: line.width,
        height: Math.max(1, blockLineBoxHeight(block, lineRuns, scale, lineHeight)),
      })
    })
    // Empty paragraphs have no glyph fragments but still own an authored line.
    if (lines.length === firstLine) lines.push({
      block, items, fragments: [], width: 0,
      height: Math.max(1, blockLineBoxHeight(block, items, scale, lineHeight)),
    })
  }
  return lines
}

/**
 * Paint ProseMirror HTML without mounting DOM. Pretext owns Unicode-aware
 * wrapping; Canvas owns glyph shaping and rasterization at the final DPR.
 */
export const paintRichText = (
  ctx: CanvasRenderingContext2D,
  options: CanvasTextPaintOptions,
): number => {
  if (!options.html || options.width <= 0 || options.height <= 0) return 0
  const html = normalizeFittedFontSizes(serializeRichTextHtml(options.html))
  const inset = options.inset || [10, 10, 10, 10]
  const innerWidth = Math.max(1, options.width - inset[1] - inset[3])
  const innerHeight = Math.max(1, options.height - inset[0] - inset[2])
  const defaultSize = options.defaultSize ?? DEFAULT_TEXT_FONT_SIZE
  const lineHeight = options.lineHeight ?? 1.5
  const letterSpacing = options.letterSpacing || 0
  const paragraphSpace = options.paragraphSpace ?? 5
  const { blocks: cachedBlocks } = extractBlocksCached(
    html,
    options.defaultFontFamily,
    defaultSize,
    options.defaultWeight,
    options.defaultItalic,
  )
  if (!cachedBlocks.length) return 0
  // Shallow-clone blocks/runs before applying per-paint defaults so the shared
  // extraction cache stays immutable across calls with different colors/aligns.
  const blocks: TextFitBlock[] = cachedBlocks.map(block => {
    const fontFamily = block.fontFamily || options.defaultFontFamily
    const runs = block.runs?.map(run => {
      const nextRun: TextFitRun = {
        ...run,
        color: run.color || options.defaultColor,
        fontFamily: run.fontFamily || fontFamily,
      }
      ensurePaintFontLoaded(nextRun, options.defaultFontFamily, options.invalidate)
      return nextRun
    })
    if (!runs) ensurePaintFontLoaded(block, options.defaultFontFamily, options.invalidate)
    return {
      ...block,
      align: block.listItem ? block.align : (block.align || options.align),
      fontFamily,
      ...(runs ? { runs } : {}),
    }
  })
  applyMeasuredMathBoxes(blocks, measureInlineMathBox)
  const fitScale = options.fit
    ? textFitScaleForHtml(html, {
        innerWidth,
        innerHeight,
        defaultFontFamily: options.defaultFontFamily,
        defaultSize,
        defaultWeight: options.defaultWeight,
        defaultItalic: options.defaultItalic,
        lineHeight,
        letterSpacing,
        blockSpace: paragraphSpace,
        minFontSize: options.minFontSize,
      })
    : 1

  ctx.save()
  ctx.globalAlpha *= options.opacity ?? 1
  if (options.shadow) {
    ctx.shadowOffsetX = options.shadow.h
    ctx.shadowOffsetY = options.shadow.v
    ctx.shadowBlur = options.shadow.blur
    ctx.shadowColor = options.shadow.color
  }
  if (options.vertical) {
    ctx.translate(options.x + options.width, options.y)
    ctx.rotate(Math.PI / 2)
    const painted = paintRichText(ctx, {
      ...options,
      x: inset[0],
      y: 0,
      width: options.height,
      height: options.width,
      inset: [inset[3], inset[0], inset[1], inset[2]],
      vertical: false,
      shadow: undefined,
    })
    ctx.restore()
    return painted
  }

  const lines = prepareLines(blocks, innerWidth, options.defaultFontFamily, fitScale, lineHeight, letterSpacing)
  let totalHeight = lines.reduce((sum, line) => sum + line.height, 0)
  totalHeight += blocks.reduce((sum, block, index) => sum + paragraphGap(blocks[index - 1], block, paragraphSpace), 0) + (blocks.at(-1)?.marginBottom ?? 0)
  const vOffset = options.vAlign === 'middle'
    ? Math.max(0, (innerHeight - totalHeight) / 2)
    : options.vAlign === 'bottom'
      ? Math.max(0, innerHeight - totalHeight)
      : 0
  let y = options.y + inset[0] + vOffset
  let previousBlock: TextFitBlock | undefined
  for (const line of lines) {
    if (previousBlock !== line.block) y += paragraphGap(previousBlock, line.block, paragraphSpace)
    const indent = listColumnInset(line.block, fitScale)
    const align = line.block.align || (line.block.listItem ? 'left' : options.align) || 'left'
    const available = innerWidth - indent
    let x = options.x + inset[3] + indent
    if (align === 'center') x += Math.max(0, (available - line.width) / 2)
    else if (align === 'right') x += Math.max(0, available - line.width)

    const baseline = lineBaseline(ctx, line, y, options.defaultFontFamily, fitScale)

    if (line.block.listMarker && previousBlock !== line.block) {
      // Match CSS `ul > li::marker / ol > li::marker`: sized in the list's own
      // `1em`, regular weight, and `currentColor` from <li>/<ul> (not an inner span).
      const markerEm = Math.max(1, (line.block.listFontSize ?? line.block.paragraphSize ?? DEFAULT_TEXT_FONT_SIZE) * fitScale)
      const markerFamily = line.block.listOrdered
        ? (line.block.fontFamily || options.defaultFontFamily)
        : "Arial, 'Segoe UI', sans-serif"
      ctx.font = `normal 400 ${markerEm}px ${quoteFamily(markerFamily)}`
      ctx.fillStyle = line.block.listColor || options.defaultColor
      ctx.textAlign = 'right'
      ctx.textBaseline = 'alphabetic'
      ctx.fillText(line.block.listMarker, options.x + inset[3] + Math.max(0, indent - LIST_MARKER_GAP_EM * markerEm), baseline)
      ctx.textAlign = 'left'
    }

    for (const fragment of line.fragments) {
      x += fragment.gapBefore
      const run = line.items[fragment.itemIndex]
      if (!run) {
        x += fragment.occupiedWidth
        continue
      }
      if (run.mathLatex) {
        const color = run.color || options.defaultColor
        const chipW = fragment.occupiedWidth
        const chipH = runVisualSize(run) * fitScale
        const chipY = y + Math.max(0, (line.height - chipH) / 2)
        const raster = getInlineMathRaster(
          run.mathLatex,
          run.size * fitScale,
          color,
          !!run.mathDisplay,
          options.invalidate ?? (() => {}),
        )
        if (raster && chipW > 0 && chipH > 0) {
          const natW = Math.max(1, raster.width)
          const natH = Math.max(1, raster.height)
          const scale = Math.min(chipW / natW, chipH / natH)
          const dw = natW * scale
          const dh = natH * scale
          ctx.drawImage(raster, x, chipY + Math.max(0, (chipH - dh) / 2), dw, dh)
        }
        else {
          options.onIncomplete?.()
          if (chipW > 0) {
            ctx.save()
            ctx.font = fontOf({ ...run, italic: false }, options.defaultFontFamily, fitScale)
            ctx.fillStyle = color
            ctx.textAlign = 'left'
            ctx.textBaseline = 'middle'
            ctx.fillText(latexFallbackText(run.mathLatex), x, y + line.height / 2, chipW)
            ctx.restore()
          }
        }
        x += fragment.occupiedWidth
        continue
      }
      if (!fragment.text) {
        x += fragment.occupiedWidth
        continue
      }
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      paintText(ctx, fragment.text, x, baseline, {
        ...run,
        color: run.color || options.defaultColor,
      }, options.defaultFontFamily, fitScale, letterSpacing)
      x += fragment.occupiedWidth
    }
    y += line.height
    previousBlock = line.block
  }
  ctx.restore()
  return totalHeight
}
