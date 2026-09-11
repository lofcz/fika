import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart, RadarChart, ScatterChart } from 'echarts/charts'
import { GridComponent, LegendComponent, RadarComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

import type { PPTChartElement, PPTCodeElement, PPTLatexElement, PPTMermaidElement } from '@/types/slides'
import { getChartOption, expandChartThemeColors } from '@/views/components/element/ChartElement/chartOption'
import { codeElementToBoothHtml } from '@/utils/codeHighlight'
import { isLightCodeTheme } from '@/configs/code'
import { renderMermaidForImage } from '@/utils/mermaid'
import { LATEX_ELEMENT_FONT_SIZE, ensureMathliveReady, renderLatexElementHtml, renderMathToHtml } from '@/utils/math'
import { latexFallbackText } from '@/utils/inlineMathBox'
import { EMBED_ROOT_CLASS } from '@/utils/portal'
import { declaredFontFamilies, fontEmbedCssFor } from '@/utils/fontEmbedCss'

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  RadarChart,
  GridComponent,
  LegendComponent,
  RadarComponent,
  CanvasRenderer,
])

type Raster = ImageBitmap | HTMLCanvasElement
type RasterProducer = () => Promise<Raster | null> | Raster | null

const RASTER_CACHE_MAX = 192
const rasters = new Map<string, Raster>()
const jobs = new Map<string, Promise<Raster | null>>()
const listeners = new Map<string, Set<() => void>>()
const workQueue: Array<{ key: string; produce: RasterProducer; resolve: (value: Raster | null) => void }> = []
let draining = false

const hash = (value: string) => {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

const touch = (key: string, value: Raster) => {
  rasters.delete(key)
  rasters.set(key, value)
  while (rasters.size > RASTER_CACHE_MAX) {
    const oldest = rasters.keys().next().value
    if (!oldest) break
    const raster = rasters.get(oldest)
    if (raster instanceof ImageBitmap) raster.close()
    rasters.delete(oldest)
  }
}

const notify = (key: string) => {
  const set = listeners.get(key)
  listeners.delete(key)
  if (!set) return
  for (const listener of set) listener()
}

const drain = () => {
  if (draining) return
  const next = workQueue.shift()
  if (!next) return
  draining = true
  setTimeout(() => {
    Promise.resolve()
      .then(next.produce)
      .then(value => {
        if (value) touch(next.key, value)
        next.resolve(value)
      })
      .catch(() => next.resolve(null))
      .finally(() => {
        draining = false
        notify(next.key)
        drain()
      })
  }, 0)
}

const requestRaster = (key: string, produce: RasterProducer, invalidate: () => void): Raster | undefined => {
  const hit = rasters.get(key)
  if (hit) {
    touch(key, hit)
    return hit
  }
  let set = listeners.get(key)
  if (!set) {
    set = new Set()
    listeners.set(key, set)
  }
  set.add(invalidate)
  if (!jobs.has(key)) {
    const job = new Promise<Raster | null>(resolve => {
      workQueue.push({ key, produce, resolve })
      drain()
    })
    jobs.set(key, job)
    void job.finally(() => jobs.delete(key))
  }
  return undefined
}

const canvas = (width: number, height: number) => {
  const node = document.createElement('canvas')
  node.width = Math.max(1, Math.ceil(width))
  node.height = Math.max(1, Math.ceil(height))
  return node
}

/**
 * Decode an SVG string through an `<img>` and draw it onto a canvas.
 * `createImageBitmap` rejects SVG blobs in Chromium, so an image element is
 * the only reliable rasterization path. The source is a `data:` URL, not a
 * blob URL: Chromium taints a canvas that draws a blob-backed SVG carrying a
 * `<foreignObject>` (the code booth), which then fails `toBlob` for every
 * slide thumbnail; the same markup as a data URL stays same-origin — this is
 * exactly what html-to-image does for the math booth.
 */
const svgToCanvas = async (svg: string, width: number, height: number): Promise<Raster | null> => {
  try {
    const image = new Image()
    image.decoding = 'async'
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('SVG decode failed'))
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    })
    const result = canvas(width, height)
    result.getContext('2d')?.drawImage(image, 0, 0, result.width, result.height)
    return result
  }
  catch {
    return null
  }
}

/**
 * Last good raster per chart element. When the content key misses (data or
 * size edit), the previous raster is stretched into the box while the new
 * one bakes, so the chart never degrades to the gray placeholder on screen.
 */
const staleChartRasters = new Map<string, Raster>()
const STALE_CHART_MAX = 64

