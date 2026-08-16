import type { PPTElement } from '@/types/slides';
import { getElementRange } from '@/utils/element';
import { queryFika } from '@/utils/portal';
import { HitIndex, type HitBox } from '@/utils/spatial/hitIndex';
import { consumePendingCaret, getEditorView, setPendingCaret, type ClientCoords } from '@/utils/prosemirror/caret';
import { isEmptyRichText } from '@/utils/placeholderPaint';

/** Temporary: paint every pointer hit target so the hit engine can be verified. */
export const DEBUG_HIT_AREAS = false;

/** Minimum visual-pixel size so thin lines remain hittable. */
export const MIN_HIT_PX = 8;

/**
 * Drag-ring sizing in visual pixels, based on the box's effective side length.
 *
 * Inner eats the edit surface; outer is extra grab outside the box.
 * Short/zoomed-out boxes shrink inner toward 0 so the whole interior stays editable.
 */
export const MIN_INNER_DRAG_PX = 1;
export const MAX_INNER_DRAG_PX = 4;
export const MIN_OUTER_DRAG_PX = 3;
export const MAX_OUTER_DRAG_PX = 5;
export const MIN_EDIT_INTERIOR_PX = 10;
export const RING_SIZE_MIN = 20;
export const RING_SIZE_MAX = 56;
function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
const clipPathNum = (n: number) => {
  const rounded = Math.round(n * 100) / 100;
  return Object.is(rounded, -0) ? '0' : String(rounded);
};
function rectPath(x: number, y: number, w: number, h: number) {
  return `M${clipPathNum(x)} ${clipPathNum(y)}H${clipPathNum(x + w)}V${clipPathNum(y + h)}H${clipPathNum(x)}Z`;
}

/** Inner/outer drag thickness for one axis (visual width or height). */
export function dragRingMetrics(visualSize: number): {
  innerPx: number;
  outerPx: number;
} {
  const size = Math.max(0, visualSize);
  const t = clamp((size - RING_SIZE_MIN) / (RING_SIZE_MAX - RING_SIZE_MIN), 0, 1);
  const maxInner = Math.max(0, (size - MIN_EDIT_INTERIOR_PX) / 2);
  const desiredInner = size <= RING_SIZE_MIN ? MIN_INNER_DRAG_PX * clamp(size / RING_SIZE_MIN, 0, 1) : lerp(MIN_INNER_DRAG_PX, MAX_INNER_DRAG_PX, t);
  const innerPx = Math.round(Math.min(maxInner, desiredInner));
  const outerPx = Math.round(size <= RING_SIZE_MIN ? MIN_OUTER_DRAG_PX : lerp(MIN_OUTER_DRAG_PX, MAX_OUTER_DRAG_PX, t));
  return {
    innerPx,
    outerPx
  };
}

/** Inward drag thickness on the constraining side (0 when the box is too short to spare any). */
export function borderHitPx(width: number, height: number): number {
  return dragRingMetrics(Math.min(width, height)).innerPx;
}
export const HIT_RING_SIDES = ['top', 'bottom', 'left', 'right'] as const;
export type HitRingSide = (typeof HIT_RING_SIDES)[number];

/** Matches `.resize-handler` (10px box, centered on the edge with -5px margin). */
export const RESIZE_HANDLE_SIZE_PX = 10;
export const RESIZE_HANDLE_RADIUS_PX = RESIZE_HANDLE_SIZE_PX / 2;
export const RESIZE_HANDLE_DIRECTIONS = ['left-top', 'top', 'right-top', 'left', 'right', 'left-bottom', 'bottom', 'right-bottom'] as const;
export type ResizeHandleDirection = (typeof RESIZE_HANDLE_DIRECTIONS)[number];
export interface ResizeHandleCenter {
  x: number;
  y: number;
  direction: ResizeHandleDirection;
}

