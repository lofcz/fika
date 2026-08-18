import type { PPTShapeElement } from '@/types/slides'
import { resolveShapePaintPath } from '@/utils/elementOutline'

const escapeBoothText = (value: string) => (
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
)

export const shapePathScale = (element: Pick<PPTShapeElement, 'width' | 'height' | 'viewBox'>) => {
  const [vbW, vbH] = element.viewBox
  return {
    x: vbW ? element.width / vbW : 1,
    y: vbH ? element.height / vbH : 1,
  }
}

/** Same transform the live editor SVG applies to `element.path`. */
export const shapePathTransform = (element: Pick<PPTShapeElement, 'width' | 'height' | 'viewBox'>) => {
  const { x, y } = shapePathScale(element)
  return `scale(${x}, ${y})`
}

const svgFill = (element: PPTShapeElement) => {
  if (element.pattern) return 'none'
  if (element.gradient?.colors?.[0]?.color) return element.gradient.colors[0].color
  return element.fill || 'none'
}

/**
 * Editor-equivalent SVG (+ optional ProseMirror label). SnapDOM this instead of
 * asking Konva to interpret PPTX/catalog arcs — browsers correct `A 50 50`
 * radii, Konva does not.
 */
export const shapePaintHtml = (
  element: PPTShapeElement,
  text?: { body: string; ink: string; fontFamily: string; align?: string; inset?: [number, number, number, number]; lineHeight?: number; letterSpacing?: number; paragraphSpace?: number; fitScale?: number },
) => {
  const outline = element.outline
  const stroke = outline?.width ? escapeBoothText(outline.color || '#18181b') : 'none'
  const strokeWidth = outline?.width || 0
  const dash = outline?.style === 'dashed' ? '4 4' : outline?.style === 'dotted' ? '1 3' : ''
  const join = outline?.radius ? 'round' : 'miter'
  const svg = `<svg overflow="visible" width="${element.width}" height="${element.height}"><g transform="${shapePathTransform(element)}"><path vector-effect="non-scaling-stroke" stroke-linecap="butt" stroke-linejoin="${join}" stroke-miterlimit="8" d="${escapeBoothText(resolveShapePaintPath(element))}" fill="${escapeBoothText(svgFill(element))}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash ? ` stroke-dasharray="${dash}"` : ''}/></g></svg>`
  if (!text?.body) {
    return `<div data-fika-shape-paint="svg" style="width:${element.width}px;height:${element.height}px;position:relative;opacity:${element.opacity ?? 1}">${svg}</div>`
  }
  const inset = text.inset || [10, 10, 10, 10]
  const justify = text.align === 'top' ? 'flex-start' : text.align === 'bottom' ? 'flex-end' : 'center'
  // Same variables the editor's fit host sets (calc() font sizes re-wrap).
  const fitVars = (text.fitScale ?? 1) < 1
    ? `--text-fit-scale:${text.fitScale};--text-fit-base-size:${Math.round(16 * (text.fitScale ?? 1) * 100) / 100}px;`
    : ''
  const inner = `<div class="ProseMirror ProseMirror-static">${text.body}</div>`
  return `<div data-fika-shape-paint="svg" style="width:${element.width}px;height:${element.height}px;position:relative;opacity:${element.opacity ?? 1};color:${escapeBoothText(text.ink)};font-family:${escapeBoothText(text.fontFamily)}">${svg}<div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:${justify};box-sizing:border-box;padding:${inset[0]}px ${inset[1]}px ${inset[2]}px ${inset[3]}px;line-height:${text.lineHeight ?? 1.5};letter-spacing:${text.letterSpacing || 0}px;--paragraphSpace:${text.paragraphSpace === undefined ? 5 : text.paragraphSpace}px;${fitVars}">${inner}</div></div>`
}
