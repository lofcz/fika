import { createCanvasPaint, boundsFromPoints } from '@/configs/inkPaint';
import type { Gradient } from '@/types/slides';
import { getStroke } from 'perfect-freehand';

/**
 * Excalidraw's variable-width freedraw tuning (packages/element/src/shape.ts).
 * Coordinates and size are CSS pixels.
 */
const EXCALIDRAW_FREEDRAW = {
  thinning: 0.6,
  smoothing: 0.5,
  streamline: 0.5,
  easing: (t: number) => Math.sin(t * Math.PI / 2)
} as const;
const MIN_POINT_DISTANCE_SQ = 0.5 * 0.5;
const MIN_PRESSURE_DELTA = 0.02;
export const DEFAULT_FREEHAND_SIZE = 6;
export type FreehandPoint = {
  x: number;
  y: number;
  pressure?: number;
};
export type FreehandCapOptions = {
  cap?: boolean;
  taper?: number | boolean;
};
export type FreehandStrokeOptions = {
  last?: boolean;
  thinning?: number;
  simulatePressure?: boolean;
  streamline?: number;
  smoothing?: number;
  start?: FreehandCapOptions;
  end?: FreehandCapOptions;
};
export const shouldKeepFreehandPoint = (from: FreehandPoint, to: FreehandPoint, simulatePressure = true) => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx * dx + dy * dy >= MIN_POINT_DISTANCE_SQ) return true;
  if (simulatePressure) return false;
  return Math.abs((to.pressure ?? 0.5) - (from.pressure ?? 0.5)) >= MIN_PRESSURE_DELTA;
};

/**
 * Keep raw pointer spacing. Evenly interpolating jumps flattens velocity, which
 * is what perfect-freehand uses to simulate pressure.
 */
export const appendFreehandPoint = (points: FreehandPoint[], next: FreehandPoint, simulatePressure = true) => {
  const last = points[points.length - 1];
  if (!last) {
    points.push(next);
    return;
  }
  if (!shouldKeepFreehandPoint(last, next, simulatePressure)) return;
  points.push(next);
};
export const shouldSimulatePressure = (e: PointerEvent) => {
  if (e.pointerType === 'pen') return e.pressure === 0.5;
  return true;
};
export const readPointerPressure = (e: PointerEvent) => {
  if (typeof e.pressure === 'number' && e.pressure >= 0) return e.pressure;
  return 0.5;
};
export const pointerStrokeSamples = (e: PointerEvent) => {
  const samples = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
  return samples.length ? samples : [e];
};
const med = (a: number[], b: number[]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const fmt = (point: number[]) => `${point[0]} ${point[1]}`;

/**
 * Excalidraw's outline → SVG path: quadratic midpoints, then close.
 * See getSvgPathFromStroke in packages/element/src/shape.ts.
 */
export const getSvgPathFromStroke = (points: number[][]) => {
  if (!points.length) return '';
  const max = points.length - 1;
  const parts: string[] = ['M', fmt(points[0]), 'Q'];
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    if (i === max) {
      parts.push(fmt(point), fmt(med(point, points[0])), 'L', fmt(points[0]), 'Z');
    } else {
      parts.push(fmt(point), fmt(med(point, points[i + 1])));
    }
  }
  return parts.join(' ');
};
export const getFreehandOutline = (points: FreehandPoint[], size: number, options?: FreehandStrokeOptions) => {
  if (!points.length) return [];
  const thinning = options?.thinning ?? EXCALIDRAW_FREEDRAW.thinning;
  const simulatePressure = options?.simulatePressure ?? thinning !== 0;
  return getStroke(points.map(point => [point.x, point.y, point.pressure ?? 0.5] as [number, number, number]), {
    size,
    thinning,
    smoothing: options?.smoothing ?? EXCALIDRAW_FREEDRAW.smoothing,
    streamline: options?.streamline ?? EXCALIDRAW_FREEDRAW.streamline,
    easing: EXCALIDRAW_FREEDRAW.easing,
    simulatePressure,
    last: options?.last ?? true,
    start: {
      cap: options?.start?.cap ?? true,
      taper: options?.start?.taper ?? 0
    },
    end: {
      cap: options?.end?.cap ?? true,
      taper: options?.end?.taper ?? 0
    }
  });
};
export const getFreehandSvgPath = (points: FreehandPoint[], size: number, options?: FreehandStrokeOptions) => {
  const outline = getFreehandOutline(points, size, options);
  return outline.length ? getSvgPathFromStroke(outline) : '';
};
export const getFreehandPath = (points: FreehandPoint[], size: number, options?: FreehandStrokeOptions) => {
  const d = getFreehandSvgPath(points, size, options);
  if (!d) return null;
  return new Path2D(d);
};
export type FreehandShapeGeometry = {
  path: string;
  viewBox: [number, number];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};
