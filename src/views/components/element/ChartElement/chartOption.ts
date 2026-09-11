import type { ComposeOption } from 'echarts/core';
import type { BarSeriesOption, LineSeriesOption, PieSeriesOption, ScatterSeriesOption, RadarSeriesOption } from 'echarts/charts';
import type { GridComponentOption, LegendComponentOption, RadarComponentOption } from 'echarts/components';
import tinycolor from 'tinycolor2';
import type { ChartData, ChartType } from '@/types/slides';
type EChartOption = ComposeOption<BarSeriesOption | LineSeriesOption | PieSeriesOption | ScatterSeriesOption | RadarSeriesOption | GridComponentOption | LegendComponentOption | RadarComponentOption>;
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
export const DEFAULT_CHART_FONT_SIZE = 12;
const BAR_RADIUS = 8;
const PIE_GAP = 2;
const RADAR_DEFAULT_SPLIT_NUMBER = 5;
const RADAR_SPLIT_NUMBERS = [4, 5, 6];
const fade = (color: string | undefined, alpha: number) => {
  if (!color) return undefined;
  const parsed = tinycolor(color);
  return parsed.isValid() ? parsed.setAlpha(alpha).toRgbString() : undefined;
};
const getRadarNiceMax = (max: number, splitNumber: number) => {
  if (max <= 0) return 0;
  const rawInterval = max / splitNumber;
  const exponent = Math.floor(Math.log10(rawInterval));
  const exp10 = Math.pow(10, exponent);
  const ratio = rawInterval / exp10;
  let niceRatio = 10;
  if (ratio <= 1) niceRatio = 1;else if (ratio <= 2) niceRatio = 2;else if (ratio <= 3) niceRatio = 3;else if (ratio <= 5) niceRatio = 5;
  return niceRatio * exp10 * splitNumber;
};
const getRadarScale = (max: number) => {
  if (max <= 0) return {
    max: 0,
    splitNumber: RADAR_DEFAULT_SPLIT_NUMBER
  };
  return RADAR_SPLIT_NUMBERS.map(splitNumber => ({
    max: getRadarNiceMax(max, splitNumber),
    splitNumber
  })).reduce((best, item) => {
    const bestOverflow = best.max - max;
    const overflow = item.max - max;
    if (overflow < bestOverflow) return item;
    const bestSplitNumberOffset = Math.abs(best.splitNumber - RADAR_DEFAULT_SPLIT_NUMBER);
    const splitNumberOffset = Math.abs(item.splitNumber - RADAR_DEFAULT_SPLIT_NUMBER);
    if (overflow === bestOverflow && splitNumberOffset < bestSplitNumberOffset) return item;
    return best;
  });
};
/**
 * Every pixel metric that has to keep pace with the label size — legend
 * swatches, gaps, axis margins, bar widths, pie leader lines — derives from
 * `fontSize` via `px()`, so a chart set to 20px labels does not end up with
 * 10px swatches and 4px margins from the 12px design.
 */
interface ChartMetrics {
  fontSize: number;
  px: (base: number) => number;
}
const chartMetrics = (fontSize?: number): ChartMetrics => {
  const size = fontSize && fontSize > 0 ? fontSize : DEFAULT_CHART_FONT_SIZE;
  const scale = size / DEFAULT_CHART_FONT_SIZE;
  return {
    fontSize: size,
    px: base => Math.round(base * scale)
  };
};
const labelStyle = (m: ChartMetrics, color?: string) => ({
  color,
  fontFamily: FONT,
  fontSize: m.fontSize,
  fontWeight: 500 as const
});
const cartesianGrid = (m: ChartMetrics, hasLegend: boolean): GridComponentOption => ({
  containLabel: true,
  top: m.px(10),
  right: m.px(8),
  left: m.px(4),
  // Legend sits below the plot; leave one label line plus breathing room.
  bottom: hasLegend ? m.px(16) + m.fontSize : m.px(4)
});
const legendOption = (m: ChartMetrics, show: boolean, textColor?: string): LegendComponentOption | undefined => {
  if (!show) return undefined;
  return {
    bottom: 0,
    left: 'center',
    icon: 'roundRect',
    itemWidth: m.px(10),
    itemHeight: m.px(10),
    itemGap: m.px(16),
    itemStyle: {
      borderWidth: 0
    },
    textStyle: {
      ...labelStyle(m, textColor),
      padding: [0, 0, 0, m.px(2)]
    }
  };
};
/**
 * Horizontal category axis: labels get one band each and wrap inside it.
 * Vertical (column charts): labels wrap past ~a third of the chart so long
 * categories cannot squeeze the plot into a sliver.
 */
