import { bindStyles } from '@/utils/cssm'
import { Icon, type IconName } from '@/components/Icon'
import styles from './SelectPanel.module.scss'
const cx = bindStyles(styles)
import { useCallback, memo, useState, type FocusEvent as ReactFocusEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import { useMainStore, useSlidesStore, selectCurrentSlide, selectHandleElement } from '@/store';
import type { PPTElement } from '@/types/slides';
import { useI18nContext } from '@/i18n/useI18nContext';
import { queryFika } from '@/utils/portal';
import useOrderElement from '@/hooks/useOrderElement';
import useHideElement from '@/hooks/useHideElement';
import useSelectElement from '@/hooks/useSelectElement';
import useLockElement from '@/hooks/useLockElement';
import { ElementOrderCommands } from '@/types/edit';
import MoveablePanel from '@/components/MoveablePanel';
const TYPE_ICONS: Record<string, IconName> = {
  text: 'type',
  image: 'image',
  shape: 'shapes',
  line: 'spline',
  chart: 'chart-pie',
  table: 'table',
  video: 'video',
  audio: 'volume-2',
  latex: 'radical',
  mermaid: 'git-branch'
};
const SelectPanel = memo(() => {
  const {
    LL
  } = useI18nContext();
  const slidesStore = useSlidesStore();
  const mainStore = useMainStore();
  const currentSlide = useSlidesStore(selectCurrentSlide);
  const handleElement = useMainStore(selectHandleElement);
  const handleElementId = useMainStore(s => s.handleElementId);
  const activeElementIdList = useMainStore(s => s.activeElementIdList);
  const activeGroupElementId = useMainStore(s => s.activeGroupElementId);
  const hiddenElementIdList = useMainStore(s => s.hiddenElementIdList);
  const {
    orderElement
  } = useOrderElement();
  const {
    selectElement
  } = useSelectElement();
  const {
    toggleHideElement,
    showAllElements,
    hideAllElements
  } = useHideElement();
  const {
    unlockElement
  } = useLockElement();
  const panelTitle = LL.editor.selectPanel.title({
    selected: activeElementIdList.length,
    total: currentSlide?.elements.length || 0
  });
  const typeIcon = (type: string) => TYPE_ICONS[type] ?? 'shapes';
  const elementTypeLabel = (type: string) => {
    const types = LL.editor.elementTypes;
    const labels: Record<string, () => string> = {
      text: types.text,
      image: types.image,
      shape: types.shape,
      line: types.line,
      chart: types.chart,
      table: types.table,
      video: types.video,
      audio: types.audio,
      latex: types.latex,
      mermaid: types.mermaid,
      code: types.code
    };
    return labels[type]?.() ?? type;
  };
  const itemClass = (el: PPTElement) => ({
    active: activeElementIdList.includes(el.id),
    'group-active': activeGroupElementId === el.id,
    lock: el.lock,
    hidden: hiddenElementIdList.includes(el.id)
  });
  interface GroupElements {
    type: 'group';
    id: string;
    elements: PPTElement[];
  }
  type ElementItem = PPTElement | GroupElements;
  const elements = (() => {
    const _elements: ElementItem[] = [];
    for (const el of currentSlide?.elements || []) {
      if (el.groupId) {
        const lastItem = _elements[_elements.length - 1];
        if (lastItem && lastItem.type === 'group' && lastItem.id && lastItem.id === el.groupId) {
          lastItem.elements.push(el);
        } else _elements.push({
          type: 'group',
          id: el.groupId,
          elements: [el]
        });
      } else _elements.push(el);
    }
    return _elements;
  })();
  const selectGroupEl = useCallback((item: GroupElements, id: string) => {
    if (handleElementId === id) return;
    if (hiddenElementIdList.includes(id)) return;
    const idList = item.elements.filter(item => !item.lock).map(el => el.id);
    if (idList.length) {
      mainStore.setActiveElementIdList(idList);
      mainStore.setHandleElementId(id);
      Promise.resolve().then(() => mainStore.setActiveGroupElementId(id));
    }
  }, [handleElementId, hiddenElementIdList, mainStore]);
  const [editingElId, setEditingElId] = useState('');
  const saveElementName = useCallback((e: ReactFocusEvent<HTMLInputElement> | ReactKeyboardEvent<HTMLInputElement>, id: string) => {
    const name = (e.target as HTMLInputElement).value;
    slidesStore.updateElement({
      id,
      props: {
        name
      }
    });
    setEditingElId('');
  }, [slidesStore]);
  const enterEdit = useCallback((id: string) => {
    setEditingElId(id);
    Promise.resolve().then(() => {
      const inputRef = queryFika<HTMLInputElement>(`#select-panel-input-${id}`);
      inputRef?.focus();
    });
  }, []);
  const close = useCallback(() => {
    mainStore.setSelectPanelState(false);
  }, [mainStore]);
  const renderItem = (item: PPTElement, onClick: () => void) => (
    <div className={cx('item', itemClass(item))} key={item.id} onClick={onClick} onDoubleClick={() => enterEdit(item.id)}>
      <Icon icon={typeIcon(item.type)} className={cx("type-icon")} />
      {editingElId === item.id ? (
        <input
          id={`select-panel-input-${item.id}`}
          defaultValue={item.name || elementTypeLabel(item.type)}
          className={cx("input")}
          type="text"
          onBlur={($event) => saveElementName($event, item.id)}
          onKeyDown={(event) => { if (event.key === 'Enter') saveElementName(event, item.id) }}
        />
      ) : (
        <div className={cx("name")}>{item.name || elementTypeLabel(item.type)}</div>
      )}
      <div className={cx("icons")}>
        {item.lock ? (
          <Icon icon="lock" className={cx("icon lock")} onClick={(event) => { event.stopPropagation(); unlockElement(item) }} />
        ) : (
          <span className={cx("icon spacer")} />
        )}
        {hiddenElementIdList.includes(item.id) ? (
          <Icon icon="eye-off" className={cx("icon")} onClick={(event) => { event.stopPropagation(); toggleHideElement(item.id) }} />
        ) : (
          <Icon icon="eye" className={cx("icon")} onClick={(event) => { event.stopPropagation(); toggleHideElement(item.id) }} />
        )}
      </div>
    </div>
  );
  return (
    <MoveablePanel className={cx("select-panel")} width={268} height={0} title={panelTitle} left={-270} top={90} onClose={() => close()}>
      <div className={cx("panel-body")}>
        {elements.length ? (
          <div className={cx("toolbar")}>
            <div className={cx("chips")}>
              <button type="button" className={cx("chip")} onClick={() => showAllElements()}>{LL.editor.selectPanel.showAll()}</button>
              <button type="button" className={cx("chip")} onClick={() => hideAllElements()}>{LL.editor.selectPanel.hideAll()}</button>
            </div>
            {handleElement ? (
              <div className={cx("layer-btns")}>
                <button type="button" className={cx("icon-btn")} data-tooltip={LL.editor.positionPanel.moveDown()} onClick={() => orderElement(handleElement!, ElementOrderCommands.UP)}>
                  <Icon icon="chevron-down" />
                </button>
                <button type="button" className={cx("icon-btn")} data-tooltip={LL.editor.positionPanel.moveUp()} onClick={() => orderElement(handleElement!, ElementOrderCommands.DOWN)}>
                  <Icon icon="chevron-up" />
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        {elements.length ? (
          <div className={cx("element-list")}>
            {elements.map(item => (
              item.type === 'group' ? (
                <div className={cx("group-els")} key={item.id}>
                  <div className={cx("group-title")}>{LL.editor.selectPanel.group()}</div>
                  {item.elements.map(groupItem => renderItem(groupItem, () => selectGroupEl(item, groupItem.id)))}
                </div>
              ) : renderItem(item, () => selectElement(item.id))
            ))}
          </div>
        ) : (
          <div className={cx("empty")}>{LL.editor.selectPanel.emptyPage()}</div>
        )}
      </div>
    </MoveablePanel>
  );
});
export default SelectPanel;