/** Box-local centers of the 8 resize squares (origin = top-left). */
export function resizeHandleCenters(width: number, height: number, directions: readonly ResizeHandleDirection[] = RESIZE_HANDLE_DIRECTIONS): ResizeHandleCenter[] {
  const wanted = new Set(directions);
  const all: ResizeHandleCenter[] = [{
    direction: 'left-top',
    x: 0,
    y: 0
  }, {
    direction: 'top',
    x: width / 2,
    y: 0
  }, {
    direction: 'right-top',
    x: width,
    y: 0
  }, {
    direction: 'left',
    x: 0,
    y: height / 2
  }, {
    direction: 'right',
    x: width,
    y: height / 2
  }, {
    direction: 'left-bottom',
    x: 0,
    y: height
  }, {
    direction: 'bottom',
    x: width / 2,
    y: height
  }, {
    direction: 'right-bottom',
    x: width,
    y: height
  }];
  return all.filter(handle => wanted.has(handle.direction));
}

/** Handles actually rendered for this element (none for lines). */
export function resizeHandleDirectionsFor(element: PPTElement): readonly ResizeHandleDirection[] {
  if (element.type === 'line') return [];
  if (element.type === 'text') {
    if (element.fixedHeight) return RESIZE_HANDLE_DIRECTIONS;
    return element.vertical ? ['top', 'bottom'] : ['left', 'right'];
  }
  if (element.type === 'shape' && element.text?.fixedHeight === false) return ['left', 'right'];
  return RESIZE_HANDLE_DIRECTIONS;
}
export interface HitRingLayout {
  inset: string;
  sides: Record<HitRingSide, Record<string, string>>;
  vertical: {
    innerPx: number;
    outerPx: number;
  };
  horizontal: {
    innerPx: number;
    outerPx: number;
  };
}
export interface HitRingLayoutOptions {
  /**
   * Cut these handle squares out of the move strips.
   * Resize must beat move: the ring must not claim those pixels.
   */
  clearResizeHandles?: readonly ResizeHandleDirection[];
}
function clipHandlesFromStrip(strip: {
  x: number;
  y: number;
  w: number;
  h: number;
}, handles: ResizeHandleCenter[], radius: number): string | undefined {
  if (strip.w <= 0 || strip.h <= 0) return undefined;
  const size = radius * 2;
  const holes: string[] = [];
  for (const handle of handles) {
    const hx = handle.x - radius;
    const hy = handle.y - radius;
    const ix = Math.max(hx, strip.x);
    const iy = Math.max(hy, strip.y);
    const ix2 = Math.min(hx + size, strip.x + strip.w);
    const iy2 = Math.min(hy + size, strip.y + strip.h);
    if (ix2 <= ix || iy2 <= iy) continue;
    holes.push(rectPath(ix - strip.x, iy - strip.y, ix2 - ix, iy2 - iy));
  }
  if (!holes.length) return undefined;
  return `path(evenodd, "${rectPath(0, 0, strip.w, strip.h)}${holes.join('')}")`;
}

/**
 * Per-side drag strips. Top/bottom follow visual height; left/right follow width.
 * Outer grab does not consume the edit interior.
 * When `clearResizeHandles` is set, handle squares are punched out so move cannot steal resize.
 */
