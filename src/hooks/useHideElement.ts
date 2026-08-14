import { useSlidesStore, useMainStore, selectCurrentSlide } from '@/store';
export default () => {
  const currentSlide = useSlidesStore(selectCurrentSlide);
  const activeElementIdList = useMainStore(s => s.activeElementIdList);
  const hiddenElementIdList = useMainStore(s => s.hiddenElementIdList);
  const setHiddenElementIdList = useMainStore(s => s.setHiddenElementIdList);
  const setActiveElementIdList = useMainStore(s => s.setActiveElementIdList);
  const toggleHideElement = (id: string) => {
    if (hiddenElementIdList.includes(id)) {
      setHiddenElementIdList(hiddenElementIdList.filter(item => item !== id));
    } else setHiddenElementIdList([...hiddenElementIdList, id]);
    if (activeElementIdList.includes(id)) setActiveElementIdList([]);
  };
  const showAllElements = () => {
    const currentSlideElIdList = currentSlide.elements.map(item => item.id);
    const needHiddenElementIdList = hiddenElementIdList.filter(item => !currentSlideElIdList.includes(item));
    setHiddenElementIdList(needHiddenElementIdList);
  };
  const hideAllElements = () => {
    const currentSlideElIdList = currentSlide.elements.map(item => item.id);
    setHiddenElementIdList([...hiddenElementIdList, ...currentSlideElIdList]);
    if (activeElementIdList.length) setActiveElementIdList([]);
  };
  return {
    toggleHideElement,
    showAllElements,
    hideAllElements
  };
};
