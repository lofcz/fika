import { useScreenStore, useSlidesStore } from '@/store';
import { enterFullscreen, exitFullscreen, isFullscreen } from '@/utils/fullscreen';
export default () => {

  const enterScreening = () => {
    enterFullscreen();
    useScreenStore.getState().setScreening(true);
  };

  const enterScreeningFromStart = () => {
    useSlidesStore.getState().updateSlideIndex(0);
    enterScreening();
  };

  const exitScreening = () => {
    useScreenStore.getState().setScreening(false);
    if (isFullscreen()) exitFullscreen();
  };
  return {
    enterScreening,
    enterScreeningFromStart,
    exitScreening
  };
};
