import type { MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from 'react'

/**
 * Convert pointer events into slide-canvas coordinates.
 *
 * The slide `.viewport` is CSS-scaled (`transform: scale(canvasScale)`) and
 * left unsized so absolute children are not laid out twice. Pair `clientX/Y`
 * with the `.viewport-wrapper` rect (already in visual pixels) and divide by
 * canvasScale, times any ancestor CSS zoom (`rect.width / offsetWidth`).
 */

export type ReactPointerEvent = ReactMouseEvent | ReactTouchEvent

export type PointerLike = MouseEvent | TouchEvent | ReactPointerEvent | {
  clientX: number;
  clientY: number;
};

export function nativePointerEvent(e: ReactPointerEvent | MouseEvent | TouchEvent): MouseEvent | TouchEvent {
  if ('nativeEvent' in e) return e.nativeEvent
  return e
}
export function getPointerClient(e: PointerLike): {
  x: number;
  y: number;
} {
  if ('changedTouches' in e && e.changedTouches && e.changedTouches[0]) {
    return {
      x: e.changedTouches[0].clientX,
      y: e.changedTouches[0].clientY
    };
  }
  const point = e as {
    clientX: number;
    clientY: number;
  };
  return {
    x: point.clientX,
    y: point.clientY
  };
}
export function renderedScale(renderedSize: number, unscaledSize: number, fallback: number): number {
  if (!(unscaledSize > 0) || !(renderedSize > 0) || !Number.isFinite(renderedSize / unscaledSize)) {
    return fallback;
  }
  return renderedSize / unscaledSize;
}
export function clientToCanvasPoint(clientX: number, clientY: number, originX: number, originY: number, scale: number): {
  x: number;
  y: number;
} {
  return {
    x: (clientX - originX) / scale,
    y: (clientY - originY) / scale
  };
}
export function clientDeltaToCanvas(dx: number, dy: number, scale: number): {
  x: number;
  y: number;
} {
  return {
    x: dx / scale,
    y: dy / scale
  };
}
export function findSlideViewport(from?: EventTarget | null): HTMLElement | null {
  if (from instanceof Element) {
    const closest = from.closest('.viewport');
    if (closest instanceof HTMLElement) return closest;
    const wrapper = from.closest('.viewport-wrapper');
    if (wrapper instanceof HTMLElement) {
      const nested = wrapper.querySelector(':scope > .viewport');
      if (nested instanceof HTMLElement) return nested;
    }
  }
  const scoped = document.querySelector('.canvas .viewport, .mobile-editor .viewport, .content .viewport');
  return scoped instanceof HTMLElement ? scoped : null;
}

/**
 * The slide `.viewport` is intentionally unsized (absolute children + CSS
 * scale). Measuring it would be 0×0 and assigning it the unscaled slide size
 * double-applies zoom against `.viewport-wrapper`. Use the wrapper — already
 * sized to the *visual* slide — and multiply by the store canvas scale.
 */
export function getScaleRoot(viewport: HTMLElement | null): HTMLElement | null {
  if (!viewport) return null;
  const wrapper = viewport.closest('.viewport-wrapper');
  return wrapper instanceof HTMLElement ? wrapper : viewport;
}
export function getViewportRenderedScale(viewport: HTMLElement | null, fallbackScale: number): number {
  const root = getScaleRoot(viewport);
  if (!root) return fallbackScale;
  const ancestorZoom = renderedScale(root.getBoundingClientRect().width, root.offsetWidth, 1);
  return fallbackScale * ancestorZoom;
}
export function clientToCanvas(e: PointerLike, viewport: HTMLElement, fallbackScale: number): {
  x: number;
  y: number;
} {
  const {
    x,
    y
  } = getPointerClient(e);
  const root = getScaleRoot(viewport) ?? viewport;
  const rect = root.getBoundingClientRect();
  const scale = getViewportRenderedScale(viewport, fallbackScale);
  return clientToCanvasPoint(x, y, rect.left, rect.top, scale);
}

/** Wrapper-local visual pixels — same space as HitLayer / `elementVisualHitRect`. */
export function clientToWrapper(e: PointerLike, viewport: HTMLElement): {
  x: number;
  y: number;
} {
  const {
    x,
    y
  } = getPointerClient(e);
  const root = getScaleRoot(viewport) ?? viewport;
  const rect = root.getBoundingClientRect();
  return {
    x: x - rect.left,
    y: y - rect.top
  };
}
export function pointerDeltaToCanvas(start: {
  x: number;
  y: number;
}, current: PointerLike, viewport: HTMLElement | null, fallbackScale: number): {
  x: number;
  y: number;
} {
  const to = getPointerClient(current);
  return clientDeltaToCanvas(to.x - start.x, to.y - start.y, getViewportRenderedScale(viewport, fallbackScale));
}