export function hitRingLayout(width: number, height: number, options?: HitRingLayoutOptions): HitRingLayout {
  const vertical = dragRingMetrics(height);
  const horizontal = dragRingMetrics(width);
  const vInner = `${vertical.innerPx}px`;
  const vOuter = `${-vertical.outerPx}px`;
  const vThick = `${vertical.innerPx + vertical.outerPx}px`;
  const hOuter = `${-horizontal.outerPx}px`;
  const hThick = `${horizontal.innerPx + horizontal.outerPx}px`;
  const sides: Record<HitRingSide, Record<string, string>> = {
    top: {
      top: vOuter,
      left: hOuter,
      right: hOuter,
      height: vThick
    },
    bottom: {
      bottom: vOuter,
      left: hOuter,
      right: hOuter,
      height: vThick
    },
    left: {
      top: vInner,
      bottom: vInner,
      left: hOuter,
      width: hThick
    },
    right: {
      top: vInner,
      bottom: vInner,
      right: hOuter,
      width: hThick
    }
  };
  const clear = options?.clearResizeHandles;
  if (clear?.length) {
    const handles = resizeHandleCenters(width, height, clear);
    const strips: Record<HitRingSide, {
      x: number;
      y: number;
      w: number;
      h: number;
    }> = {
      top: {
        x: -horizontal.outerPx,
        y: -vertical.outerPx,
        w: width + horizontal.outerPx * 2,
        h: vertical.innerPx + vertical.outerPx
      },
      bottom: {
        x: -horizontal.outerPx,
        y: height - vertical.innerPx,
        w: width + horizontal.outerPx * 2,
        h: vertical.innerPx + vertical.outerPx
      },
      left: {
        x: -horizontal.outerPx,
        y: vertical.innerPx,
        w: horizontal.innerPx + horizontal.outerPx,
        h: height - vertical.innerPx * 2
      },
      right: {
        x: width - horizontal.innerPx,
        y: vertical.innerPx,
        w: horizontal.innerPx + horizontal.outerPx,
        h: height - vertical.innerPx * 2
      }
    };
    for (const side of HIT_RING_SIDES) {
      const clipPath = clipHandlesFromStrip(strips[side], handles, RESIZE_HANDLE_RADIUS_PX);
      if (clipPath) sides[side].clipPath = clipPath;
    }
  }
  return {
    inset: `${vertical.innerPx}px ${horizontal.innerPx}px`,
    vertical,
    horizontal,
    sides
  };
}
export interface VisualHitRect {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  rotate: number;
  zIndex: number;
  /**
   * Empty placeholder slot (dashed prompt, no authored content). It is a
   * background affordance: any element carrying visible content that
   * overlaps it wins the pointer regardless of z-order — users click the
   * text they SEE, not the dashed frame behind it.
   */
  yieldToContent?: boolean;
}

/** True when the element paints authored content the user can click "on". */
export function elementHasClickableContent(element: PPTElement): boolean {
  if (element.type === 'text') {
    return !element.placeholder || !isEmptyRichText(element.content)
  }
  return true
}

/**
 * Map a slide element to a hit rectangle in `.viewport-wrapper` visual pixels.
 *
 * Hit-testing must never go through the CSS-scaled unsized `.viewport`.
 * That path fragments (glyph boxes, SVG fills) and offsets under zoom.
 */
export function elementVisualHitRect(element: PPTElement, canvasScale: number, zIndex: number): VisualHitRect {
  const yieldToContent = element.type === 'text' && !!element.placeholder && isEmptyRichText(element.content)
  if (element.type === 'line') {
    const { minX, maxX, minY, maxY } = getElementRange(element);
    return {
      id: element.id,
      left: minX * canvasScale,
      top: minY * canvasScale,
      width: Math.max((maxX - minX) * canvasScale, MIN_HIT_PX),
      height: Math.max((maxY - minY) * canvasScale, MIN_HIT_PX),
      rotate: 0,
      zIndex,
      yieldToContent
    };
  }
  const height = 'height' in element ? element.height : 0;
  const rotate = 'rotate' in element ? element.rotate : 0;
  return {
    id: element.id,
    left: element.left * canvasScale,
    top: element.top * canvasScale,
    width: element.width * canvasScale,
    height: height * canvasScale,
    rotate,
    zIndex,
    yieldToContent
  };
}
export function pointInVisualHitRect(x: number, y: number, rect: VisualHitRect): boolean {
  if (!rect.rotate) {
    return x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height;
  }
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const rad = -rect.rotate * Math.PI / 180;
  const dx = x - cx;
  const dy = y - cy;
  const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
  const localY = dx * Math.sin(rad) + dy * Math.cos(rad);
  return Math.abs(localX) <= rect.width / 2 && Math.abs(localY) <= rect.height / 2;
}

function visualHitRectKey(id: string, zIndex: number) {
  return id + '\0' + String(zIndex)
}

function visualHitRectGeometryEqual(a: VisualHitRect, b: VisualHitRect) {
  return a.id === b.id && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height && a.rotate === b.rotate && a.zIndex === b.zIndex
}

function visualHitRectsGeometryEqual(prev: VisualHitRect[], next: VisualHitRect[]) {
  if (prev.length !== next.length) return false
  for (let i = 0; i < next.length; i++) {
    if (!visualHitRectGeometryEqual(prev[i], next[i])) return false
  }
  return true
}

