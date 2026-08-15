import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart, ScatterChart, RadarChart } from 'echarts/charts'
import { GridComponent, LegendComponent, RadarComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import { DEFAULT_CHART_LINE_COLOR } from '@/configs/chart'
import { useSlidesStore } from '@/store'
import type { PPTChartElement } from '@/types/slides'
import { resolveChartElementSeriesColors, resolveChartLabelColor } from '@/utils/textContrast'
import { expandChartThemeColors, getChartOption } from './chartOption'

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  RadarChart,
  GridComponent,
  LegendComponent,
  RadarComponent,
  SVGRenderer,
])

let boothLock: Promise<string> = Promise.resolve('')

const renderSvg = (element: PPTChartElement) => {
  const width = Math.max(1, element.width)
  const height = Math.max(1, element.height)
  const slides = useSlidesStore.getState()
  const slide = slides.slides.find(item => item.elements.some(el => el.id === element.id))
  const option = getChartOption({
    type: element.chartType,
    data: element.data,
    themeColors: expandChartThemeColors(resolveChartElementSeriesColors(element, {
      background: slide?.background,
      fallbackSurface: slides.theme.backgroundColor,
    })),
    textColor: resolveChartLabelColor(element, {
      background: slide?.background,
      fallbackSurface: slides.theme.backgroundColor,
      fontColor: slides.theme.fontColor,
    }),
    lineColor: element.lineColor || DEFAULT_CHART_LINE_COLOR,
    lineSmooth: element.options?.lineSmooth || false,
    stack: element.options?.stack || false,
  })
  if (!option) return ''
  const host = document.createElement('div')
  host.setAttribute('data-chart-booth', element.id)
  host.style.cssText = `position:fixed;left:-99999px;top:0;width:${width}px;height:${height}px;pointer-events:none`
  document.body.appendChild(host)
  const chart = echarts.init(host, null, { renderer: 'svg', width, height })
  chart.setOption({
    ...option,
    animation: false,
    animationDuration: 0,
    animationDurationUpdate: 0,
  }, true)
  const svg = host.querySelector('svg')
  if (svg) {
    svg.setAttribute('width', String(width))
    svg.setAttribute('height', String(height))
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  }
  const html = svg ? svg.outerHTML : ''
  chart.dispose()
  host.remove()
  return html
}

export const chartElementToBoothHtml = async (element: PPTChartElement) => {
  const run = () => renderSvg(element)
  const next = boothLock.then(run, run)
  boothLock = next.catch(() => '')
  return next
}
