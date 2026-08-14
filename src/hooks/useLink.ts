import { useSlidesStore } from '@/store';
import type { PPTElement, PPTElementLink } from '@/types/slides';
import useHistorySnapshot from '@/hooks/useHistorySnapshot';
import message from '@/utils/message';
import { getLL } from '@/i18n/getLL';
export default () => {
  const updateElement = useSlidesStore(s => s.updateElement);
  const removeElementProps = useSlidesStore(s => s.removeElementProps);
  const {
    addHistorySnapshot
  } = useHistorySnapshot();
  const setLink = (handleElement: PPTElement, link: PPTElementLink) => {
    const linkRegExp = /^(https?):\/\/[\w\-]+(\.[\w\-]+)+([\w\-.,@?^=%&:\/~+#]*[\w\-@?^=%&\/~+#])?$/;
    if (link.type === 'web' && !linkRegExp.test(link.target)) {
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
