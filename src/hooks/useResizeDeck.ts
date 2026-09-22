import { useSlidesStore } from '@/store';
import useHistorySnapshot from '@/hooks/useHistorySnapshot';
import { resizeDeckSlides } from '@/utils/resizeDeck';

export default function useResizeDeck() {
  const { addHistorySnapshot } = useHistorySnapshot();
  return (width: number, height: number) => {
    const state = useSlidesStore.getState();
    if (width === state.viewportSize && height === state.viewportSize * state.viewportRatio) return;
    const slides = resizeDeckSlides(state.slides, { width: state.viewportSize, height: state.viewportSize * state.viewportRatio }, { width, height });
    state.setSlides(slides);
    state.setViewportSize(width);
    state.setViewportRatio(height / width);
    addHistorySnapshot();
  };
}