function visualHitRectToBox(rect: VisualHitRect): HitBox {
  const aabb = visualHitAabb(rect)
  return {
    minX: aabb.left,
    minY: aabb.top,
    maxX: aabb.right,
    maxY: aabb.bottom,
    id: rect.id,
    zIndex: rect.zIndex,
  }
}

const visualHitIndex = new HitIndex()
let indexedRects: VisualHitRect[] | null = null
const rectByKey = new Map<string, VisualHitRect>()
const boxByKey = new Map<string, HitBox>()

const clearVisualHitIndex = () => {
  visualHitIndex.clear()
  rectByKey.clear()
  boxByKey.clear()
}

const loadVisualHitIndex = (rects: VisualHitRect[]) => {
  const boxes = rects.map(visualHitRectToBox)
  visualHitIndex.load(boxes)
  rectByKey.clear()
  boxByKey.clear()
  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i]
    const key = visualHitRectKey(rect.id, rect.zIndex)
    rectByKey.set(key, rect)
    boxByKey.set(key, boxes[i])
  }
}

/** Insert/remove only when VisualHitRect geometry identity changes — not on a new array during a gesture. */
const syncVisualHitIndex = (rects: VisualHitRect[]) => {
  if (rects === indexedRects) return
  if (indexedRects && visualHitRectsGeometryEqual(indexedRects, rects)) {
    indexedRects = rects
    for (const rect of rects) {
      rectByKey.set(visualHitRectKey(rect.id, rect.zIndex), rect)
    }
    return
  }
  indexedRects = rects
  if (!rects.length) {
    clearVisualHitIndex()
    return
  }
  if (!boxByKey.size) {
    loadVisualHitIndex(rects)
    return
  }
  const nextKeys = new Set<string>()
  for (const rect of rects) {
    const key = visualHitRectKey(rect.id, rect.zIndex)
    nextKeys.add(key)
    const prev = rectByKey.get(key)
    if (prev && visualHitRectGeometryEqual(prev, rect)) {
      rectByKey.set(key, rect)
      continue
    }
    const prevBox = boxByKey.get(key)
    if (prevBox) visualHitIndex.remove(prevBox)
    const box = visualHitRectToBox(rect)
    visualHitIndex.insert(box)
    boxByKey.set(key, box)
    rectByKey.set(key, rect)
  }
  const staleKeys: string[] = []
  for (const key of boxByKey.keys()) {
    if (!nextKeys.has(key)) staleKeys.push(key)
  }
  for (const key of staleKeys) {
    const box = boxByKey.get(key)
    if (box) visualHitIndex.remove(box)
    boxByKey.delete(key)
    rectByKey.delete(key)
  }
}

function searchIndexedVisualHitRects(minX: number, minY: number, maxX: number, maxY: number): VisualHitRect[] {
  const hits = visualHitIndex.search(minX, minY, maxX, maxY)
  const out: VisualHitRect[] = []
  for (const hit of hits) {
    const rect = rectByKey.get(visualHitRectKey(hit.id, hit.zIndex))
    if (rect) out.push(rect)
  }
  return out
}

/** Topmost rect at a wrapper-local point (highest zIndex wins). RBush AABB, then pointInVisualHitRect refine. */
export function hitTestVisualRects(rects: VisualHitRect[], x: number, y: number): VisualHitRect | null {
  syncVisualHitIndex(rects)
  const candidates = searchIndexedVisualHitRects(x, y, x, y)
  let best: VisualHitRect | null = null
  for (const rect of candidates) {
    if (!pointInVisualHitRect(x, y, rect)) continue
    if (!best || rect.zIndex >= best.zIndex) best = rect
  }
  return best
}
export const TEXT_EDITABLE_TYPES = new Set(['text', 'shape', 'table']);
function shapeHasText(element: PPTElement): boolean {
  if (element.type !== 'shape' || !element.text?.content) return false;
  const plain = element.text.content.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
  return plain.length > 0;
}

