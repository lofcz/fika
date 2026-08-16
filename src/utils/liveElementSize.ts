/**
 * Live resize for canvas elements.
 *
 * One writer (`applyLiveSize`) updates the painted box, `[data-live-box]`,
 * and operate chrome. Contents that depend on box size must read that live
 * geometry — never wait for the store commit on pointerup.
 *
 * Auto-height boxes opt out with `data-live-auto-height` (or `height: auto`).
 * Missing inline height is not an opt-out — tables and other content-sized
 * wrappers still preview both axes. Direct-child SVGs get a viewBox so
 * preserveAspectRatio=none can stretch Y, and tables update row heights.
 */

export type LiveBoxSize = {
  width: number
  height: number
}

const parsePx = (value: string | undefined): number => {
  if (!value || value === 'auto') return 0
  const n = parseFloat(value)
  return Number.isFinite(n) ? n : 0
}

export const isAutoCss = (value: string | undefined) => !value || value === 'auto'

export const isLiveAutoHeight = (el: HTMLElement | null | undefined) => (
  !!el && (
    el.hasAttribute('data-live-auto-height')
    || el.style.height === 'auto'
  )
)

export const readLiveBoxSize = (
  box: HTMLElement | null | undefined,
  fallback: LiveBoxSize,
): LiveBoxSize => {
  const width = parsePx(box?.style.width) || fallback.width
  const height = parsePx(box?.style.height) || fallback.height
  return {
    width: width > 0 ? width : fallback.width,
    height: height > 0 ? height : fallback.height,
  }
}

export const liveBoxOf = (node: HTMLElement | null | undefined): HTMLElement | null => {
  if (!node) return null
  return (node.closest('[data-live-box]') as HTMLElement | null) ?? node.parentElement
}

/** Uniform scale that fits `natural` inside `box` without growing past 1 when either side is empty. */
export const fitUniformScale = (natural: LiveBoxSize, box: LiveBoxSize): number => {
  if (!(natural.width > 0) || !(natural.height > 0) || !(box.width > 0) || !(box.height > 0)) return 1
  return Math.min(box.width / natural.width, box.height / natural.height)
}

const editableRoot = (id: string) => (
  typeof document === 'undefined' ? null : document.getElementById(`editable-element-${id}`)
)

type LiveBoxListener = (id: string, size: LiveBoxSize) => void
const liveBoxListeners = new Set<LiveBoxListener>()

export const subscribeLiveBox = (listener: LiveBoxListener) => {
  liveBoxListeners.add(listener)
  return () => {
    liveBoxListeners.delete(listener)
  }
}

const notifyLiveBox = (id: string, width: number, height: number) => {
  if (!liveBoxListeners.size) return
  const size = { width, height }
  for (const listener of liveBoxListeners) listener(id, size)
}

const LIVE_SVG_SCALE_RE = /scale\(([^,]+),\s*([^)]+)\)/

export const shapeGroupTransform = (
  width: number,
  height: number,
  viewBox: readonly [number, number] | readonly number[],
) => `scale(${width / viewBox[0]}, ${height / viewBox[1]}) translate(0,0) matrix(1,0,0,1,0,0)`

export const syncShapePaint = (
  svg: SVGSVGElement,
  width: number,
  height: number,
  viewBox: readonly [number, number] | readonly number[],
) => {
  svg.removeAttribute('viewBox')
  svg.removeAttribute('preserveAspectRatio')
  svg.style.width = ''
  svg.style.height = ''
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(height))
  const g = svg.querySelector(':scope > g')
  if (g) g.setAttribute('transform', shapeGroupTransform(width, height, viewBox))
}

export const tableCellMinHeight = (boxHeight: number, rowCount: number) => (
  boxHeight / Math.max(rowCount, 1)
)

export type LivePaintExtras = {
  path?: string
  viewBox?: readonly number[]
}

const stretchLiveSvg = (svg: SVGSVGElement, width: number, height: number, extras?: LivePaintExtras) => {
  if (extras?.path) {
    const pathEl = svg.querySelector('path')
    if (pathEl) pathEl.setAttribute('d', extras.path)
    syncShapePaint(svg, width, height, extras.viewBox ?? [width, height])
    return
  }
  const g = svg.querySelector(':scope > g')
  const attrW = parseFloat(svg.getAttribute('width') || '')
  const attrH = parseFloat(svg.getAttribute('height') || '')
  if (g) {
    const current = g.getAttribute('transform') || ''
    const match = current.match(LIVE_SVG_SCALE_RE)
    if (match && attrW > 0 && attrH > 0) {
      const sx = parseFloat(match[1]) * (width / attrW)
      const sy = parseFloat(match[2]) * (height / attrH)
      g.setAttribute('transform', current.replace(LIVE_SVG_SCALE_RE, `scale(${sx}, ${sy})`))
    }
    svg.removeAttribute('viewBox')
    svg.removeAttribute('preserveAspectRatio')
  }
  else if (!svg.hasAttribute('viewBox')) {
    const viewW = attrW > 0 ? attrW : width
    const viewH = attrH > 0 ? attrH : height
    if (viewW > 0 && viewH > 0) svg.setAttribute('viewBox', `0 0 ${viewW} ${viewH}`)
    svg.setAttribute('preserveAspectRatio', 'none')
  }
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(height))
  svg.style.width = '100%'
  svg.style.height = '100%'
}

