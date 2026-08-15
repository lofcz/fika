import { bindStyles } from '@/utils/cssm'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { useRef, useCallback, memo, useEffect } from 'react';
import { nativePointerEvent, type ReactPointerEvent } from '@/utils/canvasPointer';

import { openContextmenu } from '@/utils/openContextmenu';
import { useMainStore, useSlidesStore } from '@/store';
import { drainCommitQueue } from '@/utils/commitQueue';
import { rememberTableStyleTarget } from '@/utils/tableStyleTarget';
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
  isEditing?: boolean;
};

const TableElement = memo((props: ITableElementProps) => {
  const { elementInfo, contextmenus, isEditing } = props;
  const { LL } = useI18nContext();
  const canvasScale = useMainStore(s => s.canvasScale);
  const handleElementId = useMainStore(s => s.handleElementId);
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

  const editable = !!(isEditing && !elementInfo.lock);
  useEffect(() => {
    if (handleElementId === props.elementInfo.id) return
    if (useMainStore.getState().editingElementId === props.elementInfo.id) drainCommitQueue()
    if (useMainStore.getState().selectedTableCells.length) useMainStore.getState().setSelectedTableCells([])
  }, [handleElementId, props.elementInfo.id]);
  useEffect(() => {
    useMainStore.getState().setDisableHotkeysState(editable);
  }, [editable]);
  useEffect(() => () => { forgetTableCellWrite(elementInfoRef.current.id); }, []);

  const startEdit = useCallback(() => {
    if (elementInfoRef.current.lock) return;
    const main = useMainStore.getState();
    main.setEditingElementId(elementInfoRef.current.id);
    main.setDisableHotkeysState(true);
  }, []);

  const isScalingRef = useRef(useMainStore.getState().isScaling);
  const elementHeightRef = useRef(props.elementInfo.height);
  const elementIdRef = useRef(props.elementInfo.id);
  elementHeightRef.current = props.elementInfo.height;
  elementIdRef.current = props.elementInfo.id;

  useEffect(() => {
    let wasScaling = useMainStore.getState().isScaling;
    isScalingRef.current = wasScaling;
    return useMainStore.subscribe(state => {
      const next = state.isScaling;
      if (next && !wasScaling && state.editingElementId === elementIdRef.current) {
        drainCommitQueue()
      }
      if (wasScaling && !next && elementRef.current) {
        const table = elementRef.current.querySelector('table');
        if (table instanceof HTMLTableElement) delete table.dataset.liveColOrigin;
      }
      wasScaling = next;
      isScalingRef.current = next;
    });
  }, []);

  useEffect(() => {
    const el = elementRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries: ResizeObserverEntry[]) => {
      const contentRect = entries[0].contentRect;
      if (!elementRef.current || isScalingRef.current) return;
      const realHeight = contentRect.height;
      if (elementHeightRef.current !== realHeight) {
        useSlidesStore.getState().updateElement({
          id: elementIdRef.current,
          props: { height: realHeight }
        });
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
    rememberTableStyleTarget(elementIdRef.current, cells);
    useMainStore.getState().setSelectedTableCells(cells);
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
      width: elementInfo.width + 'px',
      height: elementInfo.height + 'px'
    }}
  >
    <div className={cx('rotate-wrapper')} style={{ transform: `rotate(${elementInfo.rotate}deg)` }}>
      <div
        className={cx('element-content')}
        data-live-box
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
}, (prev, next) => !!prev.isEditing === !!next.isEditing && areTableElementInfosEqual(prev.elementInfo, next.elementInfo));
export default TableElement;
