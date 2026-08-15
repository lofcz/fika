/**
 * Live drag preview for canvas elements.
 *
 * Two coordinate spaces, because the painted box and the operate chrome
 * do not live in the same CSS transform:
 *
 * - Slide space: `#editable-element-* > *` sits inside `.viewport`, which
 *   already has `transform: scale(canvasScale)`. `left` / `top` here are
 *   the same unit the store commits on drop.
 * - Visual space: `#operate-element-*` and `.multi-select-operate` sit in
 *   `.viewport-wrapper` (already sized to the *visual* slide). Position
 *   here is slide × canvasScale.
 *
 * Never use CSS `translate` on the painted box. Auto-size text measures
 * and rasterizes differently under a transform than under `left`/`top`,
 * so the glyphs shift on pointerup when the transform is removed. Write
 * the same `left`/`top` the store will commit — drag and drop are one
 * paint path. Scale already does this (`applyLiveSize`).
 */

export type LiveOffsetPosition = {
  id: string
  left: number
  top: number
}

export type LiveOffsetNodes = {
  box?: { style: CSSStyleDeclaration } | null
  operate?: { style: CSSStyleDeclaration } | null
  multi?: { style: CSSStyleDeclaration } | null
}

export type LivePositionCss = {
  slideLeft: string
  slideTop: string
  visualLeft: string
  visualTop: string
}

export const livePositionCss = (left: number, top: number, canvasScale: number): LivePositionCss => ({
  slideLeft: `${left}px`,
  slideTop: `${top}px`,
  visualLeft: `${left * canvasScale}px`,
  visualTop: `${top * canvasScale}px`,
})

export const applyLivePositionStyles = (
  nodes: LiveOffsetNodes,
  left: number,
  top: number,
  canvasScale: number,
) => {
  const css = livePositionCss(left, top, canvasScale)
  if (nodes.box) {
    nodes.box.style.left = css.slideLeft
    nodes.box.style.top = css.slideTop
    if (nodes.box.style.translate) nodes.box.style.translate = ''
  }
  if (nodes.operate) {
    nodes.operate.style.left = css.visualLeft
    nodes.operate.style.top = css.visualTop
    if (nodes.operate.style.translate) nodes.operate.style.translate = ''
  }
  if (nodes.multi) {
    nodes.multi.style.left = css.visualLeft
    nodes.multi.style.top = css.visualTop
    if (nodes.multi.style.translate) nodes.multi.style.translate = ''
  }
}

const editableBox = (id: string) => (
  document.getElementById(`editable-element-${id}`)?.firstElementChild as HTMLElement | null
)

const operateBox = (id: string) => document.getElementById(`operate-element-${id}`)

const multiSelectBox = () => document.querySelector('.multi-select-operate') as HTMLElement | null

export const readLiveMultiOrigin = (canvasScale: number): { left: number; top: number } | null => {
  const multi = multiSelectBox()
  if (!multi || !multi.style.left) return null
  return {
    left: parseFloat(multi.style.left) / canvasScale,
    top: parseFloat(multi.style.top) / canvasScale,
  }
}

export const setLiveElementOffset = (
  origins: readonly LiveOffsetPosition[],
  dxSlide: number,
  dySlide: number,
  canvasScale: number,
  multiOrigin?: { left: number; top: number } | null,
) => {
  for (const origin of origins) {
    applyLivePositionStyles({
      box: editableBox(origin.id),
      operate: operateBox(origin.id),
    }, origin.left + dxSlide, origin.top + dySlide, canvasScale)
  }
  if (multiOrigin) {
    applyLivePositionStyles({
      multi: multiSelectBox(),
    }, multiOrigin.left + dxSlide, multiOrigin.top + dySlide, canvasScale)
  }
}

export const clearLiveElementOffset = (
  origins: readonly LiveOffsetPosition[],
  canvasScale: number,
  multiOrigin?: { left: number; top: number } | null,
) => {
  setLiveElementOffset(origins, 0, 0, canvasScale, multiOrigin)
}

export const settleLiveElementOffset = (
  positions: readonly LiveOffsetPosition[],
  canvasScale: number,
) => {
  for (const { id, left, top } of positions) {
    applyLivePositionStyles({
      box: editableBox(id),
      operate: operateBox(id),
    }, left, top, canvasScale)
  }
}