export const getChartRaster = (
  element: PPTChartElement,
  colors: string[],
  textColor: string,
  lineColor: string,
  invalidate: () => void,
): Raster | undefined => {
  // Content-only key: left/top/rotate/fill/outline do not affect the baked
  // pixels, so a pure move must stay a cache hit — a miss here repaints the
  // thumbnail with a placeholder box for a few frames on drop.
  const payload = JSON.stringify({
    width: Math.ceil(element.width),
    height: Math.ceil(element.height),
    chartType: element.chartType,
    data: element.data,
    options: element.options,
    colors,
    textColor,
    lineColor,
  })
  const key = `chart:${hash(payload)}`
  const raster = requestRaster(key, () => {
    const width = Math.max(1, Math.ceil(element.width))
    const height = Math.max(1, Math.ceil(element.height))
    const source = canvas(width, height)
    const chart = echarts.init(source, null, {
      renderer: 'canvas',
      width,
      height,
      devicePixelRatio: 1,
      useDirtyRect: false,
    })
    const option = getChartOption({
      type: element.chartType,
      data: element.data,
      themeColors: expandChartThemeColors(colors),
      textColor,
      lineColor,
      lineSmooth: element.options?.lineSmooth || false,
      stack: element.options?.stack || false,
      fontSize: element.options?.fontSize,
      width,
    })
    if (!option) {
      chart.dispose()
      return null
    }
    chart.setOption({ ...option, animation: false }, true)
    const result = canvas(width, height)
    result.getContext('2d')?.drawImage(source, 0, 0)
    chart.dispose()
    return result
  }, invalidate)
  if (raster) {
    staleChartRasters.delete(element.id)
    staleChartRasters.set(element.id, raster)
    while (staleChartRasters.size > STALE_CHART_MAX) {
      const oldest = staleChartRasters.keys().next().value
      if (!oldest) break
      staleChartRasters.delete(oldest)
    }
    return raster
  }
  return staleChartRasters.get(element.id)
}

export const getMermaidRaster = (
  element: PPTMermaidElement,
  invalidate: () => void,
): Raster | undefined => {
  const key = `mermaid:${hash(`${element.code}\0${element.width}\0${element.height}`)}`
  const width = Math.max(1, Math.round(element.width))
  const height = Math.max(1, Math.round(element.height))
  return requestRaster(key, async () => {
    const raw = await renderMermaidForImage(element.code, `canvas-${hash(element.id + element.code)}`)
    // renderMermaid already emits width/height="100%"; rewrite them via the DOM
    // (string-splicing duplicates the attributes, which is unparseable XML).
    const doc = new DOMParser().parseFromString(raw, 'image/svg+xml')
    const root = doc.documentElement
    root.setAttribute('width', String(width))
    root.setAttribute('height', String(height))
    return svgToCanvas(new XMLSerializer().serializeToString(root), width, height)
  }, invalidate)
}

const escapeXml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