const readColOrigin = (col: Element, fallback: number) => {
  const attr = parseFloat(col.getAttribute('width') || '')
  if (attr > 0) return attr
  const css = parseFloat((col as HTMLElement).style.width || '')
  return css > 0 ? css : fallback
}

const stretchLiveTable = (table: HTMLTableElement, width: number, height: number) => {
  const wrap = table.parentElement
  if (wrap) {
    wrap.style.width = `${width}px`
    wrap.style.maxWidth = `${width}px`
    wrap.style.minWidth = `${width}px`
    wrap.style.height = `${height}px`
    wrap.style.overflow = 'hidden'
  }
  table.style.tableLayout = 'fixed'
  table.style.width = `${width}px`
  table.style.maxWidth = `${width}px`
  table.style.minWidth = `${width}px`
  table.style.height = `${height}px`
  const cols = [...table.querySelectorAll('col')]
  if (cols.length) {
    let origins = table.dataset.liveColOrigin?.split(',').map(Number)
    if (!origins || origins.length !== cols.length || origins.some(n => !(n > 0))) {
      const fallback = width / cols.length
      origins = cols.map(col => readColOrigin(col, fallback))
      table.dataset.liveColOrigin = origins.join(',')
    }
    const originSum = origins.reduce((a, b) => a + b, 0) || width
    for (let i = 0; i < cols.length; i++) {
      const next = origins[i] * (width / originSum)
      cols[i].setAttribute('width', String(next))
      ;(cols[i] as HTMLElement).style.width = `${next}px`
    }
  }
  const rows = table.querySelectorAll('tr')
  if (!rows.length) return
  const rowH = height / rows.length
  for (const tr of rows) (tr as HTMLElement).style.height = `${rowH}px`
  for (const cell of table.querySelectorAll('td, th')) {
    ;(cell as HTMLElement).style.height = `${rowH}px`
  }
}

const stretchLiveContents = (content: HTMLElement, width: number, height: number, extras?: LivePaintExtras) => {
  for (const svg of content.querySelectorAll(':scope > svg')) {
    stretchLiveSvg(svg as SVGSVGElement, width, height, extras)
  }
  const table = (
    content.querySelector('[data-live-table] table')
    || content.querySelector('table')
  )
  if (table instanceof HTMLTableElement) stretchLiveTable(table, width, height)
}

/** True when the element's height is text-driven (auto-height box). */
export const autoHeightInsetSum = (el: {
  type?: string
  fixedHeight?: boolean
  vertical?: boolean
  inset?: readonly number[]
  text?: { fixedHeight?: boolean; inset?: readonly number[] } | null
}): number | null => {
  if (el.type === 'text' && !el.fixedHeight && !el.vertical) {
    const inset = el.inset || [10, 10, 10, 10]
    return inset[0] + inset[2]
  }
  if (el.type === 'shape' && el.text && el.text.fixedHeight === false) {
    const inset = el.text.inset || [10, 10, 10, 10]
    return inset[0] + inset[2]
  }
  return null
}

/**
 * Height the auto-height element's text actually needs at its CURRENT live
 * width (call after the width has been painted). scrollHeight reports the
 * true content height even when the container still carries a stale height.
 */
export const measureAutoTextHeight = (id: string, insetSum: number): number | null => {
  const root = editableRoot(id)
  const pm = root?.querySelector('.ProseMirror, .ProseMirror-static, .prosemirror-editor') as HTMLElement | null
  if (!pm) return null
  const next = Math.ceil(pm.scrollHeight + insetSum)
  return next > 0 ? next : null
}

export const applyLiveSize = (
  id: string,
  left: number,
  top: number,
  width: number,
  height: number,
  canvasScale: number,
  extras?: LivePaintExtras,
  options?: { forceHeight?: boolean },
) => {
  const root = editableRoot(id)
  const box = root?.firstElementChild as HTMLElement | null
  const content = (
    root?.querySelector('[data-live-box]')
    || box?.querySelector('.element-content')
    || box?.firstElementChild?.firstElementChild
  ) as HTMLElement | null
  // `forceHeight`: an auto-height box whose TEXT height is being live-painted
  // (resize drag rewrap) — write the measured height instead of skipping.
  const autoHeight = options?.forceHeight ? false : (isLiveAutoHeight(content) || isLiveAutoHeight(box))
  if (box) {
    box.style.left = `${left}px`
    box.style.top = `${top}px`
    box.style.width = `${width}px`
    if (!autoHeight) box.style.height = `${height}px`
  }
  if (content) {
    content.style.width = `${width}px`
    if (!autoHeight) content.style.height = `${height}px`
  }
  if (content && !autoHeight) stretchLiveContents(content, width, height, extras)
  const operate = typeof document === 'undefined' ? null : document.getElementById(`operate-element-${id}`)
  if (operate) {
    const scaleWidth = width * canvasScale
    const scaleHeight = height * canvasScale
    operate.style.left = `${left * canvasScale}px`
    operate.style.top = `${top * canvasScale}px`
    operate.style.width = `${scaleWidth}px`
    if (!autoHeight) operate.style.height = `${scaleHeight}px`
    const chromeHeight = autoHeight ? operate.offsetHeight : scaleHeight
    operate.style.transformOrigin = `${scaleWidth / 2}px ${chromeHeight / 2}px`
  }
  notifyLiveBox(id, width, height)
}