/**
 * Clicking the interior opens the text editor. Drag from the border only.
 * Includes text boxes and shapes/tables that already contain text.
 */
export function clicksToEditText(element: PPTElement): boolean {
  if (element.type === 'text' || element.type === 'table') return true;
  return shapeHasText(element);
}

/** Interior stays interactive (text caret, or media playback). Drag from the border. */
export function hasInteractiveSurface(element: PPTElement): boolean {
  return element.type === 'video' || element.type === 'audio' || clicksToEditText(element);
}
export function canEditElementText(type: PPTElement['type']): boolean {
  return TEXT_EDITABLE_TYPES.has(type);
}

function sameIdList(prev: readonly string[], next: readonly string[]): boolean {
  if (prev === next) return true;
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i++) {
    if (prev[i] !== next[i]) return false;
  }
  return true;
}

function samePair(a?: [number, number], b?: [number, number]) {
  if (a === b) return true;
  if (!a || !b) return a === b;
  return a[0] === b[0] && a[1] === b[1];
}

function sameCubic(a?: [[number, number], [number, number]], b?: [[number, number], [number, number]]) {
  if (a === b) return true;
  if (!a || !b) return a === b;
  return samePair(a[0], b[0]) && samePair(a[1], b[1]);
}

/**
 * Geometry / type / ring-vs-body identity for one element.
 * Ignores HTML content except the empty↔text flip that changes hasInteractiveSurface.
 */
export function hitLayerElementUnchanged(prev: PPTElement, next: PPTElement): boolean {
  if (prev === next) return true;
  if (prev.id !== next.id || prev.type !== next.type) return false;
  if (prev.left !== next.left || prev.top !== next.top || prev.width !== next.width) return false;
  if (prev.type === 'line' && next.type === 'line') {
    return samePair(prev.start, next.start) && samePair(prev.end, next.end) && samePair(prev.broken, next.broken) && samePair(prev.broken2, next.broken2) && samePair(prev.curve, next.curve) && sameCubic(prev.cubic, next.cubic);
  }
  const prevHeight = 'height' in prev ? prev.height : 0;
  const nextHeight = 'height' in next ? next.height : 0;
  const prevRotate = 'rotate' in prev ? prev.rotate : 0;
  const nextRotate = 'rotate' in next ? next.rotate : 0;
  if (prevHeight !== nextHeight || prevRotate !== nextRotate) return false;
  return hasInteractiveSurface(prev) === hasInteractiveSurface(next);
}

/** True when element order and per-element hit identity are unchanged. */
export function hitLayerElementsUnchanged(prev: PPTElement[], next: PPTElement[]): boolean {
  if (prev === next) return true;
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i++) {
    if (!hitLayerElementUnchanged(prev[i], next[i])) return false;
  }
  return true;
}

/** Inputs that invalidate HitLayer `hitRects` / `occluderRects` memos. */
export type HitLayerMemoInput = {
  elementList: PPTElement[];
  canvasScale: number;
  hiddenElementIdList: string[];
  activeElementIdList: string[];
  editingElementId: string | null;
  clipingImageElementId: string;
  disabled: boolean;
};

export type VisualHitPlanInput = {
  elementList: PPTElement[];
  canvasScale: number;
  hiddenElementIdList: Iterable<string>;
  activeElementIdList: Iterable<string>;
  editingElementId: string | null;
  clipingImageElementId: string;
};

export type VisualHitPlan = {
  hitRects: VisualHitRect[];
  occluderRects: VisualHitRect[];
  /** Rects of elements painting authored content — they beat empty placeholder slots. */
  contentRects: VisualHitRect[];
};

/**
 * Selected / editing / clipping boxes leave HitLayer so Operate or the live
 * editor can own the pointer. Those boxes must still punch holes in every
 * *lower* hit rect — otherwise the first click works, then hover/click/drag
 * fall through to the card underneath. Empty placeholder slots additionally
 * yield to ANY overlapping content rect regardless of z-order.
 */