export const getCodeRaster = (
  element: PPTCodeElement,
  invalidate: () => void,
): Raster | undefined => {
  const payload = `${element.code}\0${element.language}\0${element.theme}\0${element.fontSize}\0${element.showLineNumbers}\0${element.width}\0${element.height}`
  const key = `code:${hash(payload)}`
  const width = Math.max(1, Math.round(element.width))
  const height = Math.max(1, Math.round(element.height))
  return requestRaster(key, async () => {
    let booth: string
    try {
      // Same Shiki booth markup the export path uses: inline styles only and
      // real gutter spans, so it survives the SVG foreignObject round-trip.
      booth = await codeElementToBoothHtml(element)
    }
    catch {
      const bg = isLightCodeTheme(element.theme) ? '#ffffff' : '#0d1117'
      const fg = isLightCodeTheme(element.theme) ? '#24292f' : '#e6edf3'
      booth = `<div style="box-sizing:border-box;width:100%;height:100%;overflow:hidden;border-radius:10px;padding:12px 16px;background:${bg};color:${fg};font:${element.fontSize}px/1.5 ui-monospace,Consolas,monospace;white-space:pre">${escapeXml(element.code)}</div>`
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%">${booth}</div></foreignObject></svg>`
    return svgToCanvas(svg, width, height)
  }, invalidate)
}

/**
 * Every KaTeX face inlined as data URLs (cached by `fontEmbedCssFor`). The
 * first formula captured might need nothing but `KaTeX_Math`; embedding only
 * what it uses would typeset `=`, digits and delimiters of every later
 * formula in the system serif.
 */
const latexFontEmbedCss = (booth: HTMLElement) => (
  fontEmbedCssFor([...declaredFontFamilies()].filter(family => /KaTeX/i.test(family)), booth)
)

let mathFontsPromise: Promise<void> | null = null
/**
 * Two waits before the first capture. `document.fonts.ready` settles once no
 * pending stylesheet load can still add faces — the embed stylesheet that
 * declares the KaTeX `@font-face`s is exactly such a load, and html-to-image
 * reads those rules from `document.styleSheets`. But `ready` only covers faces
 * something on the page already uses, and MathLive's faces stay `unloaded`
 * until a formula needs them, which the SVG snapshot cannot trigger itself.
 * So load every KaTeX face explicitly as well; otherwise the first captures
 * typeset in the system serif (`\ne` paints as `=`, delimiters do not stretch)
 * and stay cached that way.
 */
const ensureMathFontsLoaded = (): Promise<void> => {
  if (mathFontsPromise) return mathFontsPromise
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined
  if (!fonts) return Promise.resolve()
  const promise = fonts.ready.then(async () => {
    const faces = Array.from(fonts as unknown as Iterable<FontFace>).filter(face => /KaTeX/i.test(face.family))
    if (!faces.length) {
      // No embed stylesheet in this document yet — retry on the next capture.
      mathFontsPromise = null
      return
    }
    await Promise.all(faces.map(face => face.load().catch(() => undefined)))
  })
  mathFontsPromise = promise.catch(() => {
    mathFontsPromise = null
  })
  return mathFontsPromise
}

const MATH_RASTER_BOOTH_ID = 'fika-math-raster-booth'

/**
 * Offscreen stage classed as the embed root so scoped `.fika-embed-root .ML__*`
 * rules match. A node hung off `document.body` without that class typesets
 * as a flat run (no fraction bars, no KaTeX metrics).
 */
const ensureMathRasterBooth = (): HTMLElement => {
  const existing = document.getElementById(MATH_RASTER_BOOTH_ID)
  if (existing instanceof HTMLElement) return existing
  const booth = document.createElement('div')
  booth.id = MATH_RASTER_BOOTH_ID
  booth.className = EMBED_ROOT_CLASS
  booth.setAttribute('aria-hidden', 'true')
  booth.style.cssText = [
    'position:fixed',
    'left:-10000px',
    'top:0',
    'width:max-content',
    'height:max-content',
    'pointer-events:none',
    'overflow:visible',
    'background:transparent',
  ].join(';')
  document.documentElement.appendChild(booth)
  return booth
}

const canvasHasInk = (node: HTMLCanvasElement): boolean => {
  const ctx = node.getContext('2d', { willReadFrequently: true })
  if (!ctx) return false
  const { width, height } = node
  if (!(width > 0) || !(height > 0)) return false
  const data = ctx.getImageData(0, 0, width, height).data
  let ink = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 12) continue
    if (data[i] > 248 && data[i + 1] > 248 && data[i + 2] > 248) continue
    ink++
    if (ink > 8) return true
  }
  return ink > 0
}

const fallbackMathCanvas = (latex: string, width: number, height: number, color: string, fontSize: number): HTMLCanvasElement => {
  const node = canvas(Math.max(1, width), Math.max(1, height))
  const ctx = node.getContext('2d')
  if (!ctx) return node
  ctx.fillStyle = color
  ctx.font = `${Math.max(8, fontSize)}px ui-sans-serif, system-ui, sans-serif`
  ctx.textBaseline = 'middle'
  ctx.fillText(latexFallbackText(latex), 2, node.height / 2, node.width - 4)
  return node
}

/** Above this many raster pixels the formula snapshot drops back to 1x. */
const LATEX_RASTER_HIDPI_BUDGET = 1_500_000

/**
 * MathLive typeset of a formula element, mirroring `LatexContent`'s DOM
 * (flex-centered box, a 36px stage fitted uniformly into the authored box).
 * html-to-image is used instead of a bare foreignObject because SVG-as-image
 * cannot load the MathLive web fonts.
 *
 * The fit is applied as a font size, not a CSS transform: inside the SVG
 * snapshot, box edges (the radical rule, fraction bars) snap to whole CSS
 * pixels of the pre-transform layout while glyphs scale exactly, so a scaled
 * 36px stage paints a `\sqrt` rule thinner and lower than the surd's tick.
 * Laying out at the final size keeps that snap error under half a pixel, and
 * the 2x capture halves it again.
 */
