import { bindStyles } from '@/utils/cssm'
import styles from './EditableTable.module.scss'
const cx = bindStyles(styles)
import { type CSSProperties, type MouseEvent as ReactMouseEvent, useMemo, useCallback, useRef, memo, useState, useEffect } from 'react';

import { openContextmenu } from '@/utils/openContextmenu';
import { debounce } from '@/utils/debounce';
import { arraysEqual } from '@/utils/object';
import { nanoid } from 'nanoid';
import { useMainStore } from '@/store';
import type { PPTElementOutline, TableCell, TableTheme } from '@/types/slides';
import type { ContextmenuItem } from '@/components/Contextmenu/types';
import { KEYS } from '@/configs/hotkey';
import { queryFika } from '@/utils/portal';
import { findSlideViewport, getPointerClient, pointerDeltaToCanvas } from '@/utils/canvasPointer';
import emitter, { EmitterEvents, type TableCommand } from '@/utils/emitter';
import message from '@/utils/message';
import { getCellStyle, getTextStyle, formatText } from './utils';
import { areTableCellViewEqual, isTableCellHtmlEcho, numArrEqual, outlineEqual, tableGridStructureEqual, tableGridTextEqual, themeEqual } from './gridCompare';
import useHideCells from './useHideCells';
import useSubThemeColor from './useSubThemeColor';
import useMathReady from './useMathReady';
import CustomTextarea from './CustomTextarea';
import { useI18nContext } from '@/i18n/useI18nContext';

type TableCellViewProps = {
  cell: TableCell;
  rowIndex: number;
  colIndex: number;
  isActive: boolean;
  isSelected: boolean;
  hide: boolean;
  outline: PPTElementOutline;
  cellMinHeight: number;
  onMouseDown: (e: MouseEvent, rowIndex: number, colIndex: number) => void;
  onMouseEnter: (rowIndex: number, colIndex: number) => void;
  onContextMenu: (event: ReactMouseEvent<HTMLTableCellElement>) => void;
  onInput: (value: string, rowIndex: number, colIndex: number) => void;
  onInsertExcel: (value: string[][], rowIndex: number, colIndex: number) => void;
};

const areTableCellViewPropsEqual = (prev: TableCellViewProps, next: TableCellViewProps) => {
  if (prev.outline !== next.outline && !outlineEqual(prev.outline, next.outline)) return false;
  return areTableCellViewEqual(prev, next);
};

const TableCellView = memo((props: TableCellViewProps) => {
  const {
    cell,
    rowIndex,
    colIndex,
    isActive,
    isSelected,
    hide,
    outline,
    cellMinHeight,
    onMouseDown,
    onMouseEnter,
    onContextMenu,
    onInput,
    onInsertExcel
  } = props;
  return <td
    className={cx('cell', {
      selected: isSelected,
      active: isActive
    })}
    style={{
      ...getCellStyle(outline, cell.style),
      display: hide ? 'none' : ''
    }}
    rowSpan={cell.rowspan}
    colSpan={cell.colspan}
    data-cell-index={`${rowIndex}_${colIndex}`}
    onMouseDown={$event => { onMouseDown($event.nativeEvent, rowIndex, colIndex); }}
    onMouseEnter={() => { onMouseEnter(rowIndex, colIndex); }}
    onContextMenu={onContextMenu}
  >
    {isActive ? <CustomTextarea
      className={cx('cell-text', { active: isActive })}
      style={getTextStyle(cellMinHeight, cell.style)}
      value={cell.text}
      onUpdateValue={value => onInput(value, rowIndex, colIndex)}
      onInsertExcelData={value => onInsertExcel(value, rowIndex, colIndex)}
    /> : <div className={cx('cell-text')} style={getTextStyle(cellMinHeight, cell.style)} dangerouslySetInnerHTML={{ __html: formatText(cell.text) }} />}
  </td>;
}, areTableCellViewPropsEqual);
TableCellView.displayName = 'TableCellView';

export type IEditableTableProps = {
  elementId: string;
  data: TableCell[][];
  width: number;
  cellMinHeight: number;
  colWidths: number[];
  outline: PPTElementOutline;
  theme?: TableTheme;
  editable?: boolean;
  onMouseDown?: (e: ReactMouseEvent) => void;
} & {
  onChange?: (payload: TableCell[][]) => void;
  onChangeColWidths?: (payload: number[]) => void;
  onChangeSelectedCells?: (payload: string[]) => void;
};

