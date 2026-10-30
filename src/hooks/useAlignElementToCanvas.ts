import { useMainStore, useSlidesStore, selectCurrentSlide } from '@/store';
import type { PPTElement } from '@/types/slides';
import { ElementAlignCommands } from '@/types/edit';
import { getElementListRange } from '@/utils/element';
import useHistorySnapshot from './useHistorySnapshot';
export default () => {
  const {
    addHistorySnapshot
  } = useHistorySnapshot();

  /**
   * Align selected elements to the canvas.
   */
  const alignElementToCanvas = (command: ElementAlignCommands) => {
    const main = useMainStore.getState();
    const activeElementIdList = main.activeGroupElementId ? [main.activeGroupElementId] : main.activeElementIdList;
    const slides = useSlidesStore.getState();
    const currentSlide = selectCurrentSlide(slides);
    if (!currentSlide) return;
    const activeElementList = currentSlide.elements.filter(element => activeElementIdList.includes(element.id));
    if (!activeElementList.length) return;
    const viewportWidth = slides.viewportSize;
    const viewportHeight = slides.viewportSize * slides.viewportRatio;
    const {
      minX,
      maxX,
      minY,
      maxY
    } = getElementListRange(activeElementList);
    const newElementList: PPTElement[] = JSON.parse(JSON.stringify(currentSlide.elements));
    for (const element of newElementList) {
      if (!activeElementIdList.includes(element.id)) continue;

      if (command === ElementAlignCommands.CENTER) {
        const offsetY = minY + (maxY - minY) / 2 - viewportHeight / 2;
        const offsetX = minX + (maxX - minX) / 2 - viewportWidth / 2;
        element.top = element.top - offsetY;
        element.left = element.left - offsetX;
      }

      if (command === ElementAlignCommands.TOP) {
        const offsetY = minY - 0;
        element.top = element.top - offsetY;
      }

      else if (command === ElementAlignCommands.VERTICAL) {
        const offsetY = minY + (maxY - minY) / 2 - viewportHeight / 2;
        element.top = element.top - offsetY;
      }

      else if (command === ElementAlignCommands.BOTTOM) {
        const offsetY = maxY - viewportHeight;
        element.top = element.top - offsetY;
      }

      else if (command === ElementAlignCommands.LEFT) {
        const offsetX = minX - 0;
        element.left = element.left - offsetX;
      }

      else if (command === ElementAlignCommands.HORIZONTAL) {
        const offsetX = minX + (maxX - minX) / 2 - viewportWidth / 2;
        element.left = element.left - offsetX;
      }

      else if (command === ElementAlignCommands.RIGHT) {
        const offsetX = maxX - viewportWidth;
        element.left = element.left - offsetX;
      }
    }
    useSlidesStore.getState().updateSlide({
      elements: newElementList
    });
    addHistorySnapshot();
  };
  return {
    alignElementToCanvas
  };
};
