import { bindStyles } from '@/utils/cssm'
import styles from './Chart.module.scss'
const cx = bindStyles(styles)
import { useRef, useMemo, memo, useEffect } from 'react';

import tinycolor from 'tinycolor2';
import type { ChartData, ChartOptions, ChartType } from '@/types/slides';
import { getChartOption } from './chartOption';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart, ScatterChart, RadarChart } from 'echarts/charts';
import { GridComponent, LegendComponent, RadarComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

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
]);

export type IChartProps = {
  width: number;
  height: number;
  type: ChartType;
  data: ChartData;
  themeColors: string[];
  textColor?: string;
  lineColor?: string;
  options?: ChartOptions;
};

const Chart = memo((props: IChartProps) => {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const chartInst = useRef<echarts.ECharts | null>(null);
  const type = props.type;
  const data = props.data;
  const themeColorsProp = props.themeColors;
  const textColor = props.textColor;
  const lineColor = props.lineColor;
  const options = props.options;

  const themeColors = useMemo(() => {
    let colors: string[] = [];
    if (themeColorsProp.length >= 10) colors = themeColorsProp;
    else if (themeColorsProp.length === 1) colors = tinycolor(themeColorsProp[0]).analogous(10).map(color => color.toRgbString());
    else {
      const len = themeColorsProp.length;
      const supplement = tinycolor(themeColorsProp[len - 1]).analogous(10 + 1 - len).map(color => color.toRgbString());
      colors = [...themeColorsProp.slice(0, len - 1), ...supplement];
    }
    return colors;
  }, [themeColorsProp]);

  const typeRef = useRef(type);
  const dataRef = useRef(data);
  const themeColorsRef = useRef(themeColors);
  const textColorRef = useRef(textColor);
  const lineColorRef = useRef(lineColor);
  const optionsRef = useRef(options);
  typeRef.current = type;
  dataRef.current = data;
  themeColorsRef.current = themeColors;
  textColorRef.current = textColor;
  lineColorRef.current = lineColor;
  optionsRef.current = options;

  const updateOption = () => {
    const option = getChartOption({
      type: typeRef.current,
      data: dataRef.current,
      themeColors: themeColorsRef.current,
      textColor: textColorRef.current,
      lineColor: lineColorRef.current,
      lineSmooth: optionsRef.current?.lineSmooth || false,
      stack: optionsRef.current?.stack || false
    });
    if (option) chartInst.current?.setOption(option, true);
  };

  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    chartInst.current = echarts.init(el, null, { renderer: 'svg' });
    updateOption();
    const resizeListener = () => chartInst.current?.resize();
    const resizeObserver = new ResizeObserver(resizeListener);
    resizeObserver.observe(el);
    return () => {
      resizeObserver.disconnect();
      chartInst.current?.dispose();
      chartInst.current = null;
    };
  }, []);

  useEffect(() => { updateOption(); }, [type]);
  useEffect(() => { updateOption(); }, [data]);
  useEffect(() => { updateOption(); }, [themeColorsProp]);
  useEffect(() => { updateOption(); }, [textColor]);
  useEffect(() => { updateOption(); }, [lineColor]);
  useEffect(() => { updateOption(); }, [options]);

  return <div className={cx('chart')} ref={chartRef} />;
});
export default Chart;
