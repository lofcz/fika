import type { PPTShapeElement } from '@/types/slides'

const tagsAndBreaks = /<br\s*\/?>|<[^>]+>/gi

export const shapeTextIsEmpty = (html?: string) => (
  !html?.replace(tagsAndBreaks, '').replace(/&nbsp;/g, ' ').trim()
)

const compactPath = (path: string) => path.trim().replace(/,/g, ' ').replace(/\s+/g, ' ')

/** Imported PPTX rects and formula rects that fill the viewBox. */
export const isAxisAlignedRectPath = (path: string, viewBox: [number, number]) => {
  const [vw, vh] = viewBox
  if (!vw || !vh) return false
  const d = compactPath(path)
  return (
    d === `M 0 0 L ${vw} 0 L ${vw} ${vh} L 0 ${vh} Z`
    || d === `M0 0 L${vw} 0 L${vw} ${vh} L0 ${vh} Z`
    || d === `M 0 0 H ${vw} V ${vh} H 0 Z`
    || d === `M0 0 H${vw} V${vh} H0 Z`
    || d === 'M 0 0 L 200 0 L 200 200 L 0 200 Z'
    || d === 'M0 0 L200 0 L200 200 L0 200 Z'
  )
}

export const isSimpleShape = (element: PPTShapeElement) => (
  !element.pattern
  && shapeTextIsEmpty(element.text?.content)
  && !element.shadow
  && !element.rotate
  && !element.flipH
  && !element.flipV
)
