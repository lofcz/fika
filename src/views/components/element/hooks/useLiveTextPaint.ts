import { useMemo } from 'react'
import tinycolor from 'tinycolor2'
import { useSlidesStore, selectCurrentSlide } from '@/store'
import type { PPTElement, PPTShapeElement, PPTTextElement, SlideBackground } from '@/types/slides'
import { resolveElementSurfaces, resolveLiveTextPaint } from '@/utils/textContrast'

const OPAQUE_ALPHA = 0.95
const opaqueFillCache = new Map<string, boolean>()
let nextTableDataRev = 1
const tableDataRevMap = new WeakMap<object, number>()

function tableDataRev(data: object): number {
  let rev = tableDataRevMap.get(data)
  if (rev === undefined) {
    rev = nextTableDataRev++
    tableDataRevMap.set(data, rev)
  }
  return rev
}

function isOpaqueSolidFill(fill?: string): boolean {
  if (!fill) return false
  const cached = opaqueFillCache.get(fill)
  if (cached !== undefined) return cached
  const c = tinycolor(fill)
  const opaque = c.isValid() && c.getAlpha() >= OPAQUE_ALPHA
  if (opaqueFillCache.size >= 256) opaqueFillCache.clear()
  opaqueFillCache.set(fill, opaque)
  return opaque
}

function hasOpaqueOwnSurface(el: PPTTextElement | PPTShapeElement): boolean {
  if (el.type === 'shape') {
    if (el.pattern || el.gradient) return true
    if (typeof el.opacity === 'number' && el.opacity < OPAQUE_ALPHA) return false
    return isOpaqueSolidFill(el.fill)
  }
  return isOpaqueSolidFill(el.fill)
}

function backgroundSignature(bg: SlideBackground | undefined): string {
  if (!bg) return ''
  if (bg.type === 'solid') return `s:${bg.color || ''}`
  if (bg.type === 'image') return `i:${bg.image?.src || ''}`
  if (bg.type === 'gradient' && bg.gradient) {
    const stops = bg.gradient.colors.map(c => `${c.pos}:${c.color}`).join(',')
    return `g:${bg.gradient.type}:${bg.gradient.rotate}:${stops}`
  }
  return bg.type
}

function mayOverlap(target: PPTTextElement | PPTShapeElement, other: PPTElement): boolean {
  if (other.type === 'line' || other.type === 'latex' || other.type === 'audio') return false
  const oH = 'height' in other ? other.height : 0
  const pad = (other.rotate || target.rotate) ? Math.max(other.width, oH, target.width, target.height) * 0.5 : 0
  return (
    other.left - pad <= target.left + target.width
    && other.left + other.width + pad >= target.left
    && other.top - pad <= target.top + target.height
    && other.top + oH + pad >= target.top
  )
}

function underElementSignature(el: PPTElement): string {
  const h = 'height' in el ? el.height : 0
  const r = 'rotate' in el ? el.rotate : 0
  if (el.type === 'text') {
    if (!el.fill) return ''
    return `t:${el.id}:${el.left},${el.top},${el.width},${h},${r}:${el.fill}`
  }
  if (el.type === 'shape') {
    const grad = el.gradient ? el.gradient.colors.map(c => c.color).join(',') : ''
    if (!el.fill && !grad && !el.pattern) return ''
    return `s:${el.id}:${el.left},${el.top},${el.width},${h},${r}:${el.fill || ''}:${el.opacity ?? 1}:${grad}:${el.pattern ? 1 : 0}:${el.path || ''}:${el.flipH ? 1 : 0}:${el.flipV ? 1 : 0}`
  }
  if (el.type === 'table') {
    const t = el.theme
    const themeKey = t
      ? `${t.color || ''}:${t.rowHeader ? 1 : 0}${t.rowFooter ? 1 : 0}${t.colHeader ? 1 : 0}${t.colFooter ? 1 : 0}`
      : ''
    return `tb:${el.id}:${el.left},${el.top},${el.width},${h}:${el.cellMinHeight ?? ''}:${themeKey}:${tableDataRev(el.data)}`
  }
  if (el.type === 'image') {
    return `im:${el.id}:${el.left},${el.top},${el.width},${h},${r}:${el.colorMask || ''}`
  }
  return `${el.type}:${el.id}:${el.left},${el.top},${el.width},${h},${r}`
}

/**
 * Granular paint-time contrast hook for TextElement & ShapeElement.
 *
 * Avoids subscribing to raw `selectCurrentSlide` (which changes reference on
 * every sibling edit/keystroke). Elements with an opaque own fill skip
 * background/sibling subscriptions entirely; translucent/transparent elements
 * only invalidate when slide background or an overlapping element *below* them
 * changes paint/geometry (ignoring sibling text content changes).
 */
export function useLiveTextPaint(
  element: PPTTextElement | PPTShapeElement,
  preferredColor: string | undefined,
  html: string,
) {
  const opaqueOwn = hasOpaqueOwnSurface(element)
  const themeFontColor = useSlidesStore(s => s.theme?.fontColor)
  const themeBackgroundColor = useSlidesStore(s => s.theme?.backgroundColor)
  const bgSig = useSlidesStore(s => (opaqueOwn ? '' : backgroundSignature(selectCurrentSlide(s)?.background)))
  const underSig = useSlidesStore(s => {
    if (opaqueOwn) return ''
    const slide = selectCurrentSlide(s)
    if (!slide) return ''
    const elements = slide.elements
    const idx = elements.findIndex(item => item.id === element.id)
    if (idx <= 0) return ''
    let sig = ''
    for (let i = 0; i < idx; i++) {
      const other = elements[i]
      if (!mayOverlap(element, other)) continue
      const part = underElementSignature(other)
      if (part) sig += (sig ? '|' : '') + part
    }
    return sig
  })

  const shapeGradient = element.type === 'shape' ? element.gradient : undefined
  const shapePattern = element.type === 'shape' ? element.pattern : undefined

  const painted = useMemo(() => {
    const slide = opaqueOwn ? undefined : selectCurrentSlide(useSlidesStore.getState())
    return resolveLiveTextPaint(preferredColor || themeFontColor || '#333', html, {
      element,
      elements: slide?.elements,
      fill: element.fill,
      background: slide?.background,
      fallbackSurface: themeBackgroundColor,
      themeFontColor,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps -- bgSig + underSig capture relevant slide background & overlapping under-elements
  }, [
    opaqueOwn,
    preferredColor,
    html,
    element.id,
    element.fill,
    element.left,
    element.top,
    element.width,
    element.height,
    element.rotate,
    element.opacity,
    shapeGradient,
    shapePattern,
    themeFontColor,
    themeBackgroundColor,
    bgSig,
    underSig,
  ])

  const elementSurfaces = useMemo(() => {
    const slide = opaqueOwn ? undefined : selectCurrentSlide(useSlidesStore.getState())
    return resolveElementSurfaces({
      fill: element.fill,
      background: slide?.background,
      fallbackSurface: themeBackgroundColor,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps -- bgSig captures slide.background changes
  }, [opaqueOwn, element.fill, themeBackgroundColor, bgSig])

  return { painted, elementSurfaces }
}
