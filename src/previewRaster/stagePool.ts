import Konva from 'konva'
import type { PPTElement, SlideBackground } from '@/types/slides'
import { previewWorkingWidth, type PreviewWorkingQuality } from '@/views/Editor/Thumbnails/paneSize'
import { paintBackground, paintElement } from './painters/index'
import type { RasterPaintContext } from './painters/contrast'
import {
  attachRasterSnapshot,
  captureRasterSnapshot,
  detachRasterSnapshot,
  dropRasterSnapshot,
  getRasterSnapshot,
  resizeRasterSnapshot,
  scaleRasterSnapshotView,
} from './rasterCache'
import { markFirstBlit, rasterStats, timePhase, timePhaseSync } from './stats'
import { elementStackIds } from './elementStack'

/** Scratch compositors. Display cache is dest snapshots, not live stages. */
export const MAX_PREVIEW_STAGES = 3
const BG_ID = '__bg'
const DEFAULT_SLIDE_WIDTH = 1000
const DEFAULT_SLIDE_HEIGHT = 562.5
type StageEntry = {
  slideId: string
  stage: Konva.Stage
  layer: Konva.Layer
  container: HTMLDivElement
  destWidth: number
  destHeight: number
  workingWidth: number
  workingHeight: number
  pixelRatio: number
  slideWidth: number
  slideHeight: number
  cachedDestDpr: number
  quality: PreviewWorkingQuality
  busy: boolean
  nodes: Map<string, Konva.Node>
  stackIds: string[]
}

const hosts = new Map<string, HTMLElement>()
const stages: StageEntry[] = []
const bySlideId = new Map<string, StageEntry>()
let pinnedIds = new Set<string>()
let pinnedCurrentId = ''
let host: HTMLDivElement | null = null

const destTimesDpr = (destWidth: number, pixelRatio: number) => destWidth * pixelRatio

const workingWidthOf = (destWidth: number, pixelRatio: number, quality: PreviewWorkingQuality) => (
  previewWorkingWidth(destWidth, pixelRatio, quality)
)

const layerScale = (entry: StageEntry) => entry.workingWidth / Math.max(1, entry.slideWidth)

const cachePixelRatio = (entry: StageEntry) => Math.max(1, layerScale(entry))

const ensureHost = () => {
  if (host && host.isConnected) return host
  host = document.getElementById('fika-preview-raster-host') as HTMLDivElement | null
  if (!host) {
    host = document.createElement('div')
    host.id = 'fika-preview-raster-host'
    host.setAttribute('aria-hidden', 'true')
    host.style.cssText = 'position:fixed;left:-10000px;top:0;overflow:visible;pointer-events:none'
    document.body.appendChild(host)
  }
  return host
}

const sizeContainer = (entry: StageEntry) => {
  const fit = entry.destWidth / Math.max(1, entry.workingWidth)
  entry.container.style.cssText = [
    'position:absolute',
    'left:0',
    'top:0',
    `width:${entry.workingWidth}px`,
    `height:${entry.workingHeight}px`,
    `transform:scale(${fit})`,
    'transform-origin:0 0',
    'overflow:hidden',
    'line-height:0',
  ].join(';')
}

const applyLayerScale = (entry: StageEntry) => {
  const scale = layerScale(entry)
  entry.layer.scale({ x: scale, y: scale })
}

const shouldCacheNode = (node: Konva.Node) => {
  if (node.getAttr('previewBitmap')) return false
  const name = node.getClassName()
  if (name === 'Image' || name === 'Text' || name === 'Path' || name === 'Line' || name === 'Rect') return false
  const find = (node as Konva.Container).find
  if (typeof find === 'function') {
    if (find.call(node, 'Image').length || find.call(node, 'Text').length) return false
  }
  return typeof node.shadowEnabled === 'function' && node.shadowEnabled()
}

const recacheLayer = (entry: StageEntry) => {
  const pixelRatio = cachePixelRatio(entry)
  for (const node of entry.nodes.values()) {
    if (!shouldCacheNode(node)) continue
    node.clearCache()
    node.cache({ pixelRatio })
  }
}

