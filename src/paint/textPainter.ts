import {
  materializeRichInlineLineRange,
  prepareRichInline,
  walkRichInlineLineRanges,
} from '@chenglou/pretext/rich-inline'

import type { TextAlign, TextAlignVertical } from '@/types/slides'
import {
  DEFAULT_LIST_PADDING_EM,
  DEFAULT_TEXT_FONT_SIZE,
  LIST_MARKER_GAP_EM,
  extractFitBlocksFromHtml,
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
  lineHeight?: number
  letterSpacing?: number
  paragraphSpace?: number
  inset?: [number, number, number, number]
  vAlign?: TextAlignVertical
  align?: TextAlign
  fit?: boolean
  opacity?: number
  vertical?: boolean
  shadow?: { h: number; v: number; blur: number; color: string }
}

type PreparedLine = {
  block: TextFitBlock
  items: TextFitRun[]
  fragments: ReturnType<typeof materializeRichInlineLineRange>['fragments']
  width: number
  height: number
}

const quoteFamily = (family: string) => {
  const value = family.trim()
  if (!value) return 'sans-serif'
  if (value.includes(',')) return value
  const unquoted = value.replace(/^['"]+|['"]+$/g, '')
  return /\s/.test(unquoted) ? `"${unquoted.replace(/"/g, '\\"')}"` : unquoted
}

const fontOf = (run: TextFitRun, fallbackFamily: string, scale: number) => {
  const style = run.italic ? 'italic' : 'normal'
  const weight = run.bold ? '700' : '400'
  return `${style} ${weight} ${Math.max(0.1, run.size * scale)}px ${quoteFamily(run.fontFamily || fallbackFamily)}`
}

const graphemeCount = (text: string) => {
  if (typeof Intl.Segmenter !== 'function') return text.length
  let count = 0
  for (const _part of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)) count++
  return count
}

const listInset = (block: TextFitBlock, size: number) => {
  if (!block.listItem) return 0
  const gutter = block.listIndentPx != null
    ? block.listIndentPx
    : block.listIndentEm != null
      ? block.listIndentEm * size
      : DEFAULT_LIST_PADDING_EM * size
  return gutter + LIST_MARKER_GAP_EM * size
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
          italic: block.italic,
          fontFamily: block.fontFamily,
        }]
    const items = sourceRuns.map(run => ({
      ...run,
      color: run.color,
      fontFamily: run.fontFamily || block.fontFamily || family,
    }))
    const prepared = prepareRichInline(items.map(run => ({
      text: run.text,
      font: fontOf(run, family, scale),
      ...(letterSpacing ? { letterSpacing } : {}),
    })))
    const maxSize = Math.max(1, ...items.map(run => run.size * scale))
    const lineWidth = Math.max(1, width - listInset(block, maxSize))
    walkRichInlineLineRanges(prepared, lineWidth, range => {
      const line = materializeRichInlineLineRange(prepared, range)
      const lineMaxSize = Math.max(1, ...line.fragments.map(fragment => (
        (items[fragment.itemIndex]?.size || DEFAULT_TEXT_FONT_SIZE) * scale
      )))
      lines.push({
        block,
        items,
        fragments: line.fragments,
        width: line.width,
        height: lineMaxSize * lineHeight,
      })
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
  const inset = options.inset || [10, 10, 10, 10]
  const innerWidth = Math.max(1, options.width - inset[1] - inset[3])
  const innerHeight = Math.max(1, options.height - inset[0] - inset[2])
  const defaultSize = options.defaultSize ?? DEFAULT_TEXT_FONT_SIZE
  const lineHeight = options.lineHeight ?? 1.5
  const letterSpacing = options.letterSpacing || 0
  const paragraphSpace = options.paragraphSpace ?? 5
  const { blocks } = extractFitBlocksFromHtml(options.html, {
    defaultFontFamily: options.defaultFontFamily,
    defaultSize,
  })
  if (!blocks.length) return 0
  for (const block of blocks) {
    block.align ||= options.align
    block.fontFamily ||= options.defaultFontFamily
    if (block.runs) {
      for (const run of block.runs) {
        run.color ||= options.defaultColor
        run.fontFamily ||= block.fontFamily
      }
    }
  }
  const fitScale = options.fit
    ? textFitScaleForHtml(options.html, {
        innerWidth,
        innerHeight,
        defaultFontFamily: options.defaultFontFamily,
        defaultSize,
        lineHeight,
        letterSpacing,
        blockSpace: paragraphSpace,
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
  totalHeight += Math.max(0, blocks.length - 1) * paragraphSpace
  const vOffset = options.vAlign === 'middle'
    ? Math.max(0, (innerHeight - totalHeight) / 2)
    : options.vAlign === 'bottom'
      ? Math.max(0, innerHeight - totalHeight)
      : 0
  let y = options.y + inset[0] + vOffset
  let previousBlock: TextFitBlock | undefined
  for (const line of lines) {
    if (previousBlock && previousBlock !== line.block) y += paragraphSpace
    const indent = listInset(line.block, line.height / lineHeight)
    const align = line.block.align || options.align || 'left'
    const available = innerWidth - indent
    let x = options.x + inset[3] + indent
    if (align === 'center') x += Math.max(0, (available - line.width) / 2)
    else if (align === 'right') x += Math.max(0, available - line.width)

    if (line.block.listMarker && previousBlock !== line.block) {
      const markerRun = line.items[0]
      ctx.font = fontOf(markerRun, options.defaultFontFamily, fitScale)
      ctx.fillStyle = markerRun.color || options.defaultColor
      ctx.textAlign = 'right'
      ctx.textBaseline = 'alphabetic'
      ctx.fillText(line.block.listMarker, options.x + inset[3] + Math.max(0, indent - 5), y + line.height * 0.78)
      ctx.textAlign = 'left'
    }

    for (const fragment of line.fragments) {
      x += fragment.gapBefore
      const run = line.items[fragment.itemIndex]
      if (!run || !fragment.text) {
        x += fragment.occupiedWidth
        continue
      }
      ctx.font = fontOf(run, options.defaultFontFamily, fitScale)
      const metrics = ctx.measureText(fragment.text)
      const ascent = metrics.actualBoundingBoxAscent || run.size * fitScale * 0.8
      const descent = metrics.actualBoundingBoxDescent || run.size * fitScale * 0.2
      const baseline = y + Math.max(0, (line.height - ascent - descent) / 2) + ascent
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
