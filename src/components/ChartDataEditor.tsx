import { bindStyles } from '@/utils/cssm'
import styles from './ChartDataEditor.module.scss'
const cx = bindStyles(styles)
import { useRef, useCallback, memo, useState, useEffect, type ClipboardEvent as ReactClipboardEvent, type MouseEvent as ReactMouseEvent } from 'react';

import type { ChartData, ChartType } from '@/types/slides';
import { KEYS } from '@/configs/hotkey';
import { pasteCustomClipboardString, pasteExcelClipboardString, pasteHTMLTableClipboardString } from '@/utils/clipboard';
import { queryFika } from '@/utils/portal';
import Button from '@/components/Button';
import Popover from '@/components/Popover';
import PopoverMenuItem from '@/components/PopoverMenuItem';
import { useI18nContext } from '@/i18n/useI18nContext';
export type IChartDataEditorProps = {
  type: ChartType;
  data: ChartData;
} & {
  onSave?: (payload: {
    data: ChartData;
    type: ChartType;
  }) => void;
  onClose?: () => void;
};
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const CELL_WIDTH = 100;
const CELL_HEIGHT = 32;
const ChartDataEditor = memo((props: IChartDataEditorProps) => {
  const {
    LL
  } = useI18nContext();
  const chartTypeLabel = useCallback((type: ChartType) => {
    const types = LL.configs.chart.types;
    return types[type]();
  }, [LL?.configs?.chart?.types]);
  const chartList: ChartType[] = ['bar', 'column', 'line', 'area', 'scatter', 'pie', 'ring', 'radar'];
  const [chartTypeSelectVisible, setChartTypeSelectVisible] = useState(false);
  const [selectedRange, setSelectedRange] = useState([0, 0]);
  const [tempRangeSize, setTempRangeSize] = useState({
    width: 0,
    height: 0
  });
  const [focusCell, setFocusCell] = useState<[number, number] | null>(null);
  const [chartType, setChartType] = useState<ChartType>('bar');

  const rangeLines = (() => {
    const width = selectedRange[0] * CELL_WIDTH;
    const height = selectedRange[1] * CELL_HEIGHT;
    return [{
      type: 't',
      style: {
        width: width + 'px'
      }
    }, {
      type: 'b',
      style: {
        top: height + 'px',
        width: width + 'px'
      }
    }, {
      type: 'l',
      style: {
        height: height + 'px'
      }
    }, {
      type: 'r',
      style: {
        left: width + 'px',
        height: height + 'px'
      }
    }];
  })();

  const resizablePointStyle = (() => {
    const width = selectedRange[0] * CELL_WIDTH;
    const height = selectedRange[1] * CELL_HEIGHT;
    return {
      left: width + 'px',
      top: height + 'px'
    };
  })();

  const initData = useCallback(() => {
    setChartType(props.type);
    const _data: string[][] = [];
    const {
      labels,
      legends,
      series
    } = props.data;
    const rowCount = labels.length;
    const colCount = series.length;
    _data.push(['', ...legends]);
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
      const row = [labels[rowIndex]];
      for (let colIndex = 0; colIndex < colCount; colIndex++) {
        row.push(series[colIndex][rowIndex] + '');
      }
      _data.push(row);
    }
    for (let rowIndex = 0; rowIndex < rowCount + 1; rowIndex++) {
      for (let colIndex = 0; colIndex < colCount + 1; colIndex++) {
        const inputRef = queryFika<HTMLInputElement>(`#cell-${rowIndex}-${colIndex}`);
        if (!inputRef) continue;
        inputRef.value = _data[rowIndex][colIndex] + '';
      }
    }
    setSelectedRange([colCount + 1, rowCount + 1]);
  }, [chartType, props.type, props.data, selectedRange]);
  useEffect(initData, []);

  const moveNextRow = useCallback(() => {
    if (!focusCell) return;
    const [rowIndex, colIndex] = focusCell;
    const inputRef = queryFika<HTMLInputElement>(`#cell-${rowIndex + 1}-${colIndex}`);
    inputRef && inputRef.focus();
  }, [focusCell]);
  const keyboardListener = useCallback((e: KeyboardEvent) => {
    const key = e.key.toUpperCase();
    if (key === KEYS.ENTER) moveNextRow();
  }, [moveNextRow]);
  const keyboardListenerRef = useRef(keyboardListener);
  keyboardListenerRef.current = keyboardListener;
  useEffect(() => {
    const listener = (e: KeyboardEvent) => keyboardListenerRef.current(e);
    document.addEventListener('keydown', listener);
    return () => {
      document.removeEventListener('keydown', listener);
    };
  }, []);

  const getTableData = useCallback(() => {
    const [col, row] = selectedRange;
    const labels: string[] = [];
    let legends: string[] = [];
    let series: number[][] = [];

    for (let rowIndex = 1; rowIndex < row; rowIndex++) {
      let labelsItem: string = `${LL.components.chartDataEditor.categoryDefault({
        n: rowIndex
      })}`;
      const labelInputRef = queryFika<HTMLInputElement>(`#cell-${rowIndex}-0`);
      if (labelInputRef && labelInputRef.value) labelsItem = labelInputRef.value;
      labels.push(labelsItem);
    }
    for (let colIndex = 1; colIndex < col; colIndex++) {
      let legendsItem: string = `${LL.components.chartDataEditor.seriesDefault({
        n: colIndex
      })}`;
      const labelInputRef = queryFika<HTMLInputElement>(`#cell-0-${colIndex}`);
      if (labelInputRef && labelInputRef.value) legendsItem = labelInputRef.value;
      legends.push(legendsItem);
    }
    for (let colIndex = 1; colIndex < col; colIndex++) {
      const seriesItem = [];
      for (let rowIndex = 1; rowIndex < row; rowIndex++) {
        const valueInputRef = queryFika<HTMLInputElement>(`#cell-${rowIndex}-${colIndex}`);
        let value = 0;
        if (valueInputRef && valueInputRef.value && !!+valueInputRef.value) {
          value = +valueInputRef.value;
        }
        seriesItem.push(value);
      }
      series.push(seriesItem);
    }

    if (chartType === 'scatter') {
      if (legends.length < 2) {
        legends.push('Y');
        series.push(series[0]);
      }
    }
    if (chartType === 'ring' || chartType === 'pie') {
      if (legends.length > 1) {
        legends = legends.slice(0, 1);
        series = series.slice(0, 1);
      }
    }
    props.onSave?.({
      data: {
        labels,
        legends,
        series
      },
      type: chartType
    });
  }, [selectedRange, LL?.components?.chartDataEditor, chartType, props.onSave]);

  const clear = () => {
    for (let rowIndex = 1; rowIndex < 31; rowIndex++) {
      for (let colIndex = 1; colIndex < 7; colIndex++) {
        const inputRef = queryFika<HTMLInputElement>(`#cell-${rowIndex}-${colIndex}`);
        if (!inputRef) continue;
        inputRef.value = '';
      }
    }
  };
  const fillTableData = (data: string[][], rowIndex: number, colIndex: number) => {
    const maxRow = rowIndex + data.length;
    const maxCol = colIndex + data[0].length;
    for (let i = rowIndex; i < maxRow; i++) {
      for (let j = colIndex; j < maxCol; j++) {
        const inputRef = queryFika<HTMLInputElement>(`#cell-${i}-${j}`);
        if (!inputRef) continue;
        inputRef.value = data[i - rowIndex][j - colIndex];
      }
    }
  };

  const handlePaste = (e: ReactClipboardEvent<HTMLInputElement>, rowIndex: number, colIndex: number) => {
    e.preventDefault();
    if (!e.clipboardData) return;
    const clipboardDataFirstItem = e.clipboardData.items[0];
    if (clipboardDataFirstItem && clipboardDataFirstItem.kind === 'string') {
      if (clipboardDataFirstItem.type === 'text/plain') {
        clipboardDataFirstItem.getAsString(text => {
          const clipboardData = pasteCustomClipboardString(text);
          if (typeof clipboardData === 'object') return;
          const excelData = pasteExcelClipboardString(text);
          if (excelData) {
            fillTableData(excelData, rowIndex, colIndex);
            return;
          }
          document.execCommand('insertText', false, text);
        });
      } else if (clipboardDataFirstItem.type === 'text/html') {
        clipboardDataFirstItem.getAsString(html => {
          const htmlData = pasteHTMLTableClipboardString(html);
          if (htmlData) fillTableData(htmlData, rowIndex, colIndex);
        });
      }
    }
  };

  const closeEditor = useCallback(() => props.onClose?.(), [props.onClose]);

  const changeSelectRange = useCallback((e: ReactMouseEvent) => {
    let isMouseDown = true;
    const startPageX = e.pageX;
    const startPageY = e.pageY;
    const originWidth = selectedRange[0] * CELL_WIDTH;
    const originHeight = selectedRange[1] * CELL_HEIGHT;
    let currentSize = { width: 0, height: 0 };
    document.onmousemove = e => {
      if (!isMouseDown) return;
      const currentPageX = e.pageX;
      const currentPageY = e.pageY;
      const x = currentPageX - startPageX;
      const y = currentPageY - startPageY;
      const width = originWidth + x;
      const height = originHeight + y;
      currentSize = { width, height };
      setTempRangeSize(currentSize);
    };
    document.onmouseup = e => {
      isMouseDown = false;
      document.onmousemove = null;
      document.onmouseup = null;
      const endPageX = e.pageX;
      const endPageY = e.pageY;
      if (startPageX === endPageX && startPageY === endPageY) return;

      let width = currentSize.width;
      let height = currentSize.height;
      if (width % CELL_WIDTH > CELL_WIDTH * 0.5) width = width + (CELL_WIDTH - width % CELL_WIDTH);
      if (height % CELL_HEIGHT > CELL_HEIGHT * 0.5) height = height + (CELL_HEIGHT - height % CELL_HEIGHT);
      let row = Math.round(height / CELL_HEIGHT);
      let col = Math.round(width / CELL_WIDTH);
      if (row < 3) row = 3;
      if (col < 2) col = 2;
      setSelectedRange([col, row]);
      setTempRangeSize({
        width: 0,
        height: 0
      });
    };
  }, [selectedRange]);
  return <><div className={cx("chart-data-editor")}><div className={cx("editor-content")}><div className={cx("handler")}><div className={cx("col-header")}>{Array.from({ length: 7 }, (_, i) => i + 1).map(colIndex => <div className={cx("col-header-item")} key={colIndex}><div className={cx("col-key")}>{alphabet[colIndex - 1]}</div></div>)}</div><div className={cx("row-header")}>{Array.from({ length: 31 }, (_, i) => i + 1).map(rowIndex => <div className={cx("row-header-item")} key={rowIndex}><div className={cx("row-key")}>{rowIndex}</div></div>)}</div><div className={cx("all-header")}><svg className={cx("triangle")} width='8' height='8' viewBox='0 0 8 8' xmlns='http://www.w3.org/2000/svg'><path d='M8,0 L8,8 L0,8 L8,0' fill='#ccc' /></svg></div></div><div className={cx("range-box")}><div className={cx("temp-range")} style={{
            width: tempRangeSize.width + 'px',
            height: tempRangeSize.height + 'px'
          }} />{rangeLines.map(line => <div className={cx(['range-line', line.type])} key={line.type} style={line.style} />)}<div className={cx("resizable")} style={(resizablePointStyle)} onMouseDown={(event) => { event.stopPropagation(); changeSelectRange(event) }} /></div><table><tbody>{Array.from({ length: 31 }, (_, i) => i + 1).map(rowIndex => <tr key={rowIndex}>{Array.from({ length: 7 }, (_, i) => i + 1).map(colIndex => <td key={colIndex} className={cx({
                'head': colIndex === 1 && rowIndex <= selectedRange[1] || rowIndex === 1 && colIndex <= selectedRange[0]
              })}>{!(rowIndex === 1 && colIndex === 1) ? <input className={cx(['item', {
                  'selected': rowIndex <= selectedRange[1] && colIndex <= selectedRange[0]
                }])} id={`cell-${rowIndex - 1}-${colIndex - 1}`} autoComplete='off' onFocus={() => {
                  setFocusCell([rowIndex - 1, colIndex - 1]);
                }} onPaste={($event) => {
                  handlePaste($event, rowIndex - 1, colIndex - 1);
                }} /> : null}</td>)}</tr>)}</tbody></table></div><div className={cx("btns")}><div className={cx("left")}>{LL.components.chartDataEditor.chartTypeLabel()}{chartTypeLabel(chartType)}<Popover trigger='click' placement='top' value={chartTypeSelectVisible} onUpdateValue={(value: any) => {
            setChartTypeSelectVisible(value);
          }} content={chartList.map(item => <PopoverMenuItem center key={item} onClick={() => {
            setChartType(item);
            setChartTypeSelectVisible(false);
          }}>{chartTypeLabel(item)}</PopoverMenuItem>)}><span className={cx("change")}>{LL.components.chartDataEditor.clickToChange()}</span></Popover></div><div className={cx("right")}><Button className={cx("btn")} onClick={() => {
            closeEditor();
          }}>{LL.common.cancel()}</Button><Button className={cx("btn")} onClick={() => {
            clear();
          }}>{LL.components.chartDataEditor.clearData()}</Button><Button type='primary' className={cx("btn")} onClick={() => {
            getTableData();
          }}>{LL.common.confirm()}</Button></div></div></div></>;
});
export default ChartDataEditor;