const expandViewBox = (minX: number, minY: number, maxX: number, maxY: number, minViewBox: number) => {
  if (maxX - minX < minViewBox) {
    const mid = (minX + maxX) / 2;
    minX = mid - minViewBox / 2;
    maxX = mid + minViewBox / 2;
  }
  if (maxY - minY < minViewBox) {
    const mid = (minY + maxY) / 2;
    minY = mid - minViewBox / 2;
    maxY = mid + minViewBox / 2;
  }
  return {
    minX,
    minY,
    maxX,
    maxY
  };
};
const boundsFromOutline = (outline: number[][]) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of outline) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return {
    minX,
    minY,
    maxX,
    maxY
  };
};
const geometryFromOutlines = (outlines: number[][][], minViewBox = 2): FreehandShapeGeometry | null => {
  const bounds = outlines.reduce<{
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null>((acc, outline) => {
    const next = boundsFromOutline(outline);
    if (!next) return acc;
    if (!acc) return next;
    return {
      minX: Math.min(acc.minX, next.minX),
      minY: Math.min(acc.minY, next.minY),
      maxX: Math.max(acc.maxX, next.maxX),
      maxY: Math.max(acc.maxY, next.maxY)
    };
  }, null);
  if (!bounds) return null;
  const {
    minX,
    minY,
    maxX,
    maxY
  } = expandViewBox(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, minViewBox);
  const path = outlines.map(outline => getSvgPathFromStroke(outline.map(([x, y]) => [x - minX, y - minY]))).filter(Boolean).join(' ');
  if (!path) return null;
  return {
    path,
    viewBox: [maxX - minX, maxY - minY],
    minX,
    minY,
    maxX,
    maxY
  };
};
export const getFreehandShapeGeometry = (points: FreehandPoint[], size: number, options?: FreehandStrokeOptions, minViewBox = 2): FreehandShapeGeometry | null => {
  const outline = getFreehandOutline(points, size, options);
  if (!outline.length) return null;
  return geometryFromOutlines([outline], minViewBox);
};
export const joinFreehandStrokes = (strokes: Array<{
  points: FreehandPoint[];
  size: number;
  options?: FreehandStrokeOptions;
}>, minViewBox = 2): FreehandShapeGeometry | null => {
  const outlines = strokes.map(stroke => getFreehandOutline(stroke.points, stroke.size, stroke.options)).filter(outline => outline.length > 0);
  if (!outlines.length) return null;
  return geometryFromOutlines(outlines, minViewBox);
};
export const joinFreehandOutlines = (outlines: number[][][], minViewBox = 2) => {
  const usable = outlines.filter(outline => outline.length > 0);
  if (!usable.length) return null;
  return geometryFromOutlines(usable, minViewBox);
};
export const fillFreehandStroke = (ctx: CanvasRenderingContext2D, points: FreehandPoint[], size: number, color: string, options?: FreehandStrokeOptions & {
  alpha?: number;
  composite?: GlobalCompositeOperation;
  gradient?: Gradient;
}) => {
  const path = getFreehandPath(points, size, options);
  if (!path) return;
  ctx.save();
  ctx.globalCompositeOperation = options?.composite ?? 'source-over';
  ctx.globalAlpha = options?.alpha ?? 1;
  ctx.fillStyle = options?.gradient ? createCanvasPaint(ctx, {
    color,
    gradient: options.gradient
  }, boundsFromPoints(points, size)) : color;
  ctx.fill(path);
  ctx.restore();
};
