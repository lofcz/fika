import { bindStyles } from '@/utils/cssm'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { useRef, useCallback, memo, useEffect } from 'react';
import { nativePointerEvent, type ReactPointerEvent } from '@/utils/canvasPointer';

import { openContextmenu } from '@/utils/openContextmenu';
import { useMainStore, useSlidesStore } from '@/store';
import { drainCommitQueue } from '@/utils/commitQueue';
import { collectTableCellIds, rememberTableStyleTarget } from '@/utils/tableStyleTarget';
import type { PPTTableElement, TableCell } from '@/types/slides';
import type { ContextmenuItem } from '@/components/Contextmenu/types';
import useHistorySnapshot from '@/hooks/useHistorySnapshot';
import EditableTable from './EditableTable';
import StaticTable from './StaticTable';
import { areTableElementInfosEqual, computeUniformTableHeight, forgetTableCellWrite, rememberTableCellWrite } from './gridCompare';
import { useI18nContext } from '@/i18n/useI18nContext';
import { flushElementSizeSync, scheduleElementSizeSync } from '@/views/Editor/Canvas/batchedHeightSync';

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
  const isHandleElement = useMainStore(s => s.handleElementId === props.elementInfo.id);
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
  const mountEditable = editable || isHandleElement;
  const wasEditableRef = useRef(false);
  useEffect(() => {
    if (isHandleElement) return
    if (useMainStore.getState().editingElementId === props.elementInfo.id) drainCommitQueue()
  }, [isHandleElement, props.elementInfo.id]);
  useEffect(() => {
    if (editable) {
      wasEditableRef.current = true;
      useMainStore.getState().setDisableHotkeysState(true);
    }
    else if (wasEditableRef.current) {
      wasEditableRef.current = false;
      useMainStore.getState().setDisableHotkeysState(false);
    }
  }, [editable]);
  useEffect(() => () => {
    if (wasEditableRef.current) {
      wasEditableRef.current = false;
      useMainStore.getState().setDisableHotkeysState(false);
    }
    const id = elementInfoRef.current.id;
    flushElementSizeSync(id);
    forgetTableCellWrite(id);
  }, []);

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
        if (table instanceof HTMLTableElement) {
          delete table.dataset.liveColOrigin;
          // Release imperative drag constraints; React and the content-sized
          // rows own the table again after the gesture.
          for (const key of ['width', 'height', 'min-width', 'max-width']) table.style.removeProperty(key);
          for (const cell of table.querySelectorAll<HTMLElement>('td, th')) cell.style.removeProperty('height');
          for (const col of table.querySelectorAll<HTMLElement>('col')) col.style.removeProperty('width');
          for (const key of ['min-width', 'max-width']) table.parentElement?.style.removeProperty(key);
        }
        const content = elementRef.current.querySelector<HTMLElement>('[data-live-box]');
        content?.style.removeProperty('width');
        content?.style.removeProperty('height');
      }
      wasScaling = next;
      isScalingRef.current = next;
    });
  }, []);

  const mountEditableRef = useRef(mountEditable);
  mountEditableRef.current = mountEditable;

  // The element's height follows the live table (uniform rows, each as tall
  // as the tallest row's content, `cellMinHeight` the floor) — not the other
  // way round. Observe BOTH `StaticTable` (so unselected agent-created tables
  // with tall text grow to fit without clipping) and `EditableTable`.
  const syncHeightToTable = useCallback(() => {
    const wrapper = elementRef.current?.querySelector<HTMLElement>('[data-live-table]');
    if (!wrapper || isScalingRef.current) return;
    // Layout px (unaffected by the canvas zoom transform).
    const realHeight = wrapper.offsetHeight;
    if (!(realHeight > 0)) return;
    if (mountEditableRef.current) {
      if (Math.abs(elementHeightRef.current - realHeight) >= 0.5) {
        scheduleElementSizeSync(elementIdRef.current, { height: realHeight });
      }
      return;
    }
    if (realHeight > elementHeightRef.current + 0.5) {
      // Static view: measure natural row heights directly (without `height / rows`
      // feedback) and write the exact uniform `max(tallestRow, cellMinHeight) * rows`
      // height in ONE single store write matching the painter/PPTX export.
      const table = wrapper.querySelector('table');
      const rows = Array.from(table?.tBodies[0]?.rows ?? []);
      const targetHeight = rows.length
        ? computeUniformTableHeight(
            rows.map(row => row.offsetHeight),
            elementInfoRef.current.cellMinHeight,
            realHeight,
          )
        : realHeight;
      if (targetHeight > elementHeightRef.current + 0.5) {
        scheduleElementSizeSync(elementIdRef.current, { height: targetHeight });
      }
    }
  }, []);
  useEffect(() => {
    const wrapper = elementRef.current?.querySelector('[data-live-table]');
    if (!wrapper) return;
    const observer = new ResizeObserver(() => { syncHeightToTable(); });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [mountEditable, syncHeightToTable]);
  // A store write that the content overrules (a smaller `height`, a lower
  // `cellMinHeight`) leaves the wrapper's size unchanged, so the observer
  // stays silent — reconcile explicitly (skip initial mount, which ResizeObserver handles).
  const didSyncMountRef = useRef(false);
  useEffect(() => {
    if (!didSyncMountRef.current) {
      didSyncMountRef.current = true;
      return;
    }
    syncHeightToTable();
  }, [syncHeightToTable, elementInfo.height, elementInfo.cellMinHeight, elementInfo.data]);

  const updateTableCells = useCallback((data: TableCell[][], ignoreHistory = false) => {
    rememberTableCellWrite(elementIdRef.current, data);
    useSlidesStore.getState().updateElement({
      id: elementIdRef.current,
      props: { data }
    });
    if (!ignoreHistory) addHistorySnapshot();
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
    if (useMainStore.getState().handleElementId !== elementIdRef.current) return;
    const cellIds = collectTableCellIds(elementInfoRef.current.data, cells);
    rememberTableStyleTarget(elementIdRef.current, cells, cellIds);
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
        {mountEditable ? <EditableTable
          onMouseDown={stopTableMouseDown}
          elementId={elementInfo.id}
          data={elementInfo.data}
          width={elementInfo.width}
          initialHeight={elementInfo.height}
          cellMinHeight={elementInfo.cellMinHeight}
          colWidths={elementInfo.colWidths}
          outline={elementInfo.outline}
          theme={elementInfo.theme}
          editable={editable}
          onChange={updateTableCells}
          onChangeColWidths={updateColWidths}
          onChangeSelectedCells={updateSelectedCells}
        /> : <StaticTable
          data={elementInfo.data}
          width={elementInfo.width}
          height={elementInfo.height}
          cellMinHeight={elementInfo.cellMinHeight}
          colWidths={elementInfo.colWidths}
          outline={elementInfo.outline}
          theme={elementInfo.theme}
          liveTable
          onMouseDown={stopTableMouseDown}
        />}
        {!editable || elementInfo.lock ? <div
          className={cx('table-mask', { lock: elementInfo.lock })}
          onDoubleClick={startEdit}
          onMouseDown={handleSelectElement}
          onTouchStart={handleSelectElement}
        >
          {isHandleElement ? <div className={cx('mask-tip')} style={{ transform: `scale(${1 / canvasScale})` }}>{LL.canvas.table.doubleClickToEdit()}</div> : null}
        </div> : null}
      </div>
    </div>
  </div>;
}, (prev, next) => !!prev.isEditing === !!next.isEditing && areTableElementInfosEqual(prev.elementInfo, next.elementInfo));
export default TableElement;