type CategoryAxisLayout = {
  orient: 'x' | 'y';
  /** Chart element width in px; wrapping is skipped when unknown. */
  chartWidth?: number;
};
const categoryLabelWidth = (m: ChartMetrics, count: number, layout: CategoryAxisLayout): number | undefined => {
  if (!layout.chartWidth || count === 0) return undefined;
  if (layout.orient === 'y') return Math.floor(layout.chartWidth * 0.35);
  // Value-axis labels plus grid padding sit left of the bands.
  const plotWidth = layout.chartWidth - m.fontSize * 3.5 - m.px(12);
  return Math.max(m.fontSize * 2, Math.floor(plotWidth / count - m.px(6)));
};
const categoryAxis = (m: ChartMetrics, labels: string[], textColor: string | undefined, layout: CategoryAxisLayout) => {
  const width = categoryLabelWidth(m, labels.length, layout);
  return {
    type: 'category' as const,
    data: labels,
    axisTick: {
      show: false
    },
    axisLine: {
      show: true,
      lineStyle: {
        color: fade(textColor, 0.22) || textColor,
        width: 1
      }
    },
    axisLabel: {
      ...labelStyle(m, textColor),
      // ECharts' auto interval thins labels aggressively at readable sizes;
      // show them all and let hideOverlap drop only real collisions.
      interval: 0,
      hideOverlap: true,
      margin: m.px(10),
      ...(width ? {
        width,
        overflow: 'break' as const,
        lineHeight: Math.round(m.fontSize * 1.2)
      } : {})
    },
    splitLine: {
      show: false
    }
  };
};
const valueAxis = (m: ChartMetrics, textColor?: string, lineColor?: string) => ({
  type: 'value' as const,
  axisTick: {
    show: false
  },
  axisLine: {
    show: false
  },
  axisLabel: {
    ...labelStyle(m, textColor),
    margin: m.px(8)
  },
  splitLine: {
    show: true,
    lineStyle: {
      color: lineColor || fade(textColor, 0.12),
      width: 1,
      type: 'solid' as const
    }
  },
  splitNumber: 4
});
const barSeries = (m: ChartMetrics, data: ChartData, stack: boolean, radius: [number, number, number, number]): BarSeriesOption[] => data.series.map((item, index) => {
  const seriesItem: BarSeriesOption = {
    data: item,
    name: data.legends[index],
    type: 'bar',
    barMaxWidth: m.px(44),
    barGap: '32%',
    label: {
      show: false
    },
    itemStyle: {
      borderRadius: stack ? 2 : radius
    },
    emphasis: {
      itemStyle: {
        opacity: 0.92
      }
    }
  };
  if (stack) seriesItem.stack = 'A';
  return seriesItem;
});
const lineSeries = (m: ChartMetrics, data: ChartData, stack: boolean, smooth: boolean, area: boolean): LineSeriesOption[] => data.series.map((item, index) => {
  const seriesItem: LineSeriesOption = {
    data: item,
    name: data.legends[index],
    type: 'line',
    smooth,
    symbol: 'circle',
    symbolSize: m.px(8),
    showSymbol: true,
    lineStyle: {
      width: area ? 2 : 2.5,
      cap: 'round',
      join: 'round'
    },
    itemStyle: {
      borderWidth: 2,
      borderColor: 'rgba(255, 255, 255, 0.92)'
    },
    label: {
      show: false
    },
    emphasis: {
      focus: 'series',
      scale: 1.15
    }
  };
  if (area) seriesItem.areaStyle = {
    opacity: 0.16
  };
  if (stack) seriesItem.stack = 'A';
  return seriesItem;
});
const pieSeries = (m: ChartMetrics, data: ChartData, textColor: string | undefined, ring: boolean): PieSeriesOption => ({
  type: 'pie',
  data: data.series[0].map((item, index) => ({
    value: item,
    name: data.labels[index]
  })),
  radius: ring ? ['44%', '68%'] : '64%',
  center: ['50%', '46%'],
  padAngle: PIE_GAP,
  avoidLabelOverlap: true,
  itemStyle: {
    borderRadius: BAR_RADIUS,
    borderWidth: 0
  },
  label: {
    ...labelStyle(m, textColor),
    formatter: '{b}'
  },
  labelLine: {
    length: m.px(8),
    length2: m.px(10),
    lineStyle: {
      color: fade(textColor, 0.35),
      width: 1
    }
  },
  emphasis: {
    scale: true,
    scaleSize: 4,
    itemStyle: {
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowColor: 'transparent'
    },
    label: {
      show: true,
      fontWeight: 600
    }
  }
});
export const expandChartThemeColors = (themeColors: string[]): string[] => {
  if (themeColors.length >= 10) return themeColors
  if (themeColors.length === 1) {
    return tinycolor(themeColors[0]).analogous(10).map(color => color.toRgbString())
  }
  const len = themeColors.length
  const supplement = tinycolor(themeColors[len - 1]).analogous(10 + 1 - len).map(color => color.toRgbString())
  return [...themeColors.slice(0, len - 1), ...supplement]
}