export function collectVisualHitPlan(input: VisualHitPlanInput): VisualHitPlan {
  const hidden = input.hiddenElementIdList instanceof Set ? input.hiddenElementIdList : new Set(input.hiddenElementIdList);
  const selected = input.activeElementIdList instanceof Set ? input.activeElementIdList : new Set(input.activeElementIdList);
  const hitRects: VisualHitRect[] = [];
  const occluderRects: VisualHitRect[] = [];
  const contentRects: VisualHitRect[] = [];
  for (let i = 0; i < input.elementList.length; i++) {
    const element = input.elementList[i];
    if (hidden.has(element.id)) continue;
    const rect = elementVisualHitRect(element, input.canvasScale, i + 1);
    const occupiesBox = element.id === input.editingElementId
      || element.id === input.clipingImageElementId
      || selected.has(element.id) && element.type !== 'line';
    if (elementHasClickableContent(element)) contentRects.push(rect);
    if (occupiesBox) {
      occluderRects.push(rect);
      continue;
    }
    hitRects.push(rect);
  }
  return { hitRects, occluderRects, contentRects };
}

export function pointInAnyVisualHitRect(x: number, y: number, rects: VisualHitRect[]): boolean {
  for (const rect of rects) {
    if (pointInVisualHitRect(x, y, rect)) return true;
  }
  return false;
}

/** Occluders that sit on top of `rect` (same stack level included). Empty placeholder slots yield to every occluder. */
export function occludersAboveRect(rect: VisualHitRect, occluders: VisualHitRect[]): VisualHitRect[] {
  if (rect.yieldToContent) {
    return occluders.filter(hole => hole.id !== rect.id)
  }
  return occluders.filter(hole => hole.id !== rect.id && hole.zIndex >= rect.zIndex);
}

/**
 * Skip rebuilding hit rects when only HTML content changed,
 * or the lists are reference-equal.
 */
export function hitLayerSkipRebuild(prev: HitLayerMemoInput, next: HitLayerMemoInput): boolean {
  if (prev.disabled !== next.disabled) return false;
  if (prev.canvasScale !== next.canvasScale) return false;
  if (prev.editingElementId !== next.editingElementId) return false;
  if (prev.clipingImageElementId !== next.clipingImageElementId) return false;
  if (!sameIdList(prev.hiddenElementIdList, next.hiddenElementIdList)) return false;
  if (!sameIdList(prev.activeElementIdList, next.activeElementIdList)) return false;
  return hitLayerElementsUnchanged(prev.elementList, next.elementList);
}
function localPointInRect(x: number, y: number, rect: VisualHitRect): {
  x: number;
  y: number;
} {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = x - cx;
  const dy = y - cy;
  if (!rect.rotate) return {
    x: dx,
    y: dy
  };
  const rad = -rect.rotate * Math.PI / 180;
  return {
    x: dx * Math.cos(rad) - dy * Math.sin(rad),
    y: dx * Math.sin(rad) + dy * Math.cos(rad)
  };
}

/** Canvas-space corners of a (possibly rotated) hit rect. */
export function visualHitCorners(rect: VisualHitRect): {
  x: number;
  y: number;
}[] {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const hw = rect.width / 2;
  const hh = rect.height / 2;
  const locals = [{
    x: -hw,
    y: -hh
  }, {
    x: hw,
    y: -hh
  }, {
    x: hw,
    y: hh
  }, {
    x: -hw,
    y: hh
  }];
  if (!rect.rotate) return locals.map(p => ({
    x: cx + p.x,
    y: cy + p.y
  }));
  const rad = rect.rotate * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return locals.map(p => ({
    x: cx + p.x * cos - p.y * sin,
    y: cy + p.x * sin + p.y * cos
  }));
}
export function visualHitRectsOverlap(a: VisualHitRect, b: VisualHitRect): boolean {
  const aAabb = visualHitAabb(a);
  const bAabb = visualHitAabb(b);
  return aAabb.left < bAabb.right && aAabb.right > bAabb.left && aAabb.top < bAabb.bottom && aAabb.bottom > bAabb.top;
}
export function visualHitIntersectsBox(rect: VisualHitRect, box: {
  left: number;
  top: number;
  width: number;
  height: number;
}): boolean {
  if (!(box.width > 0) || !(box.height > 0)) return false;
  const aabb = visualHitAabb(rect);
  return aabb.left < box.left + box.width && aabb.right > box.left && aabb.top < box.top + box.height && aabb.bottom > box.top;
}