const applyStageSize = (
  entry: StageEntry,
  destWidth: number,
  destHeight: number,
  pixelRatio: number,
  slideWidth = entry.slideWidth,
  slideHeight = entry.slideHeight,
  quality = entry.quality,
) => {
  entry.slideWidth = slideWidth || entry.slideWidth
  entry.slideHeight = slideHeight || entry.slideHeight
  entry.destWidth = destWidth
  entry.destHeight = destHeight
  entry.pixelRatio = pixelRatio
  entry.quality = quality
  const destDpr = destTimesDpr(destWidth, pixelRatio)
  const workingWidth = workingWidthOf(destWidth, pixelRatio, quality)
  const workingHeight = workingWidth * (entry.slideHeight / Math.max(1, entry.slideWidth))
  if (workingWidth !== entry.workingWidth) {
    entry.workingWidth = workingWidth
    entry.workingHeight = workingHeight
    entry.stage.size({ width: workingWidth, height: workingHeight })
    applyLayerScale(entry)
  }
  if (destDpr > entry.cachedDestDpr) {
    recacheLayer(entry)
    entry.cachedDestDpr = Math.max(destDpr, entry.workingWidth)
  }
  sizeContainer(entry)
}

const makeEntry = (
  slideId: string,
  destWidth: number,
  destHeight: number,
  pixelRatio: number,
  slideWidth: number,
  slideHeight: number,
  quality: PreviewWorkingQuality,
): StageEntry => {
  const container = document.createElement('div')
  ensureHost().appendChild(container)
  const workingWidth = workingWidthOf(destWidth, pixelRatio, quality)
  const workingHeight = workingWidth * (slideHeight / Math.max(1, slideWidth))
  const stage = new Konva.Stage({
    container,
    width: workingWidth,
    height: workingHeight,
    listening: false,
    pixelRatio: 1,
  })
  const layer = new Konva.Layer({ listening: false, imageSmoothingEnabled: true })
  stage.add(layer)
  const entry: StageEntry = {
    slideId,
    stage,
    layer,
    container,
    destWidth,
    destHeight,
    workingWidth,
    workingHeight,
    pixelRatio,
    slideWidth,
    slideHeight,
    cachedDestDpr: workingWidth,
    quality,
    busy: false,
    nodes: new Map(),
    stackIds: [],
  }
  applyLayerScale(entry)
  sizeContainer(entry)
  return entry
}

const clearScratch = (entry: StageEntry) => {
  for (const node of entry.nodes.values()) {
    node.clearCache()
    node.destroy()
  }
  entry.nodes.clear()
  entry.stackIds = []
  entry.layer.destroyChildren()
}

const pickVictim = () => {
  const idle = stages.filter(entry => !entry.busy)
  const unpinned = idle.filter(entry => !entry.slideId || !pinnedIds.has(entry.slideId))
  if (unpinned[0]) return unpinned[0]
  const notCurrent = idle.filter(entry => !pinnedCurrentId || entry.slideId !== pinnedCurrentId)
  return notCurrent[0] ?? idle[0]
}

const claimEntry = (
  entry: StageEntry,
  slideId: string,
  destWidth: number,
  destHeight: number,
  pixelRatio: number,
  slideWidth: number,
  slideHeight: number,
  quality: PreviewWorkingQuality,
) => {
  if (entry.slideId && entry.slideId !== slideId) {
    bySlideId.delete(entry.slideId)
    clearScratch(entry)
  }
  entry.slideId = slideId
  bySlideId.set(slideId, entry)
  applyStageSize(entry, destWidth, destHeight, pixelRatio, slideWidth, slideHeight, quality)
  return entry
}

export const getStageEntry = (slideId: string) => bySlideId.get(slideId)

export const prepareScratch = (
  slideId: string,
  destWidth: number,
  destHeight: number,
  pixelRatio: number,
  slideWidth = DEFAULT_SLIDE_WIDTH,
  slideHeight = DEFAULT_SLIDE_HEIGHT,
  quality: PreviewWorkingQuality = 'full',
) => {
  const entry = ensureStage(slideId, destWidth, destHeight, pixelRatio, slideWidth, slideHeight, quality)
  entry.busy = true
  clearScratch(entry)
  return entry
}

export const releaseStage = (slideId: string) => {
  const entry = bySlideId.get(slideId)
  if (entry) entry.busy = false
}

