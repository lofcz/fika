/** Dest-sized composites kept after the live Konva stage is evicted.
 *  The master canvas stays off-DOM so thumbs and the drag overlay can both blit it.
 */

export type RasterSnapshot = {
  canvas: HTMLCanvasElement
  destWidth: number
  destHeight: number
  pixelRatio: number
}

const snapshots = new Map<string, RasterSnapshot>()
const views = new WeakMap<HTMLElement, HTMLCanvasElement>()

const displayCanvas = (canvas: HTMLCanvasElement, destWidth: number, destHeight: number) => {
  canvas.style.cssText = [
    'position:absolute',
    'left:0',
    'top:0',
    `width:${destWidth}px`,
    `height:${destHeight}px`,
    'display:block',
    'pointer-events:none',
  ].join(';')
}

const growCanvas = (canvas: HTMLCanvasElement, destWidth: number, destHeight: number, pixelRatio: number) => {
  const w = Math.max(1, Math.round(destWidth * pixelRatio))
  const h = Math.max(1, Math.round(destHeight * pixelRatio))
  if (w > canvas.width) canvas.width = w
  if (h > canvas.height) canvas.height = h
}

const blit = (from: HTMLCanvasElement, to: HTMLCanvasElement) => {
  if (to.width !== from.width) to.width = from.width
  if (to.height !== from.height) to.height = from.height
  const ctx = to.getContext('2d')
  if (!ctx) return false
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.clearRect(0, 0, to.width, to.height)
  if (from.width && from.height) ctx.drawImage(from, 0, 0)
  return from.width > 0 && from.height > 0
}

export const getRasterSnapshot = (slideId: string) => snapshots.get(slideId)

export const hasRasterSnapshot = (slideId: string) => snapshots.has(slideId)

export const rasterSnapshotIds = () => [...snapshots.keys()]

export const captureRasterSnapshot = (
  slideId: string,
  source: HTMLCanvasElement,
  destWidth: number,
  destHeight: number,
  pixelRatio: number,
) => {
  if (!source.width || !source.height) return
  let snap = snapshots.get(slideId)
  if (!snap) {
    const canvas = document.createElement('canvas')
    canvas.setAttribute('data-preview-raster-master', slideId)
    snap = { canvas, destWidth, destHeight, pixelRatio }
    snapshots.set(slideId, snap)
  }
  snap.destWidth = destWidth
  snap.destHeight = destHeight
  snap.pixelRatio = pixelRatio
  growCanvas(snap.canvas, destWidth, destHeight, pixelRatio)
  const ctx = snap.canvas.getContext('2d')
  if (!ctx) return
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.clearRect(0, 0, snap.canvas.width, snap.canvas.height)
  ctx.drawImage(source, 0, 0, snap.canvas.width, snap.canvas.height)
}

export const paintRasterSnapshot = (slideId: string, dest: HTMLCanvasElement) => {
  const snap = snapshots.get(slideId)
  if (!snap) return false
  return blit(snap.canvas, dest)
}

export const attachRasterSnapshot = (slideId: string, target: HTMLElement) => {
  const snap = snapshots.get(slideId)
  if (!snap) return false
  let view = views.get(target)
  if (!view) {
    view = document.createElement('canvas')
    view.setAttribute('data-preview-raster', slideId)
    views.set(target, view)
  }
  blit(snap.canvas, view)
  displayCanvas(view, snap.destWidth, snap.destHeight)
  if (view.parentElement !== target) target.appendChild(view)
  return true
}

export const detachRasterSnapshot = (slideId: string, target?: HTMLElement | null) => {
  if (!target) return
  const view = views.get(target)
  view?.remove()
  views.delete(target)
}

export const resizeRasterSnapshot = (slideId: string, destWidth: number, destHeight: number) => {
  const snap = snapshots.get(slideId)
  if (!snap) return
  snap.destWidth = destWidth
  snap.destHeight = destHeight
}

/** CSS-scale an already-attached view. Do not blit or realloc the bitmap. */
export const scaleRasterSnapshotView = (target: HTMLElement, destWidth: number, destHeight: number) => {
  const view = views.get(target)
  if (!view) return
  displayCanvas(view, destWidth, destHeight)
}

export const snapshotCoversDest = (
  slideId: string,
  destWidth: number,
  destHeight: number,
  pixelRatio: number,
) => {
  const snap = snapshots.get(slideId)
  if (!snap) return false
  const needW = Math.max(1, Math.round(destWidth * pixelRatio))
  const needH = Math.max(1, Math.round(destHeight * pixelRatio))
  return snap.canvas.width + 1 >= needW && snap.canvas.height + 1 >= needH
}

export const dropRasterSnapshot = (slideId: string) => {
  const snap = snapshots.get(slideId)
  if (!snap) return
  snapshots.delete(slideId)
}
