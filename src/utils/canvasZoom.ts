/**
 * Canvas zoom is the *displayed* scale (canvasScale × 100), not the internal
 * occupancy percentage. Occupancy is derived so 200% means 200% of the slide
 * pixel size — independent of how large the editor pane is.
 */

export const MIN_CANVAS_ZOOM = 10;
export const MAX_CANVAS_ZOOM = 200;
export const CANVAS_ZOOM_STEP = 5;
/** Wheel pixels that correspond to one CANVAS_ZOOM_STEP. */
export const WHEEL_ZOOM_PX_PER_STEP = 40;

/**
 * Chrome PDF viewer / Chromium page-zoom ladder, clipped to 10–200%.
 * +/- jumps to the next (or previous) stop; values between stops snap directionally.
 */
export const CANVAS_ZOOM_PRESETS = [10, 25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200] as const;
export function displayedZoomPercent(canvasScale: number): number {
  if (!Number.isFinite(canvasScale)) return MIN_CANVAS_ZOOM;
  return Math.round(canvasScale * 100);
}
export function clampCanvasZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return MIN_CANVAS_ZOOM;
  return Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, zoom));
}

/**
 * Step displayed zoom like Chrome PDF: walk `CANVAS_ZOOM_PRESETS`.
 * Off-ladder values (wheel) snap to the next stop in that direction.
 */
export function stepCanvasZoom(current: number, direction: 1 | -1): number {
  const now = clampCanvasZoom(current);
  if (direction > 0) {
    for (const preset of CANVAS_ZOOM_PRESETS) {
      if (preset > now) return preset;
    }
    return MAX_CANVAS_ZOOM;
  }
  for (let i = CANVAS_ZOOM_PRESETS.length - 1; i >= 0; i--) {
    if (CANVAS_ZOOM_PRESETS[i] < now) return CANVAS_ZOOM_PRESETS[i];
  }
  return MIN_CANVAS_ZOOM;
}
export function addCanvasZoom(current: number, delta: number): number {
  return clampCanvasZoom(current + delta);
}
export function wheelDeltaToZoom(deltaPx: number): number {
  if (!Number.isFinite(deltaPx) || deltaPx === 0) return 0;
  return -deltaPx * (CANVAS_ZOOM_STEP / WHEEL_ZOOM_PX_PER_STEP);
}

/**
 * Occupancy % that realizes `targetZoom` displayed percent given the current
 * scale and occupancy. Fallback when the canvas element is not available.
 */
export function occupancyForDisplayedZoom(targetZoom: number, canvasScale: number, canvasPercentage: number): number {
  if (!(canvasScale > 0) || !Number.isFinite(canvasPercentage)) return canvasPercentage;
  return canvasPercentage * (clampCanvasZoom(targetZoom) / 100) / canvasScale;
}

/**
 * Occupancy % from pane + slide geometry so 200% is 200% of the slide pixel
 * size regardless of a stale canvasScale (rapid +/- and wheel).
 */
export function occupancyForTargetZoom(targetZoom: number, canvasWidth: number, canvasHeight: number, viewportSize: number, viewportRatio: number): number {
  const zoom = clampCanvasZoom(targetZoom) / 100;
  if (!(canvasWidth > 0) || !(canvasHeight > 0) || !(viewportSize > 0) || !(viewportRatio > 0)) {
    return 90;
  }
  if (canvasHeight / canvasWidth > viewportRatio) {
    return zoom * viewportSize / canvasWidth * 100;
  }
  return zoom * viewportSize * viewportRatio / canvasHeight * 100;
}

/** Shared across useScaleCanvas instances (toolbar, wheel, hotkeys). */
let pendingZoom: number | null = null;
export function getPendingZoom(): number | null {
  return pendingZoom;
}
export function setPendingZoom(zoom: number | null) {
  pendingZoom = zoom;
}