export interface ChartOptionPayload {
  type: ChartType;
  data: ChartData;
  themeColors: string[];
  textColor?: string;
  lineColor?: string;
  lineSmooth?: boolean;
  stack?: boolean;
  fontSize?: number;
  /** Rendered chart width in px — lets category labels wrap inside their band. */
  width?: number;
}
export const getChartOption = ({
  type,
  data,
  themeColors,
  textColor,
  lineColor,
  lineSmooth,
  stack,
  fontSize,
  width
}: ChartOptionPayload): EChartOption | null => {
  const m = chartMetrics(fontSize);
  const xCategories: CategoryAxisLayout = { orient: 'x', chartWidth: width };
  const yCategories: CategoryAxisLayout = { orient: 'y', chartWidth: width };
  const textStyle = {
    ...labelStyle(m, textColor)
  };
  const hasLegend = data.series.length > 1;
  const legend = legendOption(m, hasLegend, textColor);
  const animation = {
    animationDuration: 420,
    animationEasing: 'cubicOut' as const
  };
  if (type === 'bar') {
    return {
      color: themeColors,
      textStyle,
      legend,
      grid: cartesianGrid(m, hasLegend),
      xAxis: categoryAxis(m, data.labels, textColor, xCategories),
      yAxis: valueAxis(m, textColor, lineColor),
      series: barSeries(m, data, stack ?? false, [BAR_RADIUS, BAR_RADIUS, 0, 0]),
      ...animation
    };
  }
  if (type === 'column') {
    return {
      color: themeColors,
      textStyle,
      legend,
      grid: cartesianGrid(m, hasLegend),
      yAxis: categoryAxis(m, data.labels, textColor, yCategories),
      xAxis: valueAxis(m, textColor, lineColor),
      series: barSeries(m, data, stack ?? false, [0, BAR_RADIUS, BAR_RADIUS, 0]),
      ...animation
    };
  }
  if (type === 'line') {
    return {
      color: themeColors,
      textStyle,
      legend,
      grid: cartesianGrid(m, hasLegend),
      xAxis: categoryAxis(m, data.labels, textColor, xCategories),
      yAxis: valueAxis(m, textColor, lineColor),
      series: lineSeries(m, data, stack ?? false, lineSmooth || false, false),
      ...animation
    };
  }
  if (type === 'area') {
    return {
      color: themeColors,
      textStyle,
      legend,
      grid: cartesianGrid(m, hasLegend),
      xAxis: {
        ...categoryAxis(m, data.labels, textColor, xCategories),
        boundaryGap: false
      },
      yAxis: valueAxis(m, textColor, lineColor),
      series: lineSeries(m, data, stack ?? false, lineSmooth || false, true),
      ...animation
    };
  }
  if (type === 'pie') {
    return {
      color: themeColors,
      textStyle,
      legend: legendOption(m, true, textColor),
      series: [pieSeries(m, data, textColor, false)],
      ...animation
    };
  }
  if (type === 'ring') {
    return {
      color: themeColors,
      textStyle,
      legend: legendOption(m, true, textColor),
      series: [pieSeries(m, data, textColor, true)],
      ...animation
    };
  }
  if (type === 'radar') {
    const values: number[] = [];
    for (const item of data.series) values.push(...item);
    const {
      max,
      splitNumber
    } = getRadarScale(Math.max(...values, 0));
    const gridLine = lineColor || fade(textColor, 0.18);
    return {
      color: themeColors,
      textStyle,
      legend,
      radar: {
        splitNumber,
        indicator: data.labels.map(item => ({
          name: item,
          max
        })),
        axisName: {
          ...labelStyle(m, textColor),
          padding: [m.px(6), m.px(4)]
        },
        axisLine: {
          lineStyle: {
            color: fade(textColor, 0.2) || gridLine,
            width: 1
          }
        },
        splitLine: {
          lineStyle: {
            color: gridLine,
            width: 1
          }
        },
        splitArea: {
          show: true,
          areaStyle: {
            color: [fade(textColor, 0.05) || 'transparent', 'transparent']
          }
        }
      },
      series: [{
        type: 'radar',
        symbol: 'circle',
        symbolSize: m.px(6),
        lineStyle: {
          width: 2,
          cap: 'round',
          join: 'round'
        },
        areaStyle: {
          opacity: 0.14
        },
        data: data.series.map((item, index) => ({
          value: item,
          name: data.legends[index]
        })),
        emphasis: {
          focus: 'series'
        }
      }],
      ...animation
    };
  }
  if (type === 'scatter') {
    const xData = data.series[0];
    const ySeries = data.series.length > 1 ? data.series.slice(1) : [xData];
    const formatedSeries: ScatterSeriesOption[] = ySeries.map((item, index) => ({
      type: 'scatter',
      symbolSize: m.px(11),
      data: xData.map((x, dataIndex) => [x, item[dataIndex]]),
      name: data.legends[index + 1],
      itemStyle: {
        opacity: 0.88
      },
      emphasis: {
        scale: 1.2
      }
    }));
    return {
      color: themeColors,
      textStyle,
      legend: legendOption(m, data.series.length > 2, textColor),
      grid: cartesianGrid(m, data.series.length > 2),
      xAxis: valueAxis(m, textColor, lineColor),
      yAxis: valueAxis(m, textColor, lineColor),
      series: formatedSeries,
      ...animation
    };
  }
  return null;
};
