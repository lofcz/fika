import type { PPTElement } from '@/types/slides';
import { frameAncestors } from './nestedFrames';

export const removeAllRanges = () => {
  const selection = window.getSelection();
  selection && selection.removeAllRanges();
};

/** Hidden or locked frames make their entire subtree unavailable for selection. */
export const isElementSelectable = (element: PPTElement, elements: readonly PPTElement[], hiddenIds: readonly string[]) => (
  !element.lock && !hiddenIds.includes(element.id)
  && !frameAncestors(element, elements).some(parent => parent.lock || hiddenIds.includes(parent.id))
);
