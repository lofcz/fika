import type { ComposeOption } from 'echarts/core';
import type { BarSeriesOption, LineSeriesOption, PieSeriesOption, ScatterSeriesOption, RadarSeriesOption } from 'echarts/charts';
import type { GridComponentOption, LegendComponentOption, RadarComponentOption } from 'echarts/components';
import tinycolor from 'tinycolor2';
import type { ChartData, ChartType } from '@/types/slides';
type EChartOption = ComposeOption<BarSeriesOption | LineSeriesOption | PieSeriesOption | ScatterSeriesOption | RadarSeriesOption | GridComponentOption | LegendComponentOption | RadarComponentOption>;
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
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
const labelStyle = (color?: string) => ({
  color,
  fontFamily: FONT,
  fontSize: 12,
  fontWeight: 500 as const
});
const cartesianGrid = (hasLegend: boolean): GridComponentOption => ({
  containLabel: true,
  top: 10,
  right: 8,
  left: 4,
  bottom: hasLegend ? 28 : 4
});
const legendOption = (show: boolean, textColor?: string): LegendComponentOption | undefined => {
  if (!show) return undefined;
  return {
    bottom: 0,
    left: 'center',
    icon: 'roundRect',
    itemWidth: 10,
    itemHeight: 10,
    itemGap: 16,
    itemStyle: {
      borderWidth: 0
    },
    textStyle: {
      ...labelStyle(textColor),
      padding: [0, 0, 0, 2]
    }
  };
};
const categoryAxis = (labels: string[], textColor?: string) => ({
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
    ...labelStyle(textColor),
    hideOverlap: true,
    margin: 10
  },
  splitLine: {
    show: false
  }
});
const valueAxis = (textColor?: string, lineColor?: string) => ({
  type: 'value' as const,
  axisTick: {
    show: false
  },
  axisLine: {
    show: false
  },
  axisLabel: {
    ...labelStyle(textColor),
    margin: 8
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
const barSeries = (data: ChartData, stack: boolean, radius: [number, number, number, number]): BarSeriesOption[] => data.series.map((item, index) => {
  const seriesItem: BarSeriesOption = {
    data: item,
    name: data.legends[index],
    type: 'bar',
    barMaxWidth: 44,
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
const lineSeries = (data: ChartData, stack: boolean, smooth: boolean, area: boolean): LineSeriesOption[] => data.series.map((item, index) => {
  const seriesItem: LineSeriesOption = {
    data: item,
    name: data.legends[index],
    type: 'line',
    smooth,
    symbol: 'circle',
    symbolSize: 8,
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
const pieSeries = (data: ChartData, textColor: string | undefined, ring: boolean): PieSeriesOption => ({
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
    ...labelStyle(textColor),
    formatter: '{b}'
  },
  labelLine: {
    length: 8,
    length2: 10,
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
export interface ChartOptionPayload {
  type: ChartType;
  data: ChartData;
  themeColors: string[];
  textColor?: string;
  lineColor?: string;
  lineSmooth?: boolean;
  stack?: boolean;
}
export const getChartOption = ({
  type,
  data,
  themeColors,
  textColor,
  lineColor,
  lineSmooth,
  stack
}: ChartOptionPayload): EChartOption | null => {
  const textStyle = {
    ...labelStyle(textColor)
  };
  const hasLegend = data.series.length > 1;
  const legend = legendOption(hasLegend, textColor);
  const animation = {
    animationDuration: 420,
    animationEasing: 'cubicOut' as const
  };
  if (type === 'bar') {
    return {
      color: themeColors,
      textStyle,
      legend,
      grid: cartesianGrid(hasLegend),
      xAxis: categoryAxis(data.labels, textColor),
      yAxis: valueAxis(textColor, lineColor),
      series: barSeries(data, stack ?? false, [BAR_RADIUS, BAR_RADIUS, 0, 0]),
      ...animation
    };
  }
  if (type === 'column') {
    return {
      color: themeColors,
      textStyle,
      legend,
      grid: cartesianGrid(hasLegend),
      yAxis: categoryAxis(data.labels, textColor),
      xAxis: valueAxis(textColor, lineColor),
      series: barSeries(data, stack ?? false, [0, BAR_RADIUS, BAR_RADIUS, 0]),
      ...animation
    };
  }
  if (type === 'line') {
    return {
      color: themeColors,
      textStyle,
      legend,
      grid: cartesianGrid(hasLegend),
      xAxis: categoryAxis(data.labels, textColor),
      yAxis: valueAxis(textColor, lineColor),
      series: lineSeries(data, stack ?? false, lineSmooth || false, false),
      ...animation
    };
  }
  if (type === 'area') {
    return {
      color: themeColors,
      textStyle,
      legend,
      grid: cartesianGrid(hasLegend),
      xAxis: {
        ...categoryAxis(data.labels, textColor),
        boundaryGap: false
      },
      yAxis: valueAxis(textColor, lineColor),
      series: lineSeries(data, stack ?? false, lineSmooth || false, true),
      ...animation
    };
  }
  if (type === 'pie') {
    return {
      color: themeColors,
      textStyle,
      legend: legendOption(true, textColor),
      series: [pieSeries(data, textColor, false)],
      ...animation
    };
  }
  if (type === 'ring') {
    return {
      color: themeColors,
      textStyle,
      legend: legendOption(true, textColor),
      series: [pieSeries(data, textColor, true)],
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
          ...labelStyle(textColor),
          padding: [6, 4]
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
        symbolSize: 6,
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
      symbolSize: 11,
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
      legend: legendOption(data.series.length > 2, textColor),
      grid: cartesianGrid(data.series.length > 2),
      xAxis: valueAxis(textColor, lineColor),
      yAxis: valueAxis(textColor, lineColor),
      series: formatedSeries,
      ...animation
    };
  }
  return null;
};
