import { bindStyles } from '@/utils/cssm'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { useRef, useCallback, memo, useState, useEffect } from 'react';
import { nativePointerEvent, type ReactPointerEvent } from '@/utils/canvasPointer';

import { openContextmenu } from '@/utils/openContextmenu';
import { useMainStore, useSlidesStore } from '@/store';
import type { PPTTableElement, TableCell } from '@/types/slides';
import type { ContextmenuItem } from '@/components/Contextmenu/types';
import useHistorySnapshot from '@/hooks/useHistorySnapshot';
import EditableTable from './EditableTable';
import { areTableElementInfosEqual, forgetTableCellWrite, rememberTableCellWrite } from './gridCompare';
import { useI18nContext } from '@/i18n/useI18nContext';

export type ITableElementProps = {
  elementInfo: PPTTableElement;
  selectElement: (e: MouseEvent | TouchEvent, element: PPTTableElement, canMove?: boolean) => void;
  contextmenus: () => ContextmenuItem[] | null;
};

const TableElement = memo((props: ITableElementProps) => {
  const { elementInfo, contextmenus } = props;
  const { LL } = useI18nContext();
  const canvasScale = useMainStore(s => s.canvasScale);
  const handleElementId = useMainStore(s => s.handleElementId);
  const isScaling = useMainStore(s => s.isScaling);
  const elementRef = useRef<HTMLDivElement | null>(null);
  const { addHistorySnapshot } = useHistorySnapshot();
  const selectElementRef = useRef(props.selectElement);
  const contextmenusRef = useRef(contextmenus);
  const elementInfoRef = useRef(elementInfo);
  selectElementRef.current = props.selectElement;
  contextmenusRef.current = contextmenus;
  elementInfoRef.current = elementInfo;

  const handleSelectElement = useCallback((e: ReactPointerEvent) => {
    if (elementInfoRef.current.lock) return;
    e.stopPropagation();
    selectElementRef.current(nativePointerEvent(e), elementInfoRef.current);
  }, []);

  const [editable, setEditable] = useState(false);
  useEffect(() => {
    if (handleElementId !== props.elementInfo.id) setEditable(false);
  }, [handleElementId, props.elementInfo.id]);
  useEffect(() => {
    useMainStore.getState().setDisableHotkeysState(editable);
  }, [editable]);
  useEffect(() => () => { forgetTableCellWrite(elementInfoRef.current.id); }, []);

  const startEdit = useCallback(() => {
    if (!elementInfoRef.current.lock) setEditable(true);
  }, []);

  const [realHeightCache, setRealHeightCache] = useState(-1);
  const isScalingRef = useRef(isScaling);
  const realHeightCacheRef = useRef(realHeightCache);
  const elementHeightRef = useRef(props.elementInfo.height);
  const elementIdRef = useRef(props.elementInfo.id);
  isScalingRef.current = isScaling;
  realHeightCacheRef.current = realHeightCache;
  elementHeightRef.current = props.elementInfo.height;
  elementIdRef.current = props.elementInfo.id;

  useEffect(() => {
    if (handleElementId !== props.elementInfo.id) return;
    if (isScaling) setEditable(false);
    if (!isScaling && realHeightCacheRef.current !== -1) {
      useSlidesStore.getState().updateElement({
        id: props.elementInfo.id,
        props: { height: realHeightCacheRef.current }
      });
      setRealHeightCache(-1);
    }
  }, [isScaling]);

  useEffect(() => {
    const el = elementRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries: ResizeObserverEntry[]) => {
      const contentRect = entries[0].contentRect;
      if (!elementRef.current) return;
      const realHeight = contentRect.height;
      if (elementHeightRef.current !== realHeight) {
        if (!isScalingRef.current) {
          useSlidesStore.getState().updateElement({
            id: elementIdRef.current,
            props: { height: realHeight }
          });
        }
        else setRealHeightCache(realHeight);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const updateTableCells = useCallback((data: TableCell[][]) => {
    rememberTableCellWrite(elementIdRef.current, data);
    useSlidesStore.getState().updateElement({
      id: elementIdRef.current,
      props: { data }
    });
    addHistorySnapshot();
  }, [addHistorySnapshot]);

  const updateColWidths = useCallback((widths: number[]) => {
    const nextWidth = widths.reduce((a, b) => a + b, 0);
    const nextColWidths = widths.map(item => item / nextWidth);
    useSlidesStore.getState().updateElement({
      id: elementIdRef.current,
      props: { width: nextWidth, colWidths: nextColWidths }
    });
    addHistorySnapshot();
  }, [addHistorySnapshot]);

  const updateSelectedCells = useCallback((cells: string[]) => {
    void Promise.resolve().then(() => useMainStore.getState().setSelectedTableCells(cells));
  }, []);

  const stopTableMouseDown = useCallback((event: { stopPropagation: () => void }) => {
    event.stopPropagation();
  }, []);

  return <div
    className={cx('editable-element-table', { lock: elementInfo.lock })}
    ref={elementRef}
    style={{
      top: elementInfo.top + 'px',
      left: elementInfo.left + 'px',
      width: elementInfo.width + 'px'
    }}
  >
    <div className={cx('rotate-wrapper')} style={{ transform: `rotate(${elementInfo.rotate}deg)` }}>
      <div
        className={cx('element-content')}
        onContextMenu={event => { event.stopPropagation(); event.preventDefault(); openContextmenu(event, contextmenusRef.current); }}
      >
        <EditableTable
          onMouseDown={stopTableMouseDown}
          elementId={elementInfo.id}
          data={elementInfo.data}
          width={elementInfo.width}
          cellMinHeight={elementInfo.cellMinHeight}
          colWidths={elementInfo.colWidths}
          outline={elementInfo.outline}
          theme={elementInfo.theme}
          editable={editable}
          onChange={updateTableCells}
          onChangeColWidths={updateColWidths}
          onChangeSelectedCells={updateSelectedCells}
        />
        {!editable || elementInfo.lock ? <div
          className={cx('table-mask', { lock: elementInfo.lock })}
          onDoubleClick={startEdit}
          onMouseDown={handleSelectElement}
          onTouchStart={handleSelectElement}
        >
          {handleElementId === elementInfo.id ? <div className={cx('mask-tip')} style={{ transform: `scale(${1 / canvasScale})` }}>{LL.canvas.table.doubleClickToEdit()}</div> : null}
        </div> : null}
      </div>
    </div>
  </div>;
}, (prev, next) => areTableElementInfosEqual(prev.elementInfo, next.elementInfo));
export default TableElement;