export const ensureStage = (
  slideId: string,
  destWidth: number,
  destHeight: number,
  pixelRatio: number,
  slideWidth = DEFAULT_SLIDE_WIDTH,
  slideHeight = DEFAULT_SLIDE_HEIGHT,
  quality: PreviewWorkingQuality = 'full',
): StageEntry => {
  const existing = bySlideId.get(slideId)
  if (existing) {
    applyStageSize(existing, destWidth, destHeight, pixelRatio, slideWidth, slideHeight, quality)
    return existing
  }
  if (stages.length < MAX_PREVIEW_STAGES) {
    const entry = makeEntry(slideId, destWidth, destHeight, pixelRatio, slideWidth, slideHeight, quality)
    stages.push(entry)
    bySlideId.set(slideId, entry)
    return entry
  }
  const victim = pickVictim()
  if (victim) {
    return claimEntry(victim, slideId, destWidth, destHeight, pixelRatio, slideWidth, slideHeight, quality)
  }
  const overflow = makeEntry(slideId, destWidth, destHeight, pixelRatio, slideWidth, slideHeight, quality)
  stages.push(overflow)
  bySlideId.set(slideId, overflow)
  return overflow
}

export const snapshotStage = (slideId: string) => {
  const entry = bySlideId.get(slideId)
  if (!entry || entry.nodes.size === 0) return false
  return timePhaseSync('snapshot', () => {
    entry.layer.draw()
    const source = entry.layer.getNativeCanvasElement()
    captureRasterSnapshot(slideId, source, entry.destWidth, entry.destHeight, entry.pixelRatio)
    markFirstBlit()
    return true
  })
}

const PENDING_ATTR = 'data-raster-pending'

const setHostPending = (target: HTMLElement, pending: boolean) => {
  if (pending) {
    target.setAttribute(PENDING_ATTR, '')
    target.setAttribute('aria-busy', 'true')
    return
  }
  target.removeAttribute(PENDING_ATTR)
  target.removeAttribute('aria-busy')
}

export const mountPreview = (slideId: string) => {
  const target = hosts.get(slideId)
  if (!target) return
  setHostPending(target, !attachRasterSnapshot(slideId, target))
}

/** CSS-scale mounted thumb views during pane drag. Never touches Konva. */
export const scalePreviewDisplays = (destWidth: number, destHeight: number) => {
  for (const [slideId, target] of hosts) {
    resizeRasterSnapshot(slideId, destWidth, destHeight)
    scaleRasterSnapshotView(target, destWidth, destHeight)
  }
}

export const setDestSize = (
  slideId: string,
  destWidth: number,
  destHeight: number,
  pixelRatio: number,
  slideWidth?: number,
  slideHeight?: number,
  quality?: PreviewWorkingQuality,
) => {
  const entry = bySlideId.get(slideId)
  if (entry) {
    applyStageSize(entry, destWidth, destHeight, pixelRatio, slideWidth, slideHeight, quality ?? entry.quality)
    entry.layer.batchDraw()
  }
  resizeRasterSnapshot(slideId, destWidth, destHeight)
  mountPreview(slideId)
}

export const attachStage = (slideId: string, target: HTMLElement | null) => {
  if (target) hosts.set(slideId, target)
  else hosts.delete(slideId)
  mountPreview(slideId)
}

export const detachStage = (slideId: string) => {
  const target = hosts.get(slideId)
  hosts.delete(slideId)
  detachRasterSnapshot(slideId, target)
}

export const dropSlide = (slideId: string, keepSnapshot = true) => {
  const entry = bySlideId.get(slideId)
  if (entry) {
    if (keepSnapshot) snapshotStage(slideId)
    clearScratch(entry)
    entry.stage.destroy()
    entry.container.remove()
    const index = stages.indexOf(entry)
    if (index >= 0) stages.splice(index, 1)
    bySlideId.delete(slideId)
  }
  if (!keepSnapshot) dropRasterSnapshot(slideId)
  mountPreview(slideId)
}

export const setPinnedSlideIds = (ids: readonly string[], currentId = '') => {
  pinnedIds = new Set(ids)
  pinnedCurrentId = currentId
}

export const moveElement = (slideId: string, elementId: string, x: number, y: number, _scale: number) => {
  const entry = getStageEntry(slideId)
  const node = entry?.nodes.get(elementId)
  if (!node || !entry) return
  node.x(x)
  node.y(y)
  entry.layer.batchDraw()
}