/** Elements whose visual hit rect intersects a wrapper-space marquee. */
export function elementIdsIntersectingSelection(elements: PPTElement[], box: {
  left: number;
  top: number;
  width: number;
  height: number;
}, canvasScale: number, hiddenIds: Iterable<string> = []): string[] {
  const hidden = hiddenIds instanceof Set ? hiddenIds : new Set(hiddenIds);
  const hitIds = new Set<string>();
  const hitGroups = new Set<string>();
  if (!(box.width > 0) || !(box.height > 0)) return [];
  const rects: VisualHitRect[] = [];
  const elementById = new Map<string, PPTElement>();
  for (let i = 0; i < elements.length; i++) {
    const element = elements[i];
    if (hidden.has(element.id) || element.lock) continue;
    const rect = elementVisualHitRect(element, canvasScale, i + 1);
    rects.push(rect);
    elementById.set(element.id, element);
  }
  syncVisualHitIndex(rects);
  const candidates = searchIndexedVisualHitRects(box.left, box.top, box.left + box.width, box.top + box.height);
  for (const rect of candidates) {
    if (!visualHitIntersectsBox(rect, box)) continue;
    const element = elementById.get(rect.id);
    if (!element) continue;
    hitIds.add(element.id);
    if (element.groupId) hitGroups.add(element.groupId);
  }
  if (hitGroups.size) {
    for (const element of elements) {
      if (!element.groupId || !hitGroups.has(element.groupId)) continue;
      if (hidden.has(element.id) || element.lock) continue;
      hitIds.add(element.id);
    }
  }
  return elements.filter(element => hitIds.has(element.id)).map(element => element.id);
}
export function visualHitAabb(rect: VisualHitRect) {
  if (!rect.rotate) {
    return {
      left: rect.left,
      top: rect.top,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height
    };
  }
  const corners = visualHitCorners(rect);
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const corner of corners) {
    left = Math.min(left, corner.x);
    top = Math.min(top, corner.y);
    right = Math.max(right, corner.x);
    bottom = Math.max(bottom, corner.y);
  }
  return {
    left,
    top,
    right,
    bottom
  };
}

/**
 * Clip a hit rect so a higher selected/editing box can keep the pointer.
 * HitLayer sits above the viewport; without this hole, lower cards steal
 * hover/click/drag after the top element leaves the hit layer.
 */
export function hitRectClipPath(rect: VisualHitRect, occluders: VisualHitRect[]): string | undefined {
  const holes = occludersAboveRect(rect, occluders).filter(hole => visualHitRectsOverlap(rect, hole));
  if (!holes.length) return undefined;
  const parts = [`M0 0H${clipPathNum(rect.width)}V${clipPathNum(rect.height)}H0Z`];
  for (const hole of holes) {
    const corners = visualHitCorners(hole).map(point => {
      const local = localPointInRect(point.x, point.y, rect);
      return {
        x: local.x + rect.width / 2,
        y: local.y + rect.height / 2
      };
    });
    parts.push(`M${clipPathNum(corners[0].x)} ${clipPathNum(corners[0].y)}` + corners.slice(1).map(corner => `L${clipPathNum(corner.x)} ${clipPathNum(corner.y)}`).join('') + 'Z');
  }
  return `path(evenodd, "${parts.join('')}")`;
}

/** True when the wrapper-local point sits on a resize handle square. */
export function isPointOnResizeHandle(x: number, y: number, rect: VisualHitRect, directions: readonly ResizeHandleDirection[] = RESIZE_HANDLE_DIRECTIONS): boolean {
  if (!directions.length) return false;
  const local = localPointInRect(x, y, rect);
  const lx = local.x + rect.width / 2;
  const ly = local.y + rect.height / 2;
  const r = RESIZE_HANDLE_RADIUS_PX;
  for (const handle of resizeHandleCenters(rect.width, rect.height, directions)) {
    if (Math.abs(lx - handle.x) <= r && Math.abs(ly - handle.y) <= r) return true;
  }
  return false;
}

