import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart, RadarChart, ScatterChart } from 'echarts/charts'
import { GridComponent, LegendComponent, RadarComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

import type { PPTChartElement, PPTCodeElement, PPTLatexElement, PPTMermaidElement } from '@/types/slides'
import { getChartOption, expandChartThemeColors } from '@/views/components/element/ChartElement/chartOption'
import { codeElementToBoothHtml } from '@/utils/codeHighlight'
import { isLightCodeTheme } from '@/configs/code'
import { renderMermaid } from '@/utils/mermaid'
import { LATEX_ELEMENT_FONT_SIZE, ensureMathliveReady, renderLatexElementHtml } from '@/utils/math'

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
 * the only reliable rasterization path.
 */
const svgToCanvas = async (svg: string, width: number, height: number): Promise<Raster | null> => {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const image = new Image()
    image.decoding = 'async'
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('SVG decode failed'))
      image.src = url
    })
    const result = canvas(width, height)
    result.getContext('2d')?.drawImage(image, 0, 0, result.width, result.height)
    return result
  }
  catch {
    return null
  }
  finally {
    URL.revokeObjectURL(url)
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
    const raw = await renderMermaid(element.code, `canvas-${hash(element.id + element.code)}`)
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
 * MathLive fonts inlined as data URLs, computed once. Without this cache
 * html-to-image would re-parse every stylesheet and re-fetch the font files
 * for each formula capture.
 */
let latexFontCssPromise: Promise<string> | null = null
const latexFontEmbedCss = (host: HTMLElement) => {
  latexFontCssPromise ??= import('html-to-image')
    .then(mod => mod.getFontEmbedCSS(host))
    .catch(() => {
      latexFontCssPromise = null
      return ''
    })
  return latexFontCssPromise
}

/**
 * MathLive typeset of a formula element, mirroring `LatexContent`'s DOM
 * (flex-centered box, 36px stage scaled uniformly into the authored box).
 * html-to-image is used instead of a bare foreignObject because SVG-as-image
 * cannot load the MathLive web fonts.
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
    try {
      await document.fonts.ready
    }
    catch {
      // Fonts that fail to load still produce a legible fallback raster.
    }
    const host = document.createElement('div')
    host.style.cssText = `position:fixed;left:-99999px;top:0;width:${width}px;height:${height}px;display:flex;align-items:center;justify-content:center;overflow:hidden;pointer-events:none;color:${element.color}`
    const stage = document.createElement('div')
    stage.style.cssText = `width:max-content;line-height:normal;font-size:${LATEX_ELEMENT_FONT_SIZE}px;transform-origin:center center;color:inherit`
    stage.innerHTML = renderLatexElementHtml(element.latex)
    const formula = stage.firstElementChild as HTMLElement | null
    if (formula) {
      formula.style.display = 'block'
      formula.style.margin = '0'
      formula.style.color = 'inherit'
    }
    host.appendChild(stage)
    document.body.appendChild(host)
    try {
      const naturalWidth = stage.offsetWidth
      const naturalHeight = stage.offsetHeight
      if (!(naturalWidth > 0) || !(naturalHeight > 0)) return null
      stage.style.transform = `scale(${Math.min(width / naturalWidth, height / naturalHeight)})`
      const [{ toCanvas }, fontEmbedCSS] = await Promise.all([import('html-to-image'), latexFontEmbedCss(host)])
      return await toCanvas(host, {
        width,
        height,
        pixelRatio: 1,
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

export const clearSlideRasterResources = () => {
  for (const raster of rasters.values()) {
    if (raster instanceof ImageBitmap) raster.close()
  }
  rasters.clear()
  listeners.clear()
  staleChartRasters.clear()
}
