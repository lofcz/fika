import Konva from 'konva'
import { snapdom } from '@zumer/snapdom'
import type { PPTLatexElement, PPTMermaidElement } from '@/types/slides'
import { markRasterYield } from '../scheduler'
import { rasterStats } from '../stats'

let host: HTMLDivElement | null = null
let boothLock: Promise<void> = Promise.resolve()

const FONT_FAMILY_RE = /font-family:\s*['"]?([^;'"<>]+)/gi

const ensureBoothHost = () => {
  if (host && host.isConnected) return host
  host = document.createElement('div')
  host.id = 'fika-preview-booth'
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = 'position:fixed;left:-99999px;top:0;pointer-events:none;background:transparent'
  document.body.appendChild(host)
  return host
}

export const quoteFontFamily = (raw: string) => {
  const family = raw.split(',')[0].replace(/['"]/g, '').trim()
  if (!family) return 'sans-serif'
  return /[^a-zA-Z0-9-]/.test(family) ? `"${family}"` : family
}

export const familiesFromHtml = (html: string) => {
  const found: string[] = []
  for (const match of html.matchAll(FONT_FAMILY_RE)) found.push(match[1])
  return found
}

export const waitForFonts = async (families: Iterable<string>) => {
  if (typeof document === 'undefined' || !document.fonts) return
  const unique = [...new Set([...families]
    .map(name => name.split(',')[0].replace(/['"]/g, '').trim())
    .filter(Boolean))]
  if (!unique.length) return
  await Promise.all(unique.map(async family => {
    const spec = `16px ${quoteFontFamily(family)}`
    if (document.fonts.check(spec)) return
    try {
      await document.fonts.load(spec)
    }
    catch {
      // keep the fallback face; loadingdone will rebuild when the real one arrives
    }
  }))
}

export const escapeBoothText = (value: string) => (
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
)

/**
 * Single-flight SnapDOM booth: one hidden host, one mounted element, tear down.
 * Callers already run inside `enqueueRaster`; this lock only serializes booth mounts.
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
  let node: Konva.Image | Konva.Rect = new Konva.Rect({ width: w, height: h, fill: '#f4f4f5', listening: false })
  const run = async () => {
    rasterStats.booths += 1
    markRasterYield()
    await waitForFonts(familiesFromHtml(html))
    const booth = ensureBoothHost()
    const target = document.createElement('div')
    target.style.cssText = `width:${cw}px;height:${ch}px;overflow:hidden;box-sizing:border-box;background:transparent`
    const inner = document.createElement('div')
    const zoomOk = typeof CSS !== 'undefined' && CSS.supports?.('zoom', '0.5')
    inner.style.cssText = zoomOk
      ? `width:${w}px;height:${h}px;zoom:${captureScale};box-sizing:border-box;color:#18181b;font:16px/1.5 system-ui,sans-serif;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:geometricPrecision;font-synthesis:none`
      : `width:${w}px;height:${h}px;transform:scale(${captureScale});transform-origin:0 0;box-sizing:border-box;color:#18181b;font:16px/1.5 system-ui,sans-serif;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:geometricPrecision;font-synthesis:none`
    inner.innerHTML = html
    target.appendChild(inner)
    booth.appendChild(target)
    try {
      const canvas = await snapdom.toCanvas(target, {
        dpr: 1,
        scale: 1,
        embedFonts: true,
        compress: false,
      })
      const image = new Konva.Image({
        image: canvas,
        width: w,
        height: h,
        listening: false,
        imageSmoothingEnabled: true,
        perfectDrawEnabled: false,
      })
      image.setAttr('previewBitmap', true)
      node = image
    }
    catch {
      // keep placeholder
    }
    finally {
      target.remove()
    }
  }
  const previous = boothLock
  boothLock = previous.then(run, run)
  await boothLock
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