const EditableTable = memo((props: IEditableTableProps) => {
  const { LL } = useI18nContext();
  const {
    elementId,
    data,
    width,
    cellMinHeight,
    colWidths,
    outline,
    theme,
    editable = true,
    onChange,
    onChangeColWidths,
    onChangeSelectedCells,
    onMouseDown
  } = props;
  const canvasScale = useMainStore(s => s.canvasScale);
  const contextmenusRef = useRef<(el: HTMLElement) => ContextmenuItem[]>(() => []);
  const [isStartSelect, setIsStartSelect] = useState(false);
  const [startCell, setStartCell] = useState<number[]>([]);
  const [endCell, setEndCell] = useState<number[]>([]);
  const tableCells = data;
  const setTableCells = (newData: TableCell[][]) => onChange?.(newData);

  const { themeColors } = useSubThemeColor(theme);
  useMathReady(tableCells);

  const [colSizeList, setColSizeList] = useState(() => colWidths.map(item => item * width));
  const colSizeListRef = useRef(colSizeList);
  colSizeListRef.current = colSizeList;
  const totalWidth = colSizeList.reduce((a, b) => a + b, 0);
  useEffect(() => {
    setColSizeList(colWidths.map(item => item * width));
  }, [colWidths, width]);

  const removeSelectedCells = useCallback(() => {
    setStartCell([]);
    setEndCell([]);
  }, []);
  useEffect(() => {
    if (!editable) removeSelectedCells();
  }, [editable, removeSelectedCells]);

  const dragLinePosition = useMemo(() => {
    const positions: number[] = [];
    for (let i = 1; i < colSizeList.length + 1; i++) {
      const pos = colSizeList.slice(0, i).reduce((a, b) => a + b, 0);
      positions.push(pos);
    }
    return positions;
  }, [colSizeList]);

  const { hideCells } = useHideCells(tableCells);

  const selectedCells = useMemo(() => {
    if (!startCell.length) return [] as string[];
    const [startX, startY] = startCell;
    if (!endCell.length) return [`${startX}_${startY}`];
    const [endX, endY] = endCell;
    if (startX === endX && startY === endY) return [`${startX}_${startY}`];
    const next: string[] = [];
    const minX = Math.min(startX, endX);
    const minY = Math.min(startY, endY);
    const maxX = Math.max(startX, endX);
    const maxY = Math.max(startY, endY);
    for (let i = 0; i < tableCells.length; i++) {
      const rowCells = tableCells[i];
      for (let j = 0; j < rowCells.length; j++) {
        if (i >= minX && i <= maxX && j >= minY && j <= maxY) next.push(`${i}_${j}`);
      }
    }
    return next;
  }, [startCell, endCell, tableCells]);

  const prevSelectedCells = useRef<string[] | undefined>(undefined);
  useEffect(() => {
    if (prevSelectedCells.current !== undefined && arraysEqual(selectedCells, prevSelectedCells.current)) return;
    const isFirst = prevSelectedCells.current === undefined;
    prevSelectedCells.current = selectedCells;
    if (isFirst) return;
    onChangeSelectedCells?.(selectedCells);
  }, [selectedCells, onChangeSelectedCells]);

  const activedCell = selectedCells.length > 1 ? null : selectedCells[0];

  const handleMouseup = () => setIsStartSelect(false);
  const isStartSelectRef = useRef(isStartSelect);
  isStartSelectRef.current = isStartSelect;
  const handleCellMousedown = useCallback((e: MouseEvent, rowIndex: number, colIndex: number) => {
    if (e.button === 0) {
      setEndCell([]);
      setIsStartSelect(true);
      setStartCell([rowIndex, colIndex]);
    }
  }, []);
  const handleCellMouseenter = useCallback((rowIndex: number, colIndex: number) => {
    if (!isStartSelectRef.current) return;
    setEndCell([rowIndex, colIndex]);
  }, []);
  const handleMouseupRef = useRef(handleMouseup);
  handleMouseupRef.current = handleMouseup;
  useEffect(() => {
    const onUp = () => handleMouseupRef.current();
    document.addEventListener('mouseup', onUp);
    return () => document.removeEventListener('mouseup', onUp);
  }, []);

  const isHideCell = (rowIndex: number, colIndex: number) => hideCells.includes(`${rowIndex}_${colIndex}`);

  const selectCol = (index: number) => {
    const maxRow = tableCells.length - 1;
    setStartCell([0, index]);
    setEndCell([maxRow, index]);
  };

  const selectRow = (index: number) => {
    const maxCol = tableCells[index].length - 1;
    setStartCell([index, 0]);
    setEndCell([index, maxCol]);
  };

  const selectAll = () => {
    const maxRow = tableCells.length - 1;
    const maxCol = tableCells[maxRow].length - 1;
    setStartCell([0, 0]);
    setEndCell([maxRow, maxCol]);
  };

  const deleteRow = (rowIndex: number) => {
    const _tableCells: TableCell[][] = JSON.parse(JSON.stringify(tableCells));
    const targetCells = tableCells[rowIndex];
    const hideCellsPos = [];
    for (let i = 0; i < targetCells.length; i++) {
      if (isHideCell(rowIndex, i)) hideCellsPos.push(i);
    }
    for (const pos of hideCellsPos) {
      for (let i = rowIndex; i >= 0; i--) {
        if (!isHideCell(i, pos)) {
          _tableCells[i][pos].rowspan = _tableCells[i][pos].rowspan - 1;
          break;
        }
      }
    }
    _tableCells.splice(rowIndex, 1);
    setTableCells(_tableCells);
  };

  const deleteCol = (colIndex: number) => {
    const _tableCells: TableCell[][] = JSON.parse(JSON.stringify(tableCells));
    const hideCellsPos = [];
    for (let i = 0; i < tableCells.length; i++) {
      if (isHideCell(i, colIndex)) hideCellsPos.push(i);
    }
    for (const pos of hideCellsPos) {
      for (let i = colIndex; i >= 0; i--) {
        if (!isHideCell(pos, i)) {
          _tableCells[pos][i].colspan = _tableCells[pos][i].colspan - 1;
          break;
        }
      }
    }
    setTableCells(_tableCells.map(item => {
      item.splice(colIndex, 1);
      return item;
    }));
    const nextCols = [...colSizeListRef.current];
    nextCols.splice(colIndex, 1);
    setColSizeList(nextCols);
    colSizeListRef.current = nextCols;
    onChangeColWidths?.(nextCols);
  };

  const insertRow = (rowIndex: number) => {
    const _tableCells: TableCell[][] = JSON.parse(JSON.stringify(tableCells));
    const rowCells: TableCell[] = [];
    for (let i = 0; i < _tableCells[0].length; i++) {
      rowCells.push({
        colspan: 1,
        rowspan: 1,
        text: '',
        id: nanoid(10)
      });
    }
    _tableCells.splice(rowIndex, 0, rowCells);
    setTableCells(_tableCells);
  };

  const insertCol = (colIndex: number) => {
    setTableCells(tableCells.map(item => {
      const cell = {
        colspan: 1,
        rowspan: 1,
        text: '',
        id: nanoid(10)
      };
      item.splice(colIndex, 0, cell);
      return item;
    }));
    const nextCols = [...colSizeListRef.current];
    nextCols.splice(colIndex, 0, 100);
    setColSizeList(nextCols);
    colSizeListRef.current = nextCols;
    onChangeColWidths?.(nextCols);
  };

  const fillTable = (rowCount: number, colCount: number) => {
    let _tableCells: TableCell[][] = JSON.parse(JSON.stringify(tableCells));
    const defaultCell = {
      colspan: 1,
      rowspan: 1,
      text: ''
    };
    if (rowCount) {
      const newRows = [];
      for (let i = 0; i < rowCount; i++) {
        const rowCells: TableCell[] = [];
        for (let j = 0; j < _tableCells[0].length; j++) {
          rowCells.push({
            ...defaultCell,
            id: nanoid(10)
          });
        }
        newRows.push(rowCells);
      }
      _tableCells = [..._tableCells, ...newRows];
    }
    if (colCount) {
      _tableCells = _tableCells.map(item => {
        const cells: TableCell[] = [];
        for (let i = 0; i < colCount; i++) {
          const cell = {
            ...defaultCell,
            id: nanoid(10)
          };
          cells.push(cell);
        }
        return [...item, ...cells];
      });
      const nextCols = [...colSizeListRef.current, ...new Array(colCount).fill(100)];
      setColSizeList(nextCols);
      colSizeListRef.current = nextCols;
      onChangeColWidths?.(nextCols);
    }
    setTableCells(_tableCells);
  };

  const mergeCells = () => {
    const [startX, startY] = startCell;
    const [endX, endY] = endCell;
    const minX = Math.min(startX, endX);
    const minY = Math.min(startY, endY);
    const maxX = Math.max(startX, endX);
    const maxY = Math.max(startY, endY);
    const _tableCells: TableCell[][] = JSON.parse(JSON.stringify(tableCells));
    _tableCells[minX][minY].rowspan = maxX - minX + 1;
    _tableCells[minX][minY].colspan = maxY - minY + 1;
    setTableCells(_tableCells);
    removeSelectedCells();
  };

  const splitCells = (rowIndex: number, colIndex: number) => {
    const _tableCells: TableCell[][] = JSON.parse(JSON.stringify(tableCells));
    _tableCells[rowIndex][colIndex].rowspan = 1;
    _tableCells[rowIndex][colIndex].colspan = 1;
    setTableCells(_tableCells);
    removeSelectedCells();
  };

  const handleMousedownColHandler = (e: MouseEvent, colIndex: number) => {
    removeSelectedCells();
    let isMouseDown = true;
    const originWidth = colSizeListRef.current[colIndex];
    const viewport = findSlideViewport(e.target);
    const startPointer = getPointerClient(e);
    const minWidth = 50;
    document.onmousemove = ev => {
      if (!isMouseDown) return;
      const { x: moveX } = pointerDeltaToCanvas(startPointer, ev, viewport, canvasScale);
      const nextWidth = originWidth + moveX < minWidth ? minWidth : Math.round(originWidth + moveX);
      const next = [...colSizeListRef.current];
      next[colIndex] = nextWidth;
      colSizeListRef.current = next;
      setColSizeList(next);
    };
    document.onmouseup = () => {
      isMouseDown = false;
      document.onmousemove = null;
      document.onmouseup = null;
      onChangeColWidths?.(colSizeListRef.current);
    };
  };

  const clearSelectedCellText = () => {
    const _tableCells: TableCell[][] = JSON.parse(JSON.stringify(tableCells));
    for (let i = 0; i < _tableCells.length; i++) {
      for (let j = 0; j < _tableCells[i].length; j++) {
        if (selectedCells.includes(`${i}_${j}`)) {
          _tableCells[i][j].text = '';
        }
      }
    }
    setTableCells(_tableCells);
  };

  const focusActiveCell = () => {
    void Promise.resolve().then(() => {
      const textRef = queryFika<HTMLInputElement>('.cell-text.active');
      if (textRef) textRef.focus();
    });
  };

  const tabActiveCell = () => {
    const getNextCell = (i: number, j: number): [number, number] | null => {
      if (!tableCells[i]) return null;
      if (!tableCells[i][j]) return getNextCell(i + 1, 0);
      if (isHideCell(i, j)) return getNextCell(i, j + 1);
      return [i, j];
    };
    setEndCell([]);
    const nextRow = startCell[0];
    const nextCol = startCell[1] + 1;
    const nextCell = getNextCell(nextRow, nextCol);
    if (!nextCell) {
      insertRow(nextRow + 1);
      setStartCell([nextRow + 1, 0]);
    }
    else setStartCell(nextCell);
    focusActiveCell();
  };

  const moveActiveCell = (dir: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT') => {
    const rowIndex = +selectedCells[0].split('_')[0];
    const colIndex = +selectedCells[0].split('_')[1];
    const rowLen = tableCells.length;
    const colLen = tableCells[0].length;
    const getEffectivePos = (pos: [number, number]): [number, number] => {
      if (pos[0] < 0 || pos[1] < 0 || pos[0] > rowLen - 1 || pos[1] > colLen - 1) return [0, 0];
      const p = `${pos[0]}_${pos[1]}`;
      if (!hideCells.includes(p)) return pos;
      if (dir === 'UP') return getEffectivePos([pos[0], pos[1] - 1]);
      if (dir === 'DOWN') return getEffectivePos([pos[0], pos[1] - 1]);
      if (dir === 'LEFT') return getEffectivePos([pos[0] - 1, pos[1]]);
      if (dir === 'RIGHT') return getEffectivePos([pos[0] - 1, pos[1]]);
      return [0, 0];
    };
    if (dir === 'UP') {
      const _rowIndex = rowIndex - 1;
      if (_rowIndex < 0) return;
      setEndCell([]);
      setStartCell(getEffectivePos([_rowIndex, colIndex]));
    }
    else if (dir === 'DOWN') {
      const _rowIndex = rowIndex + 1;
      if (_rowIndex > rowLen - 1) return;
      setEndCell([]);
      setStartCell(getEffectivePos([_rowIndex, colIndex]));
    }
    else if (dir === 'LEFT') {
      const _colIndex = colIndex - 1;
      if (_colIndex < 0) return;
      setEndCell([]);
      setStartCell(getEffectivePos([rowIndex, _colIndex]));
    }
    else if (dir === 'RIGHT') {
      const _colIndex = colIndex + 1;
      if (_colIndex > colLen - 1) return;
      setEndCell([]);
      setStartCell(getEffectivePos([rowIndex, _colIndex]));
    }
    focusActiveCell();
  };

  const getCaretPosition = (element: HTMLDivElement) => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const preCaretRange = range.cloneRange();
      preCaretRange.selectNodeContents(element);
      preCaretRange.setEnd(range.startContainer, range.startOffset);
      const start = preCaretRange.toString().length;
      preCaretRange.setEnd(range.endContainer, range.endOffset);
      const end = preCaretRange.toString().length;
      const len = element.textContent?.length || 0;
      return { start, end, len };
    }
    return null;
  };

  const keydownListener = (e: KeyboardEvent) => {
    if (!editable || !selectedCells.length) return;
    const key = e.key.toUpperCase();
    if (selectedCells.length < 2) {
      if (key === KEYS.TAB) {
        e.preventDefault();
        tabActiveCell();
      }
      else if ((e.ctrlKey || e.metaKey) && key === KEYS.UP) {
        e.preventDefault();
        const rowIndex = +selectedCells[0].split('_')[0];
        insertRow(rowIndex);
      }
      else if ((e.ctrlKey || e.metaKey) && key === KEYS.DOWN) {
        e.preventDefault();
        const rowIndex = +selectedCells[0].split('_')[0];
        insertRow(rowIndex + 1);
      }
      else if ((e.ctrlKey || e.metaKey) && key === KEYS.LEFT) {
        e.preventDefault();
        const colIndex = +selectedCells[0].split('_')[1];
        insertCol(colIndex);
      }
      else if ((e.ctrlKey || e.metaKey) && key === KEYS.RIGHT) {
        e.preventDefault();
        const colIndex = +selectedCells[0].split('_')[1];
        insertCol(colIndex + 1);
      }
      else if (key === KEYS.UP) {
        const range = getCaretPosition(e.target as HTMLDivElement);
        if (range && range.start === range.end && range.start === 0) moveActiveCell('UP');
      }
      else if (key === KEYS.DOWN) {
        const range = getCaretPosition(e.target as HTMLDivElement);
        if (range && range.start === range.end && range.start === range.len) moveActiveCell('DOWN');
      }
      else if (key === KEYS.LEFT) {
        const range = getCaretPosition(e.target as HTMLDivElement);
        if (range && range.start === range.end && range.start === 0) moveActiveCell('LEFT');
      }
      else if (key === KEYS.RIGHT) {
        const range = getCaretPosition(e.target as HTMLDivElement);
        if (range && range.start === range.end && range.start === range.len) moveActiveCell('RIGHT');
      }
    }
    else if (key === KEYS.DELETE) {
      clearSelectedCellText();
    }
  };
  const keydownListenerRef = useRef(keydownListener);
  keydownListenerRef.current = keydownListener;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keydownListenerRef.current(e);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const dataRef = useRef(tableCells);
  dataRef.current = tableCells;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const handleInput = useMemo(() => debounce(function (value: string, rowIndex: number, colIndex: number) {
    dataRef.current[rowIndex][colIndex].text = value;
    onChangeRef.current?.(dataRef.current);
  }, 300, { trailing: true }), []);
  useEffect(() => () => { handleInput.cancel(); }, [handleInput]);

  const insertExcelData = (excel: string[][], rowIndex: number, colIndex: number) => {
    const maxRow = excel.length;
    const maxCol = excel[0].length;
    let fillRowCount = 0;
    let fillColCount = 0;
    if (rowIndex + maxRow > tableCells.length) fillRowCount = rowIndex + maxRow - tableCells.length;
    if (colIndex + maxCol > tableCells[0].length) fillColCount = colIndex + maxCol - tableCells[0].length;
    if (fillRowCount || fillColCount) fillTable(fillRowCount, fillColCount);
    void Promise.resolve().then(() => {
      for (let i = 0; i < maxRow; i++) {
        for (let j = 0; j < maxCol; j++) {
          if (dataRef.current[rowIndex + i][colIndex + j]) {
            dataRef.current[rowIndex + i][colIndex + j].text = excel[i][j];
          }
        }
      }
      onChangeRef.current?.(dataRef.current);
    });
  };

  const getEffectiveTableCells = () => {
    const effectiveTableCells = [];
    for (let i = 0; i < tableCells.length; i++) {
      const rowCells = tableCells[i];
      const _rowCells = [];
      for (let j = 0; j < rowCells.length; j++) {
        if (!isHideCell(i, j)) _rowCells.push(rowCells[j]);
      }
      if (_rowCells.length) effectiveTableCells.push(_rowCells);
    }
    return effectiveTableCells;
  };

  const checkCanDeleteRowOrCol = () => {
    const effectiveTableCells = getEffectiveTableCells();
    const canDeleteRow = effectiveTableCells.length > 1;
    const canDeleteCol = effectiveTableCells[0].length > 1;
    return { canDeleteRow, canDeleteCol };
  };

  const getCommandTargetCell = () => {
    const selectedCell = selectedCells.find(cell => !hideCells.includes(cell));
    if (!selectedCell) return null;
    const [rowIndex, colIndex] = selectedCell.split('_').map(Number);
    return { rowIndex, colIndex };
  };

  const execTableCommand = (payload: TableCommand) => {
    if (payload.targetId !== elementId) return;
    const targetCell = getCommandTargetCell();
    const isBefore = payload.position === 'before';
    if (payload.command === 'insert-row') {
      const rowIndex = targetCell ? (isBefore ? targetCell.rowIndex : targetCell.rowIndex + 1) : (isBefore ? 0 : tableCells.length);
      return insertRow(rowIndex);
    }
    if (payload.command === 'insert-col') {
      const colCount = tableCells[0]?.length || 0;
      const colIndex = targetCell ? (isBefore ? targetCell.colIndex : targetCell.colIndex + 1) : (isBefore ? 0 : colCount);
      return insertCol(colIndex);
    }
    const { canDeleteRow, canDeleteCol } = checkCanDeleteRowOrCol();
    if (payload.command === 'delete-row') {
      if (!canDeleteRow) return message.warning(LL.canvas.table.keepOneRow());
      return deleteRow(targetCell ? targetCell.rowIndex : tableCells.length - 1);
    }
    if (payload.command === 'delete-col') {
      if (!canDeleteCol) return message.warning(LL.canvas.table.keepOneColumn());
      const colCount = tableCells[0]?.length || 1;
      return deleteCol(targetCell ? targetCell.colIndex : colCount - 1);
    }
  };
  const execTableCommandRef = useRef(execTableCommand);
  execTableCommandRef.current = execTableCommand;
  useEffect(() => {
    const onCommand = (payload: TableCommand) => execTableCommandRef.current(payload);
    emitter.on(EmitterEvents.TABLE_COMMAND, onCommand);
    return () => { emitter.off(EmitterEvents.TABLE_COMMAND, onCommand); };
  }, []);

  const checkCanMergeOrSplit = (rowIndex: number, colIndex: number) => {
    const isMultiSelected = selectedCells.length > 1;
    const targetCell = tableCells[rowIndex][colIndex];
    const canMerge = isMultiSelected;
    const canSplit = !isMultiSelected && (targetCell.rowspan > 1 || targetCell.colspan > 1);
    return { canMerge, canSplit };
  };

  const handleCellContextMenu = useCallback((event: ReactMouseEvent<HTMLTableCellElement>) => {
    event.stopPropagation();
    event.preventDefault();
    openContextmenu(event, (el: HTMLElement) => contextmenusRef.current(el));
  }, []);

  const contextmenus = (el: HTMLElement): ContextmenuItem[] => {
    const cellIndex = el.dataset.cellIndex as string;
    const rowIndex = +cellIndex.split('_')[0];
    const colIndex = +cellIndex.split('_')[1];
    if (!selectedCells.includes(`${rowIndex}_${colIndex}`)) {
      setStartCell([rowIndex, colIndex]);
      setEndCell([]);
    }
    const { canMerge, canSplit } = checkCanMergeOrSplit(rowIndex, colIndex);
    const { canDeleteRow, canDeleteCol } = checkCanDeleteRowOrCol();
    const t = LL.canvas.table.contextMenu;
    return [
      {
        text: t.insertColumn(),
        children: [
          { text: t.toLeft(), handler: () => insertCol(colIndex) },
          { text: t.toRight(), handler: () => insertCol(colIndex + 1) }
        ]
      },
      {
        text: t.insertRow(),
        children: [
          { text: t.toAbove(), handler: () => insertRow(rowIndex) },
          { text: t.toBelow(), handler: () => insertRow(rowIndex + 1) }
        ]
      },
      { text: t.deleteColumn(), disable: !canDeleteCol, handler: () => deleteCol(colIndex) },
      { text: t.deleteRow(), disable: !canDeleteRow, handler: () => deleteRow(rowIndex) },
      { divider: true },
      { text: t.mergeCells(), disable: !canMerge, handler: mergeCells },
      { text: t.unmergeCells(), disable: !canSplit, handler: () => splitCells(rowIndex, colIndex) },
      { divider: true },
      { text: t.selectCurrentColumn(), handler: () => selectCol(colIndex) },
      { text: t.selectCurrentRow(), handler: () => selectRow(rowIndex) },
      { text: t.selectAllCells(), handler: selectAll }
    ];
  };
  contextmenusRef.current = contextmenus;

  const insertExcelDataRef = useRef(insertExcelData);
  insertExcelDataRef.current = insertExcelData;
  const onInsertExcel = useCallback((value: string[][], rowIndex: number, colIndex: number) => {
    insertExcelDataRef.current(value, rowIndex, colIndex);
  }, []);

  return <div className={cx('editable-table')} style={{ width: totalWidth + 'px' }} onMouseDown={onMouseDown}>
    {editable ? <div className={cx('handler')}>{dragLinePosition.map((pos, index) => <div
      className={cx('drag-line')}
      key={index}
      style={{ left: pos + 'px' }}
      onMouseDown={$event => { handleMousedownColHandler($event.nativeEvent, index); }}
    />)}</div> : null}
    <table
      className={cx({
        theme,
        'row-header': theme?.rowHeader,
        'row-footer': theme?.rowFooter,
        'col-header': theme?.colHeader,
        'col-footer': theme?.colFooter
      })}
      style={{
        '--themeColor': theme?.color,
        '--headerColor': themeColors.header,
        '--subThemeColor1': themeColors.stripe,
        '--subThemeColor2': themeColors.stripeAlt
      } as CSSProperties}
    >
      <colgroup>{colSizeList.map((colWidth, index) => <col span={1} key={index} width={colWidth} />)}</colgroup>
      <tbody>{tableCells.map((rowCells, rowIndex) => <tr key={rowIndex} style={{ height: cellMinHeight + 'px' }}>
        {rowCells.map((cell, colIndex) => <TableCellView
          key={cell.id}
          cell={cell}
          rowIndex={rowIndex}
          colIndex={colIndex}
          isActive={activedCell === `${rowIndex}_${colIndex}`}
          isSelected={selectedCells.includes(`${rowIndex}_${colIndex}`) && selectedCells.length > 1}
          hide={hideCells.includes(`${rowIndex}_${colIndex}`)}
          outline={outline}
          cellMinHeight={cellMinHeight}
          onMouseDown={handleCellMousedown}
          onMouseEnter={handleCellMouseenter}
          onContextMenu={handleCellContextMenu}
          onInput={handleInput}
          onInsertExcel={onInsertExcel}
        />)}
      </tr>)}</tbody>
    </table>
  </div>;
}, (prev, next) => {
  if (prev.elementId !== next.elementId || prev.width !== next.width || prev.cellMinHeight !== next.cellMinHeight || prev.editable !== next.editable) return false;
  if (!numArrEqual(prev.colWidths, next.colWidths)) return false;
  if (prev.outline !== next.outline && !outlineEqual(prev.outline, next.outline)) return false;
  if (prev.theme !== next.theme && !themeEqual(prev.theme, next.theme)) return false;
  if (!tableGridStructureEqual(prev.data, next.data)) return false;
  if (!tableGridTextEqual(prev.data, next.data) && !isTableCellHtmlEcho(next.elementId, next.data)) return false;
  return true;
});
export default EditableTable;
