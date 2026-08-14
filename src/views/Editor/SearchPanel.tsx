import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './SearchPanel.module.scss'
const cx = bindStyles(styles)
import { useRef, useCallback, memo, useState, useEffect, type ElementRef } from 'react';

import { useMainStore } from '@/store';
import useSearch from '@/hooks/useSearch';
import { useI18nContext } from '@/i18n/useI18nContext';
import MoveablePanel from '@/components/MoveablePanel';
import Tabs from '@/components/Tabs';
import Divider from '@/components/Divider';
import Input from '@/components/Input';
import Button from '@/components/Button';
type TypeKey = 'search' | 'replace';
interface TabItem {
  key: TypeKey;
  label: string;
}
const SearchPanel = memo(() => {
  const {
    LL
  } = useI18nContext();
  const mainStore = useMainStore();
  const {
    searchWord,
    setSearchWord,
    replaceWord,
    setReplaceWord,
    searchResults,
    searchIndex,
    modifiers,
    searchNext,
    searchPrev,
    replace,
    replaceAll,
    toggleModifiers
  } = useSearch();
  const [type, setType] = useState<TypeKey>('search');
  const tabs = [{
    key: 'search',
    label: LL.editor.search.tabFind()
  }, {
    key: 'replace',
    label: LL.editor.search.tabReplace()
  }];
  const close = useCallback(() => {
    mainStore.setSearchPanelState(false);
  }, [mainStore]);
  const searchInpRef = useRef<ElementRef<typeof Input> | null>(null);
  useEffect(() => {
    searchInpRef.current!.focus();
  }, []);
  useEffect(() => {
    Promise.resolve().then(() => {
      searchInpRef.current!.focus();
    });
  }, [type]);
  return <><MoveablePanel className={cx("search-panel")} width={330} height={0} left={-270} top={90}><div className={cx("search-header")}><Tabs className={cx("search-tabs")} tabs={tabs} value={type} onUpdateValue={(value: any) => {
          setType(value);
        }} /><button type='button' className={cx("close-btn")} onMouseDown={(event) => { event.stopPropagation() }} onClick={() => {
          close();
        }}><Icon icon="x" /></button></div><div className={cx('search-body', type)} onMouseDown={(event) => { event.stopPropagation() }}><Input className={cx("input")} value={searchWord} onUpdateValue={(value: any) => {
          setSearchWord(value);
        }} placeholder={LL.editor.search.enterSearchQuery()} onEnter={() => {
          searchNext();
        }} ref={searchInpRef} suffix={<><span className={cx("count")}>{searchIndex + 1}/{searchResults.length}</span><Divider type='vertical' margin={4} /><button type='button' className={cx('icon-btn', {
            'active': modifiers === 'g'
          })} data-tooltip={LL.editor.search.ignoreCase()} onMouseDown={(event) => { event.preventDefault() }} onClick={() => {
            toggleModifiers();
          }}>Aa</button><Divider type='vertical' margin={4} /><button type='button' className={cx("icon-btn")} onMouseDown={(event) => { event.preventDefault() }} onClick={() => {
            searchPrev();
          }} data-tooltip={LL.editor.search.previous()}><Icon icon="chevron-left" /></button><button type='button' className={cx("icon-btn")} onMouseDown={(event) => { event.preventDefault() }} onClick={() => {
            searchNext();
          }} data-tooltip={LL.editor.search.next()}><Icon icon="chevron-right" /></button></>} />{type === 'replace' ? <Input className={cx("input")} value={replaceWord} onUpdateValue={(value: any) => {
          setReplaceWord(value);
        }} placeholder={LL.editor.search.enterReplaceText()} onEnter={() => {
          replace();
        }} /> : null}{type === 'replace' ? <div className={cx("footer")}><Button disabled={!searchWord} onClick={() => {
            replace();
          }}>{LL.editor.search.replace()}</Button><Button disabled={!searchWord} type='primary' onClick={() => {
            replaceAll();
          }}>{LL.editor.search.replaceAll()}</Button></div> : null}</div></MoveablePanel></>;
});
export default SearchPanel;
