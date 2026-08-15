import Konva from 'konva'
import { snapdom } from '@zumer/snapdom'
import type { PPTLatexElement, PPTMermaidElement } from '@/types/slides'
import { EMBED_ROOT_CLASS } from '@/utils/portal'
import { boothCacheKey } from '../boothKey'
import { escapeBoothText, familiesFromHtml, quoteFontFamily } from '../textPaintHtml'
import { markRasterYield, yieldIfNeeded } from '../scheduler'
import { rasterStats, timePhase } from '../stats'

export { boothCacheKey, escapeBoothText, familiesFromHtml, quoteFontFamily }

const BOOTH_CACHE_MAX = 80
const boothCache = new Map<string, HTMLCanvasElement>()

const rememberBooth = (key: string, canvas: HTMLCanvasElement) => {
  if (boothCache.has(key)) boothCache.delete(key)
  boothCache.set(key, canvas)
  while (boothCache.size > BOOTH_CACHE_MAX) {
    const oldest = boothCache.keys().next().value
    if (oldest === undefined) break
    boothCache.delete(oldest)
  }
}

export const clearBoothCache = () => {
  boothCache.clear()
}

const imageFromCanvas = (canvas: HTMLCanvasElement, width: number, height: number) => {
  const image = new Konva.Image({
    image: canvas,
    width,
    height,
    listening: false,
    imageSmoothingEnabled: true,
    perfectDrawEnabled: false,
  })
  image.setAttr('previewBitmap', true)
  return image
}

const BOOTH_SLOTS = 2
const boothHosts: Array<HTMLDivElement | null> = [null, null]
const freeBoothSlots = [0, 1]
const boothWaiters: Array<(slot: number) => void> = []

const acquireBoothSlot = () => new Promise<number>(resolve => {
  const slot = freeBoothSlots.pop()
  if (slot !== undefined) {
    resolve(slot)
    return
  }
  boothWaiters.push(resolve)
})

const releaseBoothSlot = (slot: number) => {
  const waiter = boothWaiters.shift()
  if (waiter) waiter(slot)
  else freeBoothSlots.push(slot)
}

const ensureBoothHost = (slot: number) => {
  const existing = boothHosts[slot]
  if (existing?.isConnected) return existing
  const host = document.createElement('div')
  host.id = slot ? `fika-preview-booth-${slot}` : 'fika-preview-booth'
  host.setAttribute('aria-hidden', 'true')
  host.classList.add(EMBED_ROOT_CLASS)
  host.style.cssText = 'position:fixed;left:-99999px;top:0;pointer-events:none;background:transparent'
  document.body.appendChild(host)
  boothHosts[slot] = host
  return host
}

let fontWaitSlideId = ''
const pendingFontSlides = new Set<string>()

export const setFontWaitSlideId = (slideId: string) => {
  fontWaitSlideId = slideId
}

export const takePendingFontSlides = () => {
  const ids = [...pendingFontSlides]
  pendingFontSlides.clear()
  return ids
}

