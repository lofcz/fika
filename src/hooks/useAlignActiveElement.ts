import { useMainStore, useSlidesStore, selectActiveElementList, selectCurrentSlide } from '@/store';
import type { PPTElement } from '@/types/slides';
import { ElementAlignCommands } from '@/types/edit';
import { alignElementToRange, getElementListRange } from '@/utils/element';
import useHistorySnapshot from './useHistorySnapshot';
interface RangeMap {
  [id: string]: ReturnType<typeof getElementListRange>;
}
export default () => {
  const {
    addHistorySnapshot
  } = useHistorySnapshot();

  /**
   * Align selected elements to each other.
   */
  const alignActiveElement = (command: ElementAlignCommands) => {
    const { activeElementIdList } = useMainStore.getState();
    const activeElementList = selectActiveElementList(useMainStore.getState());
    const currentSlide = selectCurrentSlide(useSlidesStore.getState());
    if (!currentSlide) return;
    const {
      minX,
      maxX,
      minY,
      maxY
    } = getElementListRange(activeElementList);
    const elementList: PPTElement[] = JSON.parse(JSON.stringify(currentSlide.elements));

    const groupElementRangeMap: RangeMap = {};
    for (const activeElement of activeElementList) {
      if (activeElement.groupId && !groupElementRangeMap[activeElement.groupId]) {
        const groupElements = activeElementList.filter(item => item.groupId === activeElement.groupId);
        groupElementRangeMap[activeElement.groupId] = getElementListRange(groupElements);
      }
    }

    if (command === ElementAlignCommands.LEFT) {
      elementList.forEach(element => {
        if (activeElementIdList.includes(element.id)) {
          if (!element.groupId) {
            alignElementToRange(element, { minX });
          } else {
            const range = groupElementRangeMap[element.groupId];
            const offset = range.minX - minX;
            element.left = element.left - offset;
          }
        }
      });
    } else if (command === ElementAlignCommands.RIGHT) {
      elementList.forEach(element => {
        if (activeElementIdList.includes(element.id)) {
          if (!element.groupId) {
            alignElementToRange(element, { maxX });
          } else {
            const range = groupElementRangeMap[element.groupId];
            const offset = range.maxX - maxX;
            element.left = element.left - offset;
          }
        }
      });
    } else if (command === ElementAlignCommands.TOP) {
      elementList.forEach(element => {
        if (activeElementIdList.includes(element.id)) {
          if (!element.groupId) {
            alignElementToRange(element, { minY });
          } else {
            const range = groupElementRangeMap[element.groupId];
            const offset = range.minY - minY;
            element.top = element.top - offset;
          }
        }
      });
    } else if (command === ElementAlignCommands.BOTTOM) {
      elementList.forEach(element => {
        if (activeElementIdList.includes(element.id)) {
          if (!element.groupId) {
            alignElementToRange(element, { maxY });
          } else {
            const range = groupElementRangeMap[element.groupId];
            const offset = range.maxY - maxY;
            element.top = element.top - offset;
          }
        }
      });
    } else if (command === ElementAlignCommands.HORIZONTAL) {
      const horizontalCenter = (minX + maxX) / 2;
      elementList.forEach(element => {
        if (activeElementIdList.includes(element.id)) {
          if (!element.groupId) {
            alignElementToRange(element, { centerX: horizontalCenter });
          } else {
            const range = groupElementRangeMap[element.groupId];
            const center = (range.maxX + range.minX) / 2;
            const offset = center - horizontalCenter;
            element.left = element.left - offset;
          }
        }
      });
    } else if (command === ElementAlignCommands.VERTICAL) {
      const verticalCenter = (minY + maxY) / 2;
      elementList.forEach(element => {
        if (activeElementIdList.includes(element.id)) {
          if (!element.groupId) {
            alignElementToRange(element, { centerY: verticalCenter });
          } else {
            const range = groupElementRangeMap[element.groupId];
            const center = (range.maxY + range.minY) / 2;
            const offset = center - verticalCenter;
            element.top = element.top - offset;
          }
        }
      });
    }
    useSlidesStore.getState().updateSlide({
      elements: elementList
    });
    addHistorySnapshot();
  };
  return {
    alignActiveElement
  };
};
