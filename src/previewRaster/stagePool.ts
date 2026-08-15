import Konva from 'konva'
import type { PPTElement, SlideBackground } from '@/types/slides'
import { previewWorkingWidth } from '@/views/Editor/Thumbnails/paneSize'
import { paintBackground, paintElement } from './painters/index'
import {
  attachRasterSnapshot,
  captureRasterSnapshot,
  detachRasterSnapshot,
  dropRasterSnapshot,
  getRasterSnapshot,
  resizeRasterSnapshot,
} from './rasterCache'
import { rasterStats } from './stats'

/** One scratch compositor. Display cache is dest snapshots, not live stages. */
export const MAX_PREVIEW_STAGES = 1
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
  nodes: Map<string, Konva.Node>
}

const hosts = new Map<string, HTMLElement>()
let scratch: StageEntry | null = null
let host: HTMLDivElement | null = null

const destTimesDpr = (destWidth: number, pixelRatio: number) => destWidth * pixelRatio

const workingWidthOf = (destWidth: number, pixelRatio: number) => previewWorkingWidth(destWidth, pixelRatio)

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
  if (node.getClassName() === 'Image' || node.getClassName() === 'Text') return false
  if (node.getAttr('previewBitmap')) return false
  const find = (node as Konva.Container).find
  if (typeof find === 'function') {
    if (find.call(node, 'Image').length || find.call(node, 'Text').length) return false
  }
  return true
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
) => {
  entry.slideWidth = slideWidth || entry.slideWidth
  entry.slideHeight = slideHeight || entry.slideHeight
  entry.destWidth = destWidth
  entry.destHeight = destHeight
  entry.pixelRatio = pixelRatio
  const destDpr = destTimesDpr(destWidth, pixelRatio)
  const workingWidth = workingWidthOf(destWidth, pixelRatio)
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
): StageEntry => {
  const container = document.createElement('div')
  ensureHost().appendChild(container)
  const workingWidth = workingWidthOf(destWidth, pixelRatio)
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
    nodes: new Map(),
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
  entry.layer.destroyChildren()
}

export const getStageEntry = (slideId: string) => (
  scratch?.slideId === slideId ? scratch : undefined
)

export const prepareScratch = (
  slideId: string,
  destWidth: number,
  destHeight: number,
  pixelRatio: number,
  slideWidth = DEFAULT_SLIDE_WIDTH,
  slideHeight = DEFAULT_SLIDE_HEIGHT,
) => {
  const entry = ensureStage(slideId, destWidth, destHeight, pixelRatio, slideWidth, slideHeight)
  clearScratch(entry)
  return entry
}

export const ensureStage = (
  slideId: string,
  destWidth: number,
  destHeight: number,
  pixelRatio: number,
  slideWidth = DEFAULT_SLIDE_WIDTH,
  slideHeight = DEFAULT_SLIDE_HEIGHT,
): StageEntry => {
  if (!scratch) {
    scratch = makeEntry(slideId, destWidth, destHeight, pixelRatio, slideWidth, slideHeight)
  }
  else {
    if (scratch.slideId !== slideId) clearScratch(scratch)
    scratch.slideId = slideId
    applyStageSize(scratch, destWidth, destHeight, pixelRatio, slideWidth, slideHeight)
  }
  return scratch
}

export const snapshotStage = (slideId: string) => {
  const entry = scratch
  if (!entry || entry.nodes.size === 0) return false
  entry.layer.draw()
  const source = entry.layer.getNativeCanvasElement()
  captureRasterSnapshot(slideId, source, entry.destWidth, entry.destHeight, entry.pixelRatio)
  return true
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

export const setDestSize = (
  slideId: string,
  destWidth: number,
  destHeight: number,
  pixelRatio: number,
  slideWidth?: number,
  slideHeight?: number,
) => {
  if (scratch?.slideId === slideId) {
    applyStageSize(scratch, destWidth, destHeight, pixelRatio, slideWidth, slideHeight)
    scratch.layer.batchDraw()
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
  if (scratch?.slideId === slideId) {
    if (keepSnapshot) snapshotStage(slideId)
    clearScratch(scratch)
    scratch.stage.destroy()
    scratch.container.remove()
    scratch = null
  }
  if (!keepSnapshot) dropRasterSnapshot(slideId)
  mountPreview(slideId)
}

export const setPinnedSlideIds = (_ids: readonly string[]) => {
  // Visible thumbs are dest snapshots; the scratch compositor is not pinned per slide.
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

export const setZOrder = (slideId: string, ids: string[]) => {
  const entry = getStageEntry(slideId)
  if (!entry) return
  const bg = entry.nodes.get(BG_ID)
  for (const id of ids) {
    entry.nodes.get(id)?.moveToTop()
  }
  bg?.moveToBottom()
  entry.layer.batchDraw()
}

export const invalidateElement = async (
  slideId: string,
  element: PPTElement,
  destWidth: number,
  destHeight: number,
  slideWidth: number,
  pixelRatio: number,
) => {
  rasterStats.elementInvalidations += 1
  const slideHeight = destHeight * (slideWidth / Math.max(1, destWidth))
  const entry = ensureStage(slideId, destWidth, destHeight, pixelRatio, slideWidth, slideHeight)
  const prev = entry.nodes.get(element.id)
  if (prev) {
    prev.clearCache()
    prev.destroy()
    entry.nodes.delete(element.id)
  }
  const node = await paintElement(element, destWidth, slideWidth, pixelRatio)
  if (!node) {
    entry.layer.batchDraw()
    return
  }
  node.id(element.id)
  node.listening(false)
  node.x(element.left)
  node.y(element.top)
  node.scale({ x: 1, y: 1 })
  entry.layer.add(node)
  entry.nodes.set(element.id, node)
  if (shouldCacheNode(node)) node.cache({ pixelRatio: cachePixelRatio(entry) })
  entry.cachedDestDpr = Math.max(entry.cachedDestDpr, destTimesDpr(destWidth, pixelRatio))
  entry.layer.batchDraw()
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
) => {
  rasterStats.backgroundInvalidations += 1
  const entry = ensureStage(slideId, destWidth, destHeight, pixelRatio, slideWidth, slideHeight)
  const prev = entry.nodes.get(BG_ID)
  if (prev) {
    prev.clearCache()
    prev.destroy()
    entry.nodes.delete(BG_ID)
  }
  const node = await paintBackground(background, themeBackgroundColor, entry.slideWidth, entry.slideHeight)
  if (!node) {
    entry.layer.batchDraw()
    return
  }
  node.id(BG_ID)
  node.listening(false)
  node.x(0)
  node.y(0)
  entry.layer.add(node)
  node.zIndex(0)
  entry.nodes.set(BG_ID, node)
  node.cache({ pixelRatio: cachePixelRatio(entry) })
  entry.layer.batchDraw()
}

export const compositeCanvas = (slideId: string): HTMLCanvasElement | null => {
  return getRasterSnapshot(slideId)?.canvas ?? scratch?.layer.getNativeCanvasElement() ?? null
}
