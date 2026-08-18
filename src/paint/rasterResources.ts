import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart, RadarChart, ScatterChart } from 'echarts/charts'
import { GridComponent, LegendComponent, RadarComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

import type { PPTChartElement, PPTCodeElement, PPTMermaidElement } from '@/types/slides'
import { getChartOption, expandChartThemeColors } from '@/views/components/element/ChartElement/chartOption'
import { highlightCodeBlock } from '@/utils/codeHighlight'
import { isLightCodeTheme } from '@/configs/code'
import { renderMermaid } from '@/utils/mermaid'

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

const svgBitmap = async (svg: string): Promise<ImageBitmap | null> => {
  try {
    return await createImageBitmap(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
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
  return requestRaster(key, async () => {
    const raw = await renderMermaid(element.code, `canvas-${hash(element.id + element.code)}`)
    const svg = raw.replace(
      /<svg\b/,
      `<svg width="${Math.max(1, element.width)}" height="${Math.max(1, element.height)}"`,
    )
    return svgBitmap(svg)
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
  return requestRaster(key, async () => {
    let html: string
    let bg = isLightCodeTheme(element.theme) ? '#ffffff' : '#0d1117'
    let fg = isLightCodeTheme(element.theme) ? '#24292f' : '#e6edf3'
    try {
      const highlighted = await highlightCodeBlock(element.code, element.language, element.theme)
      html = highlighted.html
      bg = highlighted.bg
      fg = highlighted.fg
    }
    catch {
      html = `<pre>${escapeXml(element.code)}</pre>`
    }
    const gutter = element.showLineNumbers ? 'counter-reset:line; .line:before{counter-increment:line;content:counter(line);display:inline-block;width:3em;color:#8b949e}' : ''
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${element.width}" height="${element.height}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml" style="box-sizing:border-box;width:100%;height:100%;overflow:hidden;padding:12px;background:${bg};color:${fg};font:${element.fontSize}px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre;">
          <style>pre{margin:0;font:inherit} ${gutter}</style>${html}
        </div>
      </foreignObject>
    </svg>`
    return svgBitmap(svg)
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
