
import { useMainStore, useSlidesStore } from '@/store';
import { queryFika } from '@/utils/portal';
import { addCanvasZoom, clampCanvasZoom, displayedZoomPercent, getPendingZoom, occupancyForDisplayedZoom, occupancyForTargetZoom, setPendingZoom, stepCanvasZoom } from '@/utils/canvasZoom';

const currentZoom = () => getPendingZoom() ?? useMainStore.getState().canvasScale * 100

const applyDisplayedZoom = (targetZoom: number) => {
  const main = useMainStore.getState()
  const slides = useSlidesStore.getState()
  const clamped = clampCanvasZoom(targetZoom);
  setPendingZoom(clamped);
  const canvas = queryFika<HTMLElement>('.canvas');
  const next = canvas ? occupancyForTargetZoom(clamped, canvas.clientWidth, canvas.clientHeight, slides.viewportSize, slides.viewportRatio) : occupancyForDisplayedZoom(clamped, main.canvasScale, main.canvasPercentage);
  if (Number.isFinite(next)) main.setCanvasPercentage(next);
  void Promise.resolve().then(() => {
    const pending = getPendingZoom();
    if (pending != null && Math.abs(pending - useMainStore.getState().canvasScale * 100) < 0.51) {
      setPendingZoom(null);
    }
  });
};

/**
 * Step the displayed zoom (+/−) along the Chrome PDF preset ladder.
 */
export const scaleCanvas = (command: '+' | '-') => {
  setPendingZoom(null);
  const next = stepCanvasZoom(displayedZoomPercent(useMainStore.getState().canvasScale), command === '+' ? 1 : -1);
  applyDisplayedZoom(next);
};

export const applyCanvasZoomDelta = (deltaPercent: number) => {
  if (!deltaPercent) return;
  applyDisplayedZoom(addCanvasZoom(currentZoom(), deltaPercent));
};

/**
 * Set displayed zoom to an exact percent (toolbar presets: 50, 75, 100, … 200).
 */
export const setCanvasScalePercentage = (value: number) => {
  setPendingZoom(null);
  applyDisplayedZoom(value);
};

/**
 * Reset canvas zoom to the default fit percentage and re-center the viewport.
 *
 * Always toggle `canvasDragged` so the viewport watcher runs `initViewportPosition`.
 * Setting percentage alone only applies a relative size adjustment, and clearing an
 * already-false drag flag is a Zustand no-op — both of which left the fit button looking broken.
 */
export const resetCanvas = () => {
  const main = useMainStore.getState()
  setPendingZoom(null);
  main.setCanvasPercentage(90);
  if (main.canvasDragged) {
    main.setCanvasDragged(false);
  } else {
    main.setCanvasDragged(true);
    main.setCanvasDragged(false);
  }
};

export default () => {
  const canvasScale = useMainStore(s => s.canvasScale);
  const canvasScalePercentage = displayedZoomPercent(canvasScale) + '%';
  return {
    canvasScalePercentage,
    setCanvasScalePercentage,
    scaleCanvas,
    applyCanvasZoomDelta,
    resetCanvas
  };
};