export const getLatexRaster = (
  element: PPTLatexElement,
  invalidate: () => void,
): Raster | undefined => {
  const width = Math.max(1, Math.ceil(element.width))
  const height = Math.max(1, Math.ceil(element.height))
  const key = `latex:${hash(`${element.latex}\0${width}\0${height}\0${element.color}`)}`
  return requestRaster(key, async () => {
    await ensureMathliveReady()
    await ensureMathFontsLoaded()
    const host = document.createElement('div')
    host.style.cssText = `position:fixed;left:-99999px;top:0;width:${width}px;height:${height}px;display:flex;align-items:center;justify-content:center;overflow:hidden;pointer-events:none;color:${element.color}`
    const stage = document.createElement('div')
    stage.style.cssText = `width:max-content;line-height:normal;font-size:${LATEX_ELEMENT_FONT_SIZE}px;color:inherit`
    stage.innerHTML = renderLatexElementHtml(element.latex)
    const formula = stage.firstElementChild as HTMLElement | null
    if (formula) {
      formula.style.display = 'block'
      formula.style.margin = '0'
      formula.style.color = 'inherit'
    }
    host.className = EMBED_ROOT_CLASS
    host.appendChild(stage)
    const booth = ensureMathRasterBooth()
    booth.appendChild(host)
    try {
      const naturalWidth = stage.offsetWidth
      const naturalHeight = stage.offsetHeight
      if (!(naturalWidth > 0) || !(naturalHeight > 0)) return null
      const fit = Math.min(width / naturalWidth, height / naturalHeight)
      stage.style.fontSize = `${LATEX_ELEMENT_FONT_SIZE * fit}px`
      const [{ toCanvas }, fontEmbedCSS] = await Promise.all([import('html-to-image'), latexFontEmbedCss(booth)])
      return await toCanvas(host, {
        width,
        height,
        pixelRatio: width * height * 4 <= LATEX_RASTER_HIDPI_BUDGET ? 2 : 1,
        fontEmbedCSS,
        // The clone inherits the host's computed offscreen position, which
        // would shift the capture out of view — pin it back for the snapshot.
        style: { position: 'static', left: '0', top: '0' },
      })
    }
    catch {
      return null
    }
    finally {
      host.remove()
    }
  }, invalidate)
}

/**
 * Typeset inline/display math at the painted font size and snapshot it.
 * The booth is `.fika-embed-root` so scoped MathLive CSS applies; a white
 * or empty capture falls back to readable TeX-ish text instead of a gap.
 */
export const getInlineMathRaster = (
  latex: string,
  fontSize: number,
  color: string,
  display: boolean,
  invalidate: () => void,
): Raster | undefined => {
  const size = Math.max(1, fontSize)
  const key = `imath:${hash(`${latex}\0${size}\0${color}\0${display ? 1 : 0}`)}`
  return requestRaster(key, async () => {
    await ensureMathliveReady()
    await ensureMathFontsLoaded()
    const host = document.createElement('div')
    host.className = EMBED_ROOT_CLASS
    host.style.cssText = [
      'display:inline-block',
      'width:max-content',
      'line-height:normal',
      `font-size:${size}px`,
      `color:${color}`,
      'background:transparent',
    ].join(';')
    host.innerHTML = renderMathToHtml(latex, display)
    const booth = ensureMathRasterBooth()
    booth.appendChild(host)
    try {
      void host.offsetWidth
      const width = Math.ceil(host.offsetWidth)
      const height = Math.ceil(host.offsetHeight)
      if (!(width > 0) || !(height > 0)) {
        return fallbackMathCanvas(latex, Math.ceil(size * 3), Math.ceil(size * 1.5), color, size)
      }
      const [{ toCanvas }, fontEmbedCSS] = await Promise.all([import('html-to-image'), latexFontEmbedCss(booth)])
      const captured = await toCanvas(host, {
        width,
        height,
        pixelRatio: 2,
        fontEmbedCSS,
        style: { position: 'static', left: '0', top: '0' },
      })
      if (captured && canvasHasInk(captured)) return captured
      return fallbackMathCanvas(latex, width, height, color, size)
    }
    catch {
      return fallbackMathCanvas(latex, Math.ceil(size * 3), Math.ceil(size * 1.5), color, size)
    }
    finally {
      host.remove()
    }
  }, invalidate)
}

export const hasPendingRasters = () => jobs.size > 0 || workQueue.length > 0

export const clearSlideRasterResources = () => {
  for (const raster of rasters.values()) {
    if (raster instanceof ImageBitmap) raster.close()
  }
  rasters.clear()
  listeners.clear()
  staleChartRasters.clear()
}