export const waitForFonts = async (families: Iterable<string>) => {
  if (typeof document === 'undefined' || !document.fonts) return
  const unique = [...new Set([...families]
    .map(name => name.split(',')[0].replace(/['"]/g, '').trim())
    .filter(Boolean))]
  if (!unique.length) return
  let loaded = false
  await Promise.all(unique.map(async family => {
    const spec = `16px ${quoteFontFamily(family)}`
    if (document.fonts.check(spec)) return
    try {
      await document.fonts.load(spec)
      loaded = true
    }
    catch {
      // keep the fallback face; loadingdone will rebuild when the real one arrives
    }
  }))
  if (loaded && fontWaitSlideId) pendingFontSlides.add(fontWaitSlideId)
}

/**
 * SnapDOM booth: two hidden hosts so two captures can overlap.
 * Hosts live under #fika-shell / .fika-embed-root so ProseMirror CSS applies.
 */
export const rasterHtml = async (
  html: string,
  width: number,
  height: number,
  captureScale = 1,
): Promise<Konva.Image | Konva.Rect> => {
  const w = Math.max(1, width)
  const h = Math.max(1, height)
  const cw = Math.max(1, w * captureScale)
  const ch = Math.max(1, h * captureScale)
  const key = boothCacheKey(html, w, h, captureScale)
  const cached = boothCache.get(key)
  if (cached) {
    rasterStats.boothHits += 1
    return imageFromCanvas(cached, w, h)
  }
  let node: Konva.Image | Konva.Rect = new Konva.Rect({ width: w, height: h, fillEnabled: false, listening: false })
  const run = async () => {
    const replay = boothCache.get(key)
    if (replay) {
      rasterStats.boothHits += 1
      node = imageFromCanvas(replay, w, h)
      return
    }
    rasterStats.booths += 1
    markRasterYield()
    await waitForFonts(familiesFromHtml(html))
    const slot = await acquireBoothSlot()
    let target: HTMLDivElement | undefined
    try {
      const booth = ensureBoothHost(slot)
      target = document.createElement('div')
      target.style.cssText = `width:${cw}px;height:${ch}px;overflow:hidden;box-sizing:border-box;background:transparent`
      const inner = document.createElement('div')
      const zoomOk = typeof CSS !== 'undefined' && CSS.supports?.('zoom', '0.5')
      inner.style.cssText = zoomOk
        ? `width:${w}px;height:${h}px;zoom:${captureScale};box-sizing:border-box;color:#18181b;font:16px/1.5 system-ui,sans-serif;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:geometricPrecision;font-synthesis:none`
        : `width:${w}px;height:${h}px;transform:scale(${captureScale});transform-origin:0 0;box-sizing:border-box;color:#18181b;font:16px/1.5 system-ui,sans-serif;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:geometricPrecision;font-synthesis:none`
      inner.innerHTML = html
      target.appendChild(inner)
      booth.appendChild(target)
      const captured = await timePhase('booth', () => snapdom.toCanvas(target, {
        dpr: 1,
        scale: 1,
        width: cw,
        height: ch,
        embedFonts: true,
        compress: false,
      }))
      const canvas = captured.width === cw && captured.height === ch
        ? captured
        : (() => {
          const padded = document.createElement('canvas')
          padded.width = cw
          padded.height = ch
          padded.getContext('2d')?.drawImage(captured, 0, 0)
          return padded
        })()
      rememberBooth(key, canvas)
      node = imageFromCanvas(canvas, w, h)
    }
    catch {
      // keep placeholder
    }
    finally {
      target?.remove()
      releaseBoothSlot(slot)
    }
    await yieldIfNeeded(true)
  }
  await run()
  return node
}

export const latexToBoothHtml = (element: PPTLatexElement) => {
  const [vbW, vbH] = element.viewBox
  if (element.path && vbW > 0 && vbH > 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${vbW} ${vbH}" preserveAspectRatio="xMidYMid meet"><path d="${escapeBoothText(element.path)}" fill="none" stroke="${escapeBoothText(element.color || '#18181b')}" stroke-width="${element.strokeWidth || 2}"/></svg>`
  }
  return `<div style="padding:8px;font:14px/1.35 serif;color:${escapeBoothText(element.color || '#18181b')}">${escapeBoothText(element.latex || '')}</div>`
}

export const mermaidToBoothHtml = (element: PPTMermaidElement) => (
  `<pre style="margin:0;padding:8px;height:100%;box-sizing:border-box;overflow:hidden;white-space:pre-wrap;font:12px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;color:#334155;background:#f8fafc">${escapeBoothText(element.code || '')}</pre>`
)

export const paintLatex = (element: PPTLatexElement, captureScale = 1) => {
  const [vbW, vbH] = element.viewBox
  if (element.path && vbW > 0 && vbH > 0) {
    const group = new Konva.Group({ listening: false })
    group.add(new Konva.Path({
      data: element.path,
      scaleX: element.width / vbW,
      scaleY: element.height / vbH,
      fillEnabled: false,
      stroke: element.color || '#18181b',
      strokeWidth: element.strokeWidth || 2,
      listening: false,
      perfectDrawEnabled: false,
    }))
    return group
  }
  return rasterHtml(latexToBoothHtml(element), element.width, element.height, captureScale)
}

export const paintMermaid = (element: PPTMermaidElement) => {
  const group = new Konva.Group({ listening: false })
  group.add(new Konva.Rect({
    width: element.width,
    height: element.height,
    fill: '#f8fafc',
    listening: false,
  }))
  group.add(new Konva.Text({
    x: 8,
    y: 8,
    width: Math.max(1, element.width - 16),
    height: Math.max(1, element.height - 16),
    text: element.code || '',
    fontSize: 12,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fill: '#334155',
    lineHeight: 1.35,
    wrap: 'word',
    listening: false,
    perfectDrawEnabled: false,
  }))
  return group
}