/** True when the wrapper-local point sits on the inward drag border, not the edit interior. */
export function isPointOnVisualBorder(x: number, y: number, rect: VisualHitRect, options?: {
  clearResizeHandles?: readonly ResizeHandleDirection[];
}): boolean {
  if (options?.clearResizeHandles?.length && isPointOnResizeHandle(x, y, rect, options.clearResizeHandles)) {
    return false;
  }
  const vertical = dragRingMetrics(rect.height);
  const horizontal = dragRingMetrics(rect.width);
  if (vertical.innerPx <= 0 && horizontal.innerPx <= 0) return false;
  if (!pointInVisualHitRect(x, y, rect)) return false;
  const local = localPointInRect(x, y, rect);
  const distLeft = local.x + rect.width / 2;
  const distRight = rect.width / 2 - local.x;
  const distTop = local.y + rect.height / 2;
  const distBottom = rect.height / 2 - local.y;
  return horizontal.innerPx > 0 && (distLeft <= horizontal.innerPx || distRight <= horizontal.innerPx) || vertical.innerPx > 0 && (distTop <= vertical.innerPx || distBottom <= vertical.innerPx);
}
export type OperateHitTarget = 'resize' | 'move' | 'edit' | null;

/**
 * Selected-element hit kind. Resize handles beat the move ring; the move ring
 * beats the edit interior. Used as the source of truth for operate-layer stacking.
 */
export function hitTestOperateTarget(x: number, y: number, rect: VisualHitRect, options: {
  interactive: boolean;
  handles?: readonly ResizeHandleDirection[];
}): OperateHitTarget {
  const handles = options.handles ?? [];
  if (handles.length && isPointOnResizeHandle(x, y, rect, handles)) return 'resize';
  if (options.interactive) {
    if (isPointOnVisualBorder(x, y, rect, {
      clearResizeHandles: handles
    })) return 'move';
    if (pointInVisualHitRect(x, y, rect)) return 'edit';
    return null;
  }
  if (pointInVisualHitRect(x, y, rect)) return 'move';
  return null;
}
export function retryPendingCaret(elementId: string) {
  const view = getEditorView(elementId);
  if (view) consumePendingCaret(elementId, view);
}
function focusTableCell(root: HTMLElement, coords?: ClientCoords) {
  if (!root.querySelector('[data-cell-index]')) return;
  const active = root.querySelector('.cell-text.active');
  if (active instanceof HTMLElement) {
    active.focus();
    return;
  }
  let cell: HTMLElement | null = null;
  if (coords) {
    for (const el of document.elementsFromPoint(coords.left, coords.top)) {
      if (!root.contains(el)) continue;
      const host = el.closest('[data-cell-index]');
      if (host instanceof HTMLElement) {
        cell = host;
        break;
      }
    }
  }
  if (!cell) cell = root.querySelector('[data-cell-index]');
  if (!cell) return;
  cell.dispatchEvent(new MouseEvent('mousedown', {
    bubbles: true,
    cancelable: true,
    view: window,
    button: 0,
    buttons: 1,
    clientX: coords?.left,
    clientY: coords?.top,
  }));
  requestAnimationFrame(() => {
    const text = root.querySelector('.cell-text.active');
    if (text instanceof HTMLElement) text.focus();
  });
}

export function focusElementEditor(elementId: string, coords?: ClientCoords) {
  if (coords) setPendingCaret(elementId, coords);
  const root = queryFika(`#editable-element-${elementId}`);
  if (!(root instanceof HTMLElement)) return;
  const content = root.querySelector('.element-content');
  if (content instanceof HTMLElement) {
    content.dispatchEvent(new MouseEvent('dblclick', {
      bubbles: true,
      cancelable: true
    }));
  }
  const apply = () => {
    const view = getEditorView(elementId);
    const editor = root.querySelector('.ProseMirror');
    if (editor instanceof HTMLElement) editor.focus();
    if (view) consumePendingCaret(elementId, view);
    focusTableCell(root, coords);
  };
  apply();
  requestAnimationFrame(apply);
}
export type { ClientCoords };
