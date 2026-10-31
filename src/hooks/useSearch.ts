
import { useState, useEffect, useRef } from 'react'
import { useMainStore, useSlidesStore, selectHandleElement, selectCurrentSlide } from '@/store';
import type { PPTTableElement } from '@/types/slides';
import message from '@/utils/message';
import { queryFika } from '@/utils/portal';
import { getLL } from '@/i18n/getLL';
import { getSearchText, getSearchHtmlText } from '@/utils/searchText';
import { getHiddenTableCells } from '@/utils/tableHiddenCells';
import { isElementSelectable } from '@/utils/selection';
import useHistorySnapshot from './useHistorySnapshot';
interface SearchTextResult {
  elType: 'text' | 'shape';
  offset: number;
  slideId: string;
  elId: string;
}
interface SearchTableResult {
  elType: 'table';
  offset: number;
  slideId: string;
  elId: string;
  cellIndex: [number, number];
}
type SearchResult = SearchTextResult | SearchTableResult;
type Modifiers = 'g' | 'gi';
const sameTarget = (a: SearchResult, b: SearchResult) => (
  a.slideId === b.slideId && a.elId === b.elId
  && (a.elType !== 'table' || (b.elType === 'table' && a.cellIndex[0] === b.cellIndex[0] && a.cellIndex[1] === b.cellIndex[1]))
);
export default () => {
  const { addHistorySnapshot } = useHistorySnapshot();
  const handleElement = useMainStore(selectHandleElement);
  const readOnly = useMainStore(s => s.readOnly);
  const setActiveElementIdList = useMainStore(s => s.setActiveElementIdList);
  const slides = useSlidesStore(s => s.slides);
  const slideIndex = useSlidesStore(s => s.slideIndex);
  const currentSlide = useSlidesStore(selectCurrentSlide);
  const updateSlideIndex = useSlidesStore(s => s.updateSlideIndex);
  const updateElement = useSlidesStore(s => s.updateElement);
  const [searchWord, setSearchWord] = useState('');
  const [replaceWord, setReplaceWord] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchIndex, setSearchIndex] = useState(-1);
  const [modifiers, setModifiers] = useState<Modifiers>('g');
  const searchActiveRef = useRef(false);
  const searchRegex = (keyword: string) => new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), modifiers);
  const collectSearchResults = () => {
    const textList: SearchResult[] = [];
    const matchRegex = searchRegex(searchWord);
    for (const slide of useSlidesStore.getState().slides) {
      for (const el of slide.elements) {
        if (el.type === 'text') {
          const text = getSearchHtmlText(el.content);
          const rets = [...text.matchAll(matchRegex)];
          textList.push(...rets.map(match => ({
            offset: match.index,
            slideId: slide.id,
            elId: el.id,
            elType: el.type
          })));
        } else if (el.type === 'shape' && el.text && el.text.content) {
          const text = getSearchHtmlText(el.text.content);
          const rets = [...text.matchAll(matchRegex)];
          textList.push(...rets.map(match => ({
            offset: match.index,
            slideId: slide.id,
            elId: el.id,
            elType: el.type
          })));
        } else if (el.type === 'table') {
          const hidden = new Set(getHiddenTableCells(el.data));
          for (let i = 0; i < el.data.length; i++) {
            const row = el.data[i];
            for (let j = 0; j < row.length; j++) {
              const cell = row[j];
              if (!cell.text || hidden.has(`${i}_${j}`)) continue;
              const text = cell.text;
              const rets = [...text.matchAll(matchRegex)];
              textList.push(...rets.map<SearchTableResult>(match => ({
                offset: match.index,
                slideId: slide.id,
                elId: el.id,
                elType: el.type,
                cellIndex: [i, j]
              })));
            }
          }
        }
      }
    }
    return textList;
  };
  const search = () => {
    searchActiveRef.current = true;
    const textList = collectSearchResults();
    if (textList.length) {
      setSearchResults(textList);
      setSearchIndex(0);
    } else {
      message.warning(getLL().editor.search.noMatchesFound());
      clearMarks();
    }
  };
  type TextInfoList = ReturnType<typeof getSearchText>['textList'];
  const getMatchList = (content: string, keyword: string) => {
    if (!keyword) return [];
    const reg = searchRegex(keyword);
    const matchList = [];
    let match = reg.exec(content);
    while (match) {
      matchList.push(match);
      match = reg.exec(content);
    }
    return matchList;
  };
  const highlight = (textNodes: Text[], textList: TextInfoList, matchList: RegExpExecArray[], index: number) => {
    for (let i = matchList.length - 1; i >= 0; i--) {
      const match = matchList[i];
      const matchStart = match.index;
      const matchEnd = matchStart + match[0].length;
      for (let textIdx = 0; textIdx < textList.length; textIdx++) {
        const {
          text,
          startIdx,
          endIdx
        } = textList[textIdx];
        if (endIdx <= matchStart) continue;
        if (startIdx >= matchEnd) break;
        let textNode = textNodes[textIdx];
        const nodeMatchStartIdx = Math.max(0, matchStart - startIdx);
        const nodeMatchLength = Math.min(endIdx, matchEnd) - startIdx - nodeMatchStartIdx;
        if (nodeMatchStartIdx > 0) textNode = textNode.splitText(nodeMatchStartIdx);
        if (nodeMatchLength < textNode.data.length) textNode.splitText(nodeMatchLength);
        const mark = document.createElement('mark');
        mark.dataset.index = index + i + '';
        mark.innerText = text.substring(nodeMatchStartIdx, nodeMatchStartIdx + nodeMatchLength);
        textNode.parentNode!.replaceChild(mark, textNode);
      }
    }
  };
  const clearMarks = () => {
    CSS.highlights.delete('fika-search-results');
    CSS.highlights.delete('fika-search-active');
  };
  const highlightCurrentSlide = () => {
    const results = new Highlight();
    const active = new Highlight();
    active.priority = 1;
    for (let i = 0; i < searchResults.length; i++) {
      const target = searchResults[i];
      const previous = searchResults[i - 1];
      if (target.slideId !== currentSlide.id) continue;
      if (previous && sameTarget(previous, target)) continue;
      const root = queryFika(`#editable-element-${target.elId}`);
      const node = target.elType === 'table'
        ? root?.querySelector(`[data-cell-index="${target.cellIndex[0]}_${target.cellIndex[1]}"] .cell-text`)
        : root?.querySelector('.ProseMirror');
      if (!node) continue;
      const { textNodes: nodes, textList, content } = getSearchText(node);
      const matches = getMatchList(content, searchWord);
      matches.forEach((match, matchIndex) => {
        const end = match.index + match[0].length;
        const startNode = textList.findIndex(item => item.startIdx <= match.index && item.endIdx > match.index);
        const endNode = textList.findIndex(item => item.startIdx < end && item.endIdx >= end);
        if (startNode === -1 || endNode === -1) return;
        const range = document.createRange();
        range.setStart(nodes[startNode], match.index - textList[startNode].startIdx);
        range.setEnd(nodes[endNode], end - textList[endNode].startIdx);
        results.add(range);
        if (i + matchIndex === searchIndex) active.add(range);
      });
    }
    CSS.highlights.set('fika-search-results', results);
    CSS.highlights.set('fika-search-active', active);
  };
  const turnTarget = () => {
    const target = searchResults[searchIndex];
    if (!target) return;
    if (target.slideId !== currentSlide.id) {
      const index = slides.findIndex(slide => slide.id === target.slideId);
      if (index !== -1) updateSlideIndex(index);
    }
  };
  const searchNext = () => {
    if (!searchWord) return message.warning(getLL().editor.search.enterSearchTerm());
    setActiveElementIdList([]);
    if (searchIndex === -1) search();else if (searchIndex < searchResults.length - 1) setSearchIndex(searchIndex + (1));else setSearchIndex(0);
  };
  const searchPrev = () => {
    if (!searchWord) return message.warning(getLL().editor.search.enterSearchTerm());
    setActiveElementIdList([]);
    if (searchIndex === -1) search();else if (searchIndex > 0) setSearchIndex(searchIndex - (1));else setSearchIndex(searchResults.length - 1);
  };
  const replace = () => {
    if (!searchWord || useMainStore.getState().readOnly) return;
    if (searchIndex === -1) {
      searchNext();
      return;
    }
    const target = searchResults[searchIndex];
    if (!target) return;
    const slide = useSlidesStore.getState().slides.find(item => item.id === target.slideId);
    const element = slide?.elements.find(item => item.id === target.elId);
    if (!element || !slide || !isElementSelectable(element, slide.elements, [])) return;
    const localIndex = searchResults.slice(0, searchIndex).filter(result => sameTarget(result, target)).length;
    if (element.type === 'text') {
      updateElement({ id: element.id, slideId: target.slideId, props: {
        content: replaceHtmlMatches(element.content, localIndex)
      } });
    } else if (element.type === 'shape' && element.text) {
      updateElement({ id: element.id, slideId: target.slideId, props: {
        text: { ...element.text, content: replaceHtmlMatches(element.text.content, localIndex) }
      } });
    } else if (element.type === 'table' && target.elType === 'table') {
      const data = element.data.map((row, rowIndex) => row.map((cell, columnIndex) => (
        rowIndex === target.cellIndex[0] && columnIndex === target.cellIndex[1]
          ? { ...cell, text: replacePlainTextMatches(cell.text, localIndex) }
          : cell
      )));
      updateElement({ id: element.id, slideId: target.slideId, props: { data } });
    } else return;
    addHistorySnapshot();
    const results = collectSearchResults();
    setSearchResults(results);
    // Skip matches introduced by the replacement before moving to the next
    // occurrence. The result list must still describe the current document.
    const targetStart = searchResults.findIndex(result => sameTarget(result, target));
    const insertedEnd = target.offset + replaceWord.length;
    const precedingMatches = results.filter(result => sameTarget(result, target) && result.offset < insertedEnd).length;
    const nextIndex = targetStart + precedingMatches;
    setSearchIndex(results.length ? (nextIndex < results.length ? nextIndex : 0) : -1);
  };
  const replacePlainTextMatches = (text: string, selectedIndex?: number) => {
    const matches = getMatchList(text, searchWord);
    const selected = selectedIndex === undefined ? matches : matches.slice(selectedIndex, selectedIndex + 1);
    for (const match of selected.reverse()) {
      text = text.slice(0, match.index) + replaceWord + text.slice(match.index + match[0].length);
    }
    return text;
  };
  const replaceHtmlMatches = (html: string, selectedIndex?: number) => {
    const element = document.createElement('div');
    element.innerHTML = html;
    const { textNodes, textList, content } = getSearchText(element);
    const matches = getMatchList(content, searchWord);
    const selectedMatches = selectedIndex === undefined ? matches : matches.slice(selectedIndex, selectedIndex + 1);
    const matchList = selectedMatches.filter(match => match[0] !== replaceWord);
    if (!matchList.length) return html;
    highlight(textNodes, textList, matchList, 0);
    let lastMarkIndex = -1;
    for (const mark of element.querySelectorAll('mark[data-index]')) {
      const markIndex = +(mark as HTMLElement).dataset.index!;
      const parentNode = mark.parentNode!;
      if (markIndex === lastMarkIndex) parentNode.removeChild(mark);
      else {
        parentNode.replaceChild(document.createTextNode(replaceWord), mark);
        lastMarkIndex = markIndex;
      }
    }
    return element.innerHTML;
  };
  const replaceAll = () => {
    if (!searchWord || useMainStore.getState().readOnly) return;
    searchActiveRef.current = true;
    const results = collectSearchResults();
    const originalSlides = useSlidesStore.getState().slides;
    for (let i = 0; i < results.length; i++) {
      const lastTarget = results[i - 1];
      const target = results[i];
      if (lastTarget && lastTarget.slideId === target.slideId && lastTarget.elId === target.elId) continue;
      const targetSlide = originalSlides.find(item => item.id === target.slideId);
      if (!targetSlide) continue;
      const targetElement = targetSlide.elements.find(item => item.id === target.elId);
      if (!targetElement || !isElementSelectable(targetElement, targetSlide.elements, [])) continue;
      if (target.elType === 'table') {
        const table = targetElement as PPTTableElement;
        const hidden = new Set(getHiddenTableCells(table.data));
        const data = table.data.map((row, rowIndex) => {
          return row.map((cell, colIndex) => {
            if (!cell.text || hidden.has(`${rowIndex}_${colIndex}`)) return cell;
            return {
              ...cell,
              text: replacePlainTextMatches(cell.text)
            };
          });
        });
        const props = {
          data
        };
        updateElement({
          id: target.elId,
          slideId: target.slideId,
          props
        });
      } else {
        if (targetElement.type === 'text') {
          const props = {
            content: replaceHtmlMatches(targetElement.content)
          };
          updateElement({
            id: target.elId,
            slideId: target.slideId,
            props
          });
        } else if (target.elType === 'shape') {
          const el = targetElement;
          if (el && el.type === 'shape' && el.text) {
            const props = {
              text: {
                ...el.text,
                content: replaceHtmlMatches(el.text.content)
              }
            };
            updateElement({
              id: target.elId,
              slideId: target.slideId,
              props
            });
          }
        }
      }
    }
    if (useSlidesStore.getState().slides !== originalSlides) addHistorySnapshot();
    setSearchResults([]);
    setSearchIndex(-1);
  };
  const reset = () => {
    searchActiveRef.current = false;
    setSearchIndex(-1);
    setSearchResults([]);
    if (!searchWord) clearMarks();
  };
  useEffect(() => { reset() }, [searchWord]);
  useEffect(() => {
    if (!searchActiveRef.current || !searchWord) return;
    const results = collectSearchResults();
    if (JSON.stringify(results) === JSON.stringify(searchResults)) return;
    setSearchResults(results);
    setSearchIndex(index => results.length ? Math.max(0, Math.min(index, results.length - 1)) : -1);
  }, [slides]);
  useEffect(() => {
    const timer = setTimeout(() => {
      highlightCurrentSlide();
    }, 0);
    return () => clearTimeout(timer);
  }, [slideIndex, searchResults, searchIndex, slides]);
  useEffect(() => { turnTarget(); }, [searchResults, searchIndex]);
  useEffect(() => {
    if (handleElement) {
      searchActiveRef.current = false;
      setSearchIndex(-1);
      setSearchResults([]);
      clearMarks();
    }
  }, [handleElement]);
  useEffect(() => () => { clearMarks(); }, []);
  const toggleModifiers = () => {
    setModifiers(modifiers === 'g' ? 'gi' : 'g');
    reset();
  };
  const target = searchResults[searchIndex];
  const targetSlide = target ? slides.find(slide => slide.id === target.slideId) : undefined;
  const targetElement = targetSlide?.elements.find(element => element.id === target?.elId);
  const canReplace = !readOnly && (!targetElement || isElementSelectable(targetElement, targetSlide!.elements, []));
  return {
    canReplace,
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
  };
};