export const removeElement = (slideId: string, elementId: string) => {
  const entry = getStageEntry(slideId)
  const node = entry?.nodes.get(elementId)
  if (!entry || !node) return
  node.destroy()
  entry.nodes.delete(elementId)
  entry.layer.batchDraw()
}

const applyStoredStack = (entry: StageEntry) => {
  for (const id of entry.stackIds) entry.nodes.get(id)?.moveToTop()
  entry.nodes.get(BG_ID)?.moveToBottom()
}

/** Restack from slide.elements. The only way the raster reads painter order. */
export const applyElementStack = (slideId: string, elements: readonly { id: string }[]) => {
  const entry = getStageEntry(slideId)
  if (!entry) return
  entry.stackIds = elementStackIds(elements)
  applyStoredStack(entry)
  if (!entry.busy) entry.layer.batchDraw()
}

const attachPaintedNode = (entry: StageEntry, element: PPTElement, node: Konva.Node | null) => {
  if (!node) {
    if (!entry.busy) entry.layer.batchDraw()
    return
  }
  node.id(element.id)
  node.listening(false)
  node.x(element.left)
  node.y(element.top)
  node.scale({ x: 1, y: 1 })
  entry.layer.add(node)
  entry.nodes.set(element.id, node)
  applyStoredStack(entry)
  if (!entry.busy && shouldCacheNode(node)) node.cache({ pixelRatio: cachePixelRatio(entry) })
  entry.cachedDestDpr = Math.max(entry.cachedDestDpr, destTimesDpr(entry.destWidth, entry.pixelRatio))
  if (!entry.busy) entry.layer.batchDraw()
}

export const invalidateElement = (
  slideId: string,
  element: PPTElement,
  destWidth: number,
  destHeight: number,
  slideWidth: number,
  pixelRatio: number,
  quality: PreviewWorkingQuality = 'full',
  paintContext?: RasterPaintContext,
) => {
  rasterStats.elementInvalidations += 1
  const slideHeight = destHeight * (slideWidth / Math.max(1, destWidth))
  const entry = ensureStage(slideId, destWidth, destHeight, pixelRatio, slideWidth, slideHeight, quality)
  const prev = entry.nodes.get(element.id)
  if (prev) {
    prev.clearCache()
    prev.destroy()
    entry.nodes.delete(element.id)
  }
  const painted = paintElement(element, destWidth, slideWidth, pixelRatio, quality, paintContext)
  if (painted && typeof (painted as Promise<Konva.Node | null>).then === 'function') {
    return (painted as Promise<Konva.Node | null>).then(node => attachPaintedNode(entry, element, node))
  }
  attachPaintedNode(entry, element, painted as Konva.Node | null)
}

export const invalidateBackground = async (
  slideId: string,
  background: SlideBackground | undefined,
  themeBackgroundColor: string,
  destWidth: number,
  destHeight: number,
  pixelRatio: number,
  slideWidth = DEFAULT_SLIDE_WIDTH,
  slideHeight = DEFAULT_SLIDE_HEIGHT,
  quality: PreviewWorkingQuality = 'full',
) => {
  rasterStats.backgroundInvalidations += 1
  const entry = ensureStage(slideId, destWidth, destHeight, pixelRatio, slideWidth, slideHeight, quality)
  const prev = entry.nodes.get(BG_ID)
  if (prev) {
    prev.clearCache()
    prev.destroy()
    entry.nodes.delete(BG_ID)
  }
  const node = await timePhase('bg', () => paintBackground(background, themeBackgroundColor, entry.slideWidth, entry.slideHeight))
  if (!node) {
    if (!entry.busy) entry.layer.batchDraw()
    return
  }
  node.id(BG_ID)
  node.listening(false)
  node.x(0)
  node.y(0)
  entry.layer.add(node)
  node.zIndex(0)
  entry.nodes.set(BG_ID, node)
  if (!entry.busy) {
    node.cache({ pixelRatio: cachePixelRatio(entry) })
    entry.layer.batchDraw()
  }
}

export const compositeCanvas = (slideId: string): HTMLCanvasElement | null => {
  return getRasterSnapshot(slideId)?.canvas ?? getStageEntry(slideId)?.layer.getNativeCanvasElement() ?? null
}

export const readScratchPool = () => stages.map(entry => ({
  slideId: entry.slideId,
  workingWidth: entry.workingWidth,
  quality: entry.quality,
  busy: entry.busy,
}))
