import type { Slide } from '@/types/slides'
import type { FikaCanvasContext, FikaCanvasReadOptions } from './types'
import { resolvePagePositions } from '@/views/Myna/pageLayout'

const bounded = (value: number | undefined, fallback: number, max: number) => Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value!))) : fallback
const text = (html: string, limit: number) => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit)

/** Bounded summaries never contain image data, SVG paths, or full rich-text HTML. */
export function summarizeCanvas(slides: Slide[], activePageId: string | undefined, selectedIds: string[], width: number, ratio: number, options: FikaCanvasReadOptions = {}): FikaCanvasContext {
  const positions = resolvePagePositions(slides, width, width * ratio)
  const offset = bounded(options.offset, 0, 1_000_000), limit = bounded(options.limit, 40, 100)
  const textLimit = bounded(options.textLimit, 160, 500)
  const page = slides.find(item => item.id === (options.pageId || activePageId))
  const elements = page?.elements || []
  const slice = elements.slice(offset, offset + limit)
  return {
    viewport: { width, height: width * ratio }, activePageId, selectedIds: selectedIds.slice(0, 100),
    pageCount: slides.length,
    pages: slides.slice(0, 100).map(item => ({ id: item.id, name: item.canvasName?.slice(0, 200), ...positions.get(item.id)!, elementCount: item.elements.length })),
    pageId: page?.id, elementCount: elements.length, offset,
    nextOffset: offset + slice.length < elements.length ? offset + slice.length : undefined,
    elements: slice.map(element => ({
      id: element.id, type: element.type, name: element.name?.slice(0, 100),
      x: element.left, y: element.top, width: element.width, height: 'height' in element ? element.height : undefined,
      parentFrameId: element.parentFrameId, groupId: element.groupId,
      ...('frame' in element && element.frame ? { frame: element.frame } : {}),
      ...(element.type === 'text' ? { text: text(element.content, textLimit) } : {}),
      ...(element.type === 'shape' && element.text ? { text: text(element.text.content, textLimit) } : {}),
    })),
  }
}
