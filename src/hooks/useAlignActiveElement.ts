import { useMainStore, useSlidesStore, selectActiveElementList, selectCurrentSlide } from '@/store';
import type { PPTElement } from '@/types/slides';
import { ElementAlignCommands } from '@/types/edit';
import { getElementListRange, getRectRotatedOffset } from '@/utils/element';
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
            if ('rotate' in element && element.rotate) {
              const {
                offsetX
              } = getRectRotatedOffset({
                left: element.left,
                top: element.top,
                width: element.width,
                height: element.height,
                rotate: element.rotate
              });
              element.left = minX - offsetX;
            } else element.left = minX;
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
            const elWidth = element.type === 'line' ? Math.max(element.start[0], element.end[0]) : element.width;
            if ('rotate' in element && element.rotate) {
              const {
                offsetX
              } = getRectRotatedOffset({
                left: element.left,
                top: element.top,
                width: element.width,
                height: element.height,
                rotate: element.rotate
              });
              element.left = maxX - elWidth + offsetX;
            } else element.left = maxX - elWidth;
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
            if ('rotate' in element && element.rotate) {
              const {
                offsetY
              } = getRectRotatedOffset({
                left: element.left,
                top: element.top,
                width: element.width,
                height: element.height,
                rotate: element.rotate
              });
              element.top = minY - offsetY;
            } else element.top = minY;
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
            const elHeight = element.type === 'line' ? Math.max(element.start[1], element.end[1]) : element.height;
            if ('rotate' in element && element.rotate) {
              const {
                offsetY
              } = getRectRotatedOffset({
                left: element.left,
                top: element.top,
                width: element.width,
                height: element.height,
                rotate: element.rotate
              });
              element.top = maxY - elHeight + offsetY;
            } else element.top = maxY - elHeight;
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
            const elWidth = element.type === 'line' ? Math.max(element.start[0], element.end[0]) : element.width;
            element.left = horizontalCenter - elWidth / 2;
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
            const elHeight = element.type === 'line' ? Math.max(element.start[1], element.end[1]) : element.height;
            element.top = verticalCenter - elHeight / 2;
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
