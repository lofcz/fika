
import { useState, useEffect, createElement } from 'react'
import { useMainStore, useSlidesStore, selectHandleElement, selectCurrentSlide } from '@/store';
import type { PPTTableElement } from '@/types/slides';
import message from '@/utils/message';
import { queryFika, queryFikaAll } from '@/utils/portal';
import { getLL } from '@/i18n/getLL';
interface SearchTextResult {
  elType: 'text' | 'shape';
  slideId: string;
  elId: string;
}
interface SearchTableResult {
  elType: 'table';
  slideId: string;
  elId: string;
  cellIndex: [number, number];
}
type SearchResult = SearchTextResult | SearchTableResult;
type Modifiers = 'g' | 'gi';
export default () => {
  const handleElement = useMainStore(selectHandleElement);
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
  const search = () => {
    const textList: SearchResult[] = [];
    const matchRegex = new RegExp(searchWord, modifiers);
    const textRegex = /(<([^>]+)>)/g;
    for (const slide of slides) {
      for (const el of slide.elements) {
        if (el.type === 'text') {
          const text = el.content.replace(textRegex, '');
          const rets = text.match(matchRegex);
          rets && textList.push(...new Array(rets.length).fill({
            slideId: slide.id,
            elId: el.id,
            elType: el.type
          }));
        } else if (el.type === 'shape' && el.text && el.text.content) {
          const text = el.text.content.replace(textRegex, '');
          const rets = text.match(matchRegex);
          rets && textList.push(...new Array(rets.length).fill({
            slideId: slide.id,
            elId: el.id,
            elType: el.type
          }));
        } else if (el.type === 'table') {
          for (let i = 0; i < el.data.length; i++) {
            const row = el.data[i];
            for (let j = 0; j < row.length; j++) {
              const cell = row[j];
              if (!cell.text) continue;
              const text = cell.text.replace(textRegex, '');
              const rets = text.match(matchRegex);
              rets && textList.push(...new Array(rets.length).fill({
                slideId: slide.id,
                elId: el.id,
                elType: el.type,
                cellIndex: [i, j]
              }));
            }
          }
        }
      }
    }
    if (textList.length) {
      setSearchResults(textList);
      setSearchIndex(0);
      highlightCurrentSlide();
    } else {
      message.warning(getLL().editor.search.noMatchesFound());
      clearMarks();
    }
  };
  const getTextNodeList = (dom: Node): Text[] => {
    const nodeList = [...dom.childNodes];
    const textNodes = [];
    while (nodeList.length) {
      const node = nodeList.shift()!;
      if (node.nodeType === node.TEXT_NODE) {
        (node as Text).wholeText && textNodes.push(node as Text);
      } else {
        nodeList.unshift(...node.childNodes);
      }
    }
    return textNodes;
  };
  const getTextInfoList = (textNodes: Text[]) => {
    let length = 0;
    const textList = textNodes.map(node => {
      const startIdx = length,
        endIdx = length + node.wholeText.length;
      length = endIdx;
      return {
        text: node.wholeText,
        startIdx,
        endIdx
      };
    });
    return textList;
  };
  type TextInfoList = ReturnType<typeof getTextInfoList>;
  const getMatchList = (content: string, keyword: string) => {
    const reg = new RegExp(keyword, modifiers);
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
        if (endIdx < matchStart) continue;
        if (startIdx >= matchEnd) break;
        let textNode = textNodes[textIdx];
        const nodeMatchStartIdx = Math.max(0, matchStart - startIdx);
        const nodeMatchLength = Math.min(endIdx, matchEnd) - startIdx - nodeMatchStartIdx;
        if (nodeMatchStartIdx > 0) textNode = textNode.splitText(nodeMatchStartIdx);
        if (nodeMatchLength < textNode.wholeText.length) textNode.splitText(nodeMatchLength);
        const mark = document.createElement('mark');
        mark.dataset.index = index + i + '';
        mark.innerText = text.substring(nodeMatchStartIdx, nodeMatchStartIdx + nodeMatchLength);
        textNode.parentNode!.replaceChild(mark, textNode);
      }
    }
  };
  const highlightTableText = (nodes: NodeListOf<Element>, index: number) => {
    for (const node of nodes) {
      node.innerHTML = node.innerHTML.replace(new RegExp(searchWord, modifiers), () => {
        return `<mark data-index=${index++}>${searchWord}</mark>`;
      });
    }
  };
  const clearMarks = () => {
    const markNodes = queryFikaAll('.editable-element mark');
    for (const mark of markNodes) {
      setTimeout(() => {
        const parentNode = mark.parentNode!;
        const text = mark.textContent!;
        parentNode.replaceChild(document.createTextNode(text), mark);
      }, 0);
    }
  };
  const highlightCurrentSlide = () => {
    clearMarks();
    setTimeout(() => {
      for (let i = 0; i < searchResults.length; i++) {
        const lastTarget = searchResults[i - 1];
        const target = searchResults[i];
        if (target.slideId !== currentSlide.id) continue;
        if (lastTarget && lastTarget.elId === target.elId) continue;
        const node = queryFika(`#editable-element-${target.elId}`);
        if (node) {
          if (target.elType === 'table') {
            const cells = node.querySelectorAll('.cell-text');
            highlightTableText(cells, i);
          } else {
            const textNodes = getTextNodeList(node);
            const textList = getTextInfoList(textNodes);
            const content = textList.map(({
              text
            }) => text).join('');
            const matchList = getMatchList(content, searchWord);
            highlight(textNodes, textList, matchList, i);
          }
        }
      }
    }, 0);
  };
  const setActiveMark = () => {
    const markNodes = queryFikaAll('mark[data-index]');
    for (const node of markNodes) {
      setTimeout(() => {
        const index = (node as HTMLElement).dataset.index;
        if (index !== undefined && +index === searchIndex) {
          node.classList.add('active');
        } else node.classList.remove('active');
      }, 0);
    }
  };
  const turnTarget = () => {
    if (searchIndex === -1) return;
    const target = searchResults[searchIndex];
    if (target.slideId === currentSlide.id) setTimeout(setActiveMark, 0);else {
      const index = slides.findIndex(slide => slide.id === target.slideId);
      if (index !== -1) updateSlideIndex(index);
    }
  };
  const searchNext = () => {
    if (!searchWord) return message.warning(getLL().editor.search.enterSearchTerm());
    setActiveElementIdList([]);
    if (searchIndex === -1) search();else if (searchIndex < searchResults.length - 1) setSearchIndex(searchIndex + (1));else setSearchIndex(0);
    turnTarget();
  };
  const searchPrev = () => {
    if (!searchWord) return message.warning(getLL().editor.search.enterSearchTerm());
    setActiveElementIdList([]);
    if (searchIndex === -1) search();else if (searchIndex > 0) setSearchIndex(searchIndex - (1));else setSearchIndex(searchResults.length - 1);
    turnTarget();
  };
  const replace = () => {
    if (!searchWord) return;
    if (searchIndex === -1) {
      searchNext();
      return;
    }
    const target = searchResults[searchIndex];
    let targetElement = null;
    if (target.elType === 'table') {
      const [i, j] = target.cellIndex;
      targetElement = queryFika(`#editable-element-${target.elId} .cell[data-cell-index="${i}_${j}"] .cell-text`);
    } else targetElement = queryFika(`#editable-element-${target.elId} .ProseMirror`);
    if (!targetElement) return;
    const fakeElement = document.createElement('div');
    fakeElement.innerHTML = targetElement.innerHTML;
    let replaced = false;
    const marks = fakeElement.querySelectorAll('mark[data-index]');
    for (const mark of marks) {
      const parentNode = mark.parentNode!;
      if (mark.classList.contains('active')) {
        if (replaced) parentNode.removeChild(mark);else {
          parentNode.replaceChild(document.createTextNode(replaceWord), mark);
          replaced = true;
        }
      } else {
        const text = mark.textContent!;
        parentNode.replaceChild(document.createTextNode(text), mark);
      }
    }
    if (target.elType === 'text') {
      const props = {
        content: fakeElement.innerHTML
      };
      updateElement({
        id: target.elId,
        props
      });
    } else if (target.elType === 'shape') {
      const el = currentSlide.elements.find(item => item.id === target.elId);
      if (el && el.type === 'shape' && el.text) {
        const props = {
          text: {
            ...el.text,
            content: fakeElement.innerHTML
          }
        };
        updateElement({
          id: target.elId,
          props
        });
      }
    } else if (target.elType === 'table') {
      const el = currentSlide.elements.find(item => item.id === target.elId);
      if (el && el.type === 'table') {
        const data = el.data.map((row, i) => {
          if (i === target.cellIndex[0]) {
            return row.map((cell, j) => {
              if (j === target.cellIndex[1]) {
                return {
                  ...cell,
                  text: fakeElement.innerHTML
                };
              }
              return cell;
            });
          }
          return row;
        });
        const props = {
          data
        };
        updateElement({
          id: target.elId,
          props
        });
      }
    }
    searchResults.splice(searchIndex, 1);
    if (searchResults.length) {
      if (searchIndex > searchResults.length - 1) {
        setSearchIndex(0);
      }
      Promise.resolve().then(() => {
        highlightCurrentSlide();
        turnTarget();
      });
    } else setSearchIndex(-1);
  };
  const replaceAll = () => {
    if (!searchWord) return;
    if (searchIndex === -1) {
      searchNext();
      return;
    }
    for (let i = 0; i < searchResults.length; i++) {
      const lastTarget = searchResults[i - 1];
      const target = searchResults[i];
      if (lastTarget && lastTarget.elId === target.elId) continue;
      const targetSlide = slides.find(item => item.id === target.slideId);
      if (!targetSlide) continue;
      const targetElement = targetSlide.elements.find(item => item.id === target.elId);
      if (!targetElement) continue;
      const fakeElement = document.createElement('div');
      if (targetElement.type === 'text') fakeElement.innerHTML = targetElement.content;else if (targetElement.type === 'shape') fakeElement.innerHTML = targetElement.text?.content || '';
      if (target.elType === 'table') {
        const data = (targetElement as PPTTableElement).data.map(row => {
          return row.map(cell => {
            if (!cell.text) return cell;
            return {
              ...cell,
              text: cell.text.replace(new RegExp(searchWord, 'g'), replaceWord)
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
        const textNodes = getTextNodeList(fakeElement);
        const textList = getTextInfoList(textNodes);
        const content = textList.map(({
          text
        }) => text).join('');
        const matchList = getMatchList(content, searchWord);
        highlight(textNodes, textList, matchList, i);
        const marks = fakeElement.querySelectorAll('mark[data-index]');
        let lastMarkIndex = -1;
        for (const mark of marks) {
          const markIndex = +(mark as HTMLElement).dataset.index!;
          const parentNode = mark.parentNode!;
          if (markIndex === lastMarkIndex) parentNode.removeChild(mark);else {
            parentNode.replaceChild(document.createTextNode(replaceWord), mark);
            lastMarkIndex = markIndex;
          }
        }
        if (target.elType === 'text') {
          const props = {
            content: fakeElement.innerHTML
          };
          updateElement({
            id: target.elId,
            slideId: target.slideId,
            props
          });
        } else if (target.elType === 'shape') {
          const el = currentSlide.elements.find(item => item.id === target.elId);
          if (el && el.type === 'shape' && el.text) {
            const props = {
              text: {
                ...el.text,
                content: fakeElement.innerHTML
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
    setSearchResults([]);
    setSearchIndex(-1);
  };
  const reset = () => {
    setSearchIndex(-1);
    setSearchResults([]);
    if (!searchWord) clearMarks();
  };
  useEffect(() => { reset() }, [searchWord]);
  useEffect(() => {
    Promise.resolve().then(() => {
      highlightCurrentSlide();
      setTimeout(setActiveMark, 0);
    });
  }, [slideIndex]);
  useEffect(() => {
    if (handleElement) {
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
  return {
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
