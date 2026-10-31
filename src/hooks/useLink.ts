import { useMainStore, useSlidesStore, selectCurrentSlide } from '@/store';
import { isElementSelectable } from '@/utils/selection';
import { isSafeHyperlinkHref } from '@/utils/hyperlinkFollow';
import type { PPTElement, PPTElementLink } from '@/types/slides';
import useHistorySnapshot from '@/hooks/useHistorySnapshot';
import message from '@/utils/message';
import { getLL } from '@/i18n/getLL';
export const canEditElementLink = (element: PPTElement) => {
  if (useMainStore.getState().readOnly) return false;
  const slide = selectCurrentSlide(useSlidesStore.getState());
  const current = slide?.elements.find(item => item.id === element.id);
  return !!current && isElementSelectable(current, slide.elements, []);
};
export default () => {
  const updateElement = useSlidesStore(s => s.updateElement);
  const removeElementProps = useSlidesStore(s => s.removeElementProps);
  const {
    addHistorySnapshot
  } = useHistorySnapshot();
  const setLink = (handleElement: PPTElement, link: PPTElementLink) => {
    if (!canEditElementLink(handleElement)) return false;
    if (link.type === 'web' && !isSafeHyperlinkHref(link.target)) {
      message.error(getLL().canvas.link.invalidWebUrl());
      return false;
    }
    if (link.type === 'slide' && !link.target) {
      message.error(getLL().canvas.link.selectTargetFirst());
      return false;
    }
    const props = {
      link
    };
    updateElement({
      id: handleElement.id,
      props
    });
    addHistorySnapshot();
    return true;
  };
  const removeLink = (handleElement: PPTElement) => {
    removeElementProps({
      id: handleElement.id,
      propName: 'link'
    });
    addHistorySnapshot();
  };
  return {
    setLink,
    removeLink
  };
};
