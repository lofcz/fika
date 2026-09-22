import { resolvePagePositions } from './pageLayout'
import type { WorkspaceLabel, Slide } from '@/types/slides'

/** Conservative text extents for workspace camera fitting; labels remain non-artwork. */
export function workspaceLabelsBounds(slides: readonly Slide[], pageWidth = 1000, pageHeight = 1000) {
  const labels = slides.flatMap(slide => slide.workspaceLabels || []).filter(label => Number.isFinite(label.x) && Number.isFinite(label.y))
  if (!labels.length) return null
  const bounds = labels.map(source => {
    const label = workspaceObjectRect(source, slides, pageWidth, pageHeight)
    if (label.kind) return { minX: label.x, minY: label.y, maxX: label.x + (label.width || 640), maxY: label.y + (label.height || 360) }
    const size = Number.isFinite(label.fontSize) ? label.fontSize : 28
    const lines = label.text.split('\n')
    const maxLine = Math.max(1, ...lines.map(line => line.length))
    const width = Math.min(800, maxLine * size * .75 + 20)
    const rows = lines.reduce((total, line) => total + Math.max(1, Math.ceil(line.length * size * .75 / 780)), 0)
    return { minX: label.x, minY: label.y, maxX: label.x + width, maxY: label.y + rows * size * 1.3 + 16 }
  })
  return { minX: Math.min(...bounds.map(b => b.minX)), minY: Math.min(...bounds.map(b => b.minY)), maxX: Math.max(...bounds.map(b => b.maxX)), maxY: Math.max(...bounds.map(b => b.maxY)) }
}

/** Sections grow to include their explicit member pages, without changing page positions. */
export function workspaceObjectRect(label: WorkspaceLabel, slides: readonly Pick<Slide, 'id' | 'canvasPosition'>[], width: number, height: number): WorkspaceLabel {
  if (label.kind !== 'section' || !label.pageIds?.length) return label
  const positions = resolvePagePositions(slides, width, height)
  const members = label.pageIds.flatMap(id => positions.has(id) ? [positions.get(id)!] : [])
  if (!members.length) return label
  const x = Math.min(label.x, ...members.map(p => p.x - 100)), y = Math.min(label.y, ...members.map(p => p.y - 200))
  const result = { ...label, x, y, width: Math.max(label.x + (label.width || 0), ...members.map(p => p.x + width + 100)) - x, height: Math.max(label.y + (label.height || 0), ...members.map(p => p.y + height + 100)) - y }
  return result.x === label.x && result.y === label.y && result.width === label.width && result.height === label.height ? label : result
}
